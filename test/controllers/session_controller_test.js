var _ = require("lodash")
var Url = require("url")
var Config = require("root/config")
var Cookie = require("tough-cookie").Cookie
var Crypto = require("crypto")
var fetchDefaults = require("fetch-defaults")
var PATH = "/session/new"
var AUTHORIZE_URL = Config.apiAuthorizeUrl
var CSRF_COOKIE_NAME = "authenticity_token_for_citizenos"
var CSRF_COOKIE_PATH = "/session"

describe("SessionController", function() {
	require("root/test/web")()

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

			var cookie = Cookie.parse(res.headers["set-cookie"][0])
			cookie.key.must.equal(CSRF_COOKIE_NAME)
			cookie.path.must.equal(CSRF_COOKIE_PATH)
			cookie.value.must.have.length(32)
			cookie.httpOnly.must.be.true()
			cookie.expires.must.be.equal("Infinity")
			url.query.state.must.equal(cookie.value)
		})
	})

	describe("GET /new with code", function() {
		beforeEach(authorize)

		it("must set token cookie", function*() {
			var res = yield this.request(this.url + "&access_token=123456")
			res.statusCode.must.equal(302)
			res.headers.location.must.equal("/")

			var cookies = _.keyBy(res.headers["set-cookie"].map(Cookie.parse), "key")
			cookies.citizenos_token.path.must.equal("/")
			cookies.citizenos_token.value.must.equal("123456")
			cookies.citizenos_token.httpOnly.must.be.false()
		})

		it("must respond with 412 given no CSRF token in query", function*() {
			var res = yield this.request(PATH + "?access_token=123456")
			res.statusCode.must.equal(412)
		})

		it("must respond with 412 given mismatching CSRF tokens", function*() {
			var res = yield this.request(this.url + "&access_token=123456", {
				headers: {Cookie: "authenticity_token_for_citizenos=42"}
			})

			res.statusCode.must.equal(412)
		})
	})

	describe("GET /new with error", function() {
		it("must respond with 412 given no CSRF token", function*() {
			var res = yield this.request(PATH + "?error=access_denied")
			res.statusCode.must.equal(412)
		})
	})
})

function authorize() {
	var token = rand(16)
	this.url = PATH + "?state=" + token

	this.request = fetchDefaults(this.request, {
		headers: {Cookie: "authenticity_token_for_citizenos=" + token}
	})
}

function rand(length) { return Crypto.randomBytes(length).toString("hex") }
