var Config = require("root/config")

describe("Adm", function() {
	require("root/test/adm")()
	require("root/test/db")()

	describe("/", function() {
		describe("when not logged in", function() {
			it("must respond with 401", function*() {
				var res = yield this.request(`/`)
				res.statusCode.must.equal(401)
				res.statusMessage.must.equal("Not an Admin")
			})
		})

		describe("when logged in", function() {
			require("root/test/db")()
			signInAsAdmin()

			it("must respond with cache headers", function*() {
				var res = yield this.request("/")
				res.statusCode.must.equal(200)

				res.headers["cache-control"].must.equal("no-cache")
				res.headers.must.have.property("etag")
				res.headers.must.not.have.property("last-modified")
				res.headers.must.not.have.property("expires")
			})
		})
	})

	describe("/non-existent", function() {
		describe("when not logged in", function() {
			it("must respond with 401", function*() {
				var res = yield this.request("/non-exitent")
				res.statusCode.must.equal(401)
				res.statusMessage.must.equal("Not an Admin")
			})
		})

		describe("when logged in", function() {
			require("root/test/db")()
			signInAsAdmin()

			it("must respond with 404", function*() {
				var res = yield this.request("/non-exitent")
				res.statusCode.must.equal(404)

				res.headers["cache-control"].must.equal("no-cache")
				res.headers.must.not.have.property("etag")
				res.headers.must.not.have.property("last-modified")
				res.headers.must.not.have.property("expires")
			})
		})
	})
})

function signInAsAdmin() {
	require("root/test/fixtures").user({
		country: Config.adminPersonalIds[0].slice(0, 2),
		personal_id: Config.adminPersonalIds[0].slice(2)
	})
}
