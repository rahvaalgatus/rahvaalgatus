var Config = require("root/config")

describe("Adm", function() {
	require("root/test/adm")()
	require("root/test/db")()

	describe("/", function() {
		describe("when logged in", function() {
			require("root/test/db")()

			require("root/test/fixtures").user({
				country: Config.adminPersonalIds[0].slice(0, 2),
				personal_id: Config.adminPersonalIds[0].slice(2)
			})

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
})
