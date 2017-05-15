var respondFor = require("root/test/fixtures").respondFor

describe("HomeController", function() {
	require("root/test/web")()
	require("root/test/mitm")()

	describe("/", function() {
		it("must respond with 200 OK", function*() {
			this.mitm.on("request", respondFor.bind(null, "/topics", {
				data: {rows: []}
			}))

			var res = yield this.request("/")
			res.statusCode.must.equal(200)
		})
	})
})
