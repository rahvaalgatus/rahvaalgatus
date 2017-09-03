var Url = require("url")
var Config = require("root/config")

describe("DonationsController", function() {
	require("root/test/web")()
	require("root/test/mitm")()

	describe("GET /donate", function() {
		it("must respond with 200 OK", function*() {
			var res = yield this.request("/donate")
			res.statusCode.must.equal(200)
			res.body.must.include("Maksekeskus")
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
					amount: 10
				}
			})

			res.statusCode.must.equal(302)
			var url = Url.parse(res.headers.location, true)
			url.host.must.equal("payment.maksekeskus.ee")
			url.query.amount.must.equal("10")
			url.query.shopId.must.equal(Config.maksekeskusId)
			url.query.paymentId.must.equal("default=5")
		})
	})

	describe("GET /donated", function() {
		it("must respond with 200 OK", function*() {
			var res = yield this.request("/donated")
			res.statusCode.must.equal(200)
			res.body.must.include("Täname toetuse")
		})
	})
})
