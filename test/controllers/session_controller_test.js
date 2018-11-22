var _ = require("lodash")
var Url = require("url")
var Config = require("root/config")
var Cookie = require("tough-cookie").Cookie
var pseudoHex = require("root/lib/crypto").pseudoHex
var fetchDefaults = require("fetch-defaults")
var respond = require("root/test/fixtures").respond
var encode = encodeURIComponent
var decode = decodeURIComponent
var PATH = "/session/new"
var HEADERS = {"Content-Type": "application/json"}
var UUID = "5f9a82a5-e815-440b-abe9-d17311b0b366"
var AUTHORIZE_URL = Config.apiAuthorizeUrl
var TOKEN_COOKIE_NAME = "citizenos_token"
var CSRF_COOKIE_NAME = "csrf_token_for_citizenos"
var CSRF_COOKIE_PATH = "/session"
var REFERRER_COOKIE_NAME = "session_referrer"

describe("SessionController", function() {
	require("root/test/web")()
	require("root/test/mitm")()
	beforeEach(require("root/test/mitm").router)

	describe("GET /new", function() {
		it("must redirect to Citizen OS", function*() {
			var res = yield this.request("/session/new")
			res.statusCode.must.equal(302)

			var url = Url.parse(res.headers.location, true)
			res.headers.location.must.include(AUTHORIZE_URL)
			url.query.client_id.must.equal(Config.apiPartnerId)
			url.query.redirect_uri.must.equal(`${this.url}${PATH}?unhash`)
			url.query.response_type.must.equal("id_token token")
			url.query.scope.must.equal("openid")
			url.query.ui_locales.must.equal("et")
		})

		it("must set CSRF token cookie", function*() {
			var res = yield this.request("/session/new")
			var url = Url.parse(res.headers.location, true)

			var cookies = parseCookies(res.headers["set-cookie"])
			var cookie = cookies[CSRF_COOKIE_NAME]
			cookie.path.must.equal(CSRF_COOKIE_PATH)
			cookie.value.must.have.length(32)
			cookie.httpOnly.must.be.true()
			cookie.expires.must.be.equal("Infinity")
			url.query.state.must.equal(cookie.value)
		})

		it("must set session referrer cookie", function*() {
			var res = yield this.request("/session/new", {
				headers: {Referer: this.url + "/foo"}
			})

			var cookies = parseCookies(res.headers["set-cookie"])
			var cookie = cookies[REFERRER_COOKIE_NAME]
			decode(cookie.value).must.equal(this.url + "/foo")
		})

		it("must not set session referrer cookie if referred from outside",
			function*() {
			var res = yield this.request("/session/new", {
				headers: {Referer: "http://example.com/evil"}
			})

			var cookies = parseCookies(res.headers["set-cookie"])
			cookies.must.not.have.property(REFERRER_COOKIE_NAME)
		})
	})

	describe("GET /new with code", function() {
		beforeEach(authorize)

		it("must set token cookie", function*() {
			var res = yield this.request(this.path + "&access_token=123456")
			res.statusCode.must.equal(302)
			res.headers.location.must.equal("/")

			var cookies = parseCookies(res.headers["set-cookie"])
			cookies[TOKEN_COOKIE_NAME].path.must.equal("/")
			cookies[TOKEN_COOKIE_NAME].value.must.equal("123456")
			cookies[TOKEN_COOKIE_NAME].domain.must.equal(Config.cookieDomain)
			cookies[TOKEN_COOKIE_NAME].httpOnly.must.be.true()
		})

		// This is for production where the CitizenOS instance sets the cookie.
		it("must not overwrite token cookie", function*() {
			this.router.get("/api/auth/status", respond.bind(null, {data: {
				id: UUID
			}}))

			var res = yield this.request(this.path + "&access_token=123456", {
				headers: {Cookie: serializeCookies({
					[CSRF_COOKIE_NAME]: this.csrfToken,
					[TOKEN_COOKIE_NAME]: "7890"
				})}
			})

			res.statusCode.must.equal(302)
			res.headers.location.must.equal("/")
			var cookies = parseCookies(res.headers["set-cookie"])
			cookies.must.not.have.property(TOKEN_COOKIE_NAME)
		})

		it("must redirect to session referrer cookie path", function*() {
			var res = yield this.request(this.path + "&access_token=123456", {
				headers: {Cookie: serializeCookies({
					[CSRF_COOKIE_NAME]: this.csrfToken,
					[REFERRER_COOKIE_NAME]: this.url + "/foo"
				})}
			})

			res.statusCode.must.equal(302)
			res.headers.location.must.equal(this.url + "/foo")
		})

		it("must respond with 412 given no CSRF token in query", function*() {
			var res = yield this.request(PATH + "?access_token=123456")
			res.statusCode.must.equal(412)
		})

		it("must respond with 412 given mismatching CSRF tokens", function*() {
			var res = yield this.request(this.path + "&access_token=123456", {
				headers: {Cookie: `${CSRF_COOKIE_NAME}=42`}
			})

			res.statusCode.must.equal(412)
		})
	})

	describe("GET /new with error", function() {
		beforeEach(authorize)

		it("must respond with 412 given no CSRF token", function*() {
			var res = yield this.request(PATH + "?error=access_denied")
			res.statusCode.must.equal(412)
		})

		it("must redirect to home page if access_denied", function*() {
			var res = yield this.request(this.path + "&error=access_denied")
			res.statusCode.must.equal(302)
			res.headers.location.must.equal("/")
		})

		it("must redirect to referrer path if access_denied", function*() {
			var token = pseudoHex(16)
			var path = `${PATH}?state=${token}&error=access_denied`
			var res = yield this.request(path, {
				headers: {Cookie: serializeCookies({
					[CSRF_COOKIE_NAME]: token,
					[REFERRER_COOKIE_NAME]: this.url + "/foo"
				})}
			})

			res.statusCode.must.equal(302)
			res.headers.location.must.equal(this.url + "/foo")
		})
	})

	describe("DELETE /", function() {
		it("must delete token", function*() {
			this.mitm.on("request", function(req, res) {
				switch (req.url) {
					case "/api/auth/status":
						res.writeHead(200, HEADERS)
						res.end(JSON.stringify({data: {id: UUID}}))
						break
				}
			})

			var res = yield this.request("/session", {
				method: "POST",
				headers: {Cookie: "citizenos_token=12345;csrf_token=54321"},
				form: {_method: "delete", _csrf_token: 54321}
			})

			res.statusCode.must.equal(302)
			res.headers.location.must.equal("/")

			var cookie = Cookie.parse(res.headers["set-cookie"][0])
			cookie.key.must.equal(TOKEN_COOKIE_NAME)
			cookie.expires.must.be.lt(new Date)
		})
	})
})

function authorize() {
	var csrfToken = pseudoHex(16)
	this.csrfToken = csrfToken
	this.path = PATH + "?state=" + csrfToken

	this.request = fetchDefaults(this.request, {
		headers: {Cookie: `${CSRF_COOKIE_NAME}=${csrfToken}`}
	})
}

function parseCookies(header) {
	return _.keyBy(header.map(Cookie.parse), "key")
}

function serializeCookies(obj) {
	return _.map(obj, (value, name) => `${name}=${encode(value)}`).join("; ")
}
