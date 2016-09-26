describe("Web server", function() {
	require("root/test/web")()

	describe("/", function() {
		it("must respond with 200 OK", function*() {
			var res = yield this.request("/", {method: "HEAD"})
			res.statusCode.must.equal(200)
		})
	})
})
