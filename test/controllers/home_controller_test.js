var Mitm = require("mitm")
var HEADERS = {"Content-Type": "application/json"}

describe("HomeController", function() {
	require("root/test/web")()
	beforeEach(function() { this.mitm = Mitm() })
	afterEach(function() { this.mitm.disable() })

	describe("/", function() {
		it("must respond with 200 OK", function*() {
			this.mitm.on("request", respondWith.bind(null, []))
			var res = yield this.request("/", {method: "HEAD"})
			res.statusCode.must.equal(200)
		})
	})
})

function respondWith(initiatives, req, res) {
	res.writeHead(200, HEADERS)
	res.end(JSON.stringify({data: initiatives}))
}
