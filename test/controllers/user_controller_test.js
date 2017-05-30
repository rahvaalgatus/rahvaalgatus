describe("UserController", function() {
	require("root/test/web")()
	require("root/test/mitm")()

	describe("GET /", function() {
		describe("when not logged in", function() {
			it("must respond with 401 Unauthorized", function*() {
				var res = yield this.request("/user")
				res.statusCode.must.equal(401)
			})
		})
	})
})
