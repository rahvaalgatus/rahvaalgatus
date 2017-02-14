var respond = require("root/test/fixtures").respond

describe("HomeController", function() {
	require("root/test/web")()
	require("root/test/mitm")()

	describe("/", function() {
		it("must respond with 200 OK", function*() {
			this.mitm.on("request", respond.bind(null, "/topics", {data: {rows: []}}))
			var res = yield this.request("/")
			res.statusCode.must.equal(200)
		})
	})
})
