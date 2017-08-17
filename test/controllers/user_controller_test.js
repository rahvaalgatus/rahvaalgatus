var Url = require("url")
var respond = require("root/test/fixtures").respond

describe("UserController", function() {
	require("root/test/web")()
	require("root/test/mitm")()
	beforeEach(require("root/test/mitm").router)

	describe("GET /", function() {
		describe("when not logged in", function() {
			it("must respond with 401 Unauthorized", function*() {
				var res = yield this.request("/user")
				res.statusCode.must.equal(401)
			})
		})

		describe("when logged in", function() {
			require("root/test/fixtures").user()

			it("must request initiatives", function*() {
				var requested = 0
				this.router.get("/api/users/self/topics", function(req, res) {
					++requested
					var query = Url.parse(req.url, true).query
					query["include[]"].must.be.a.permutationOf(["vote", "event"])
					respond({data: {rows: []}}, req, res)
				})

				var res = yield this.request("/user")
				res.statusCode.must.equal(200)
				requested.must.equal(1)
			})
		})
	})
})
