var Url = require("url")
var Config = require("root/config")
var SITE_HOSTNAME = Url.parse(Config.url).hostname
var PARLIAMENT_SITE_HOSTNAME = Url.parse(Config.parliamentSiteUrl).hostname
var LOCAL_SITE_HOSTNAME = Url.parse(Config.localSiteUrl).hostname

describe("DonationsController", function() {
	require("root/test/web")()
	require("root/test/mitm")()

	describe("GET /donate", function() {
		it("must respond with 200 OK", function*() {
			var res = yield this.request("/donate")
			res.statusCode.must.equal(200)
			res.body.must.include("Maksekeskus")
		})

		;[PARLIAMENT_SITE_HOSTNAME, LOCAL_SITE_HOSTNAME].forEach(function(host) {
			it(`must redirect to ${SITE_HOSTNAME} from ${host}`, function*() {
				var path = "/donate?foo=bar"
				var res = yield this.request(path, {headers: {Host: host}})
				res.statusCode.must.equal(301)
				res.headers.location.must.equal(Config.url + path)
			})
		})
	})

	describe("GET /donations/new", function() {
		it("must respond with 200 OK", function*() {
			var res = yield this.request("/donations/new")
			res.statusCode.must.equal(200)
			res.body.must.include("Maksekeskus")
		})
	})

	describe("POST /donations", function() {
		require("root/test/fixtures").csrf()

		it("must redirect", function*() {
			var res = yield this.request("/donations", {
				method: "POST",

				form: {
					_csrf_token: this.csrfToken,
					default: 5,
					amount: 10,
					person: "11412090004"
				}
			})

			res.statusCode.must.equal(302)
			var url = Url.parse(res.headers.location, true)
			url.host.must.equal("payment.maksekeskus.ee")
			url.query.donate.must.equal("true")
			url.query.amount.must.equal("10")
			url.query.shopId.must.equal(Config.maksekeskusId)
			url.query.paymentId.must.equal("default=5 person=11412090004")
		})
	})

	describe("GET /donated", function() {
		it("must respond with 200 OK", function*() {
			var res = yield this.request("/donated")
			res.statusCode.must.equal(200)
			res.body.must.include("Täname toetuse")
		})

		;[PARLIAMENT_SITE_HOSTNAME, LOCAL_SITE_HOSTNAME].forEach(function(host) {
			it(`must redirect to ${SITE_HOSTNAME} from ${host}`, function*() {
				var path = "/donated?foo=bar"
				var res = yield this.request(path, {headers: {Host: host}})
				res.statusCode.must.equal(301)
				res.headers.location.must.equal(Config.url + path)
			})
		})
	})
})
