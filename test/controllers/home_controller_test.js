var respond = require("root/test/fixtures").respond

describe("HomeController", function() {
	require("root/test/web")()
	require("root/test/mitm")()
	beforeEach(require("root/test/mitm").router)

	describe("/", function() {
		it("must respond with 200 OK", function*() {
			this.router.get("/api/topics", respond.bind(null, {data: {rows: []}}))
			var res = yield this.request("/")
			res.statusCode.must.equal(200)
		})
	})
})
