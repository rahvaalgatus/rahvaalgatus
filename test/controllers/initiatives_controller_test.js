var respond = require("root/test/fixtures").respond

describe("InitiativesController", function() {
	require("root/test/web")()
	require("root/test/mitm")()

	describe("GET /initiatives/:id", function() {
		describe("when not logged in", function() {
			it("must render discussion", function*() {
				var uuid = "5f9a82a5-e815-440b-abe9-d17311b0b366"

				this.mitm.on("request", respond.bind(null, `/topics/${uuid}?`, {data: {
					id: uuid,
					status: "inProgress",
					description: "<body><h1>My thoughts.</h1></body>",
					creator: {name: "John"},
					permission: {level: "read"}
				}}))

				this.mitm.on("request", respond.bind(null, `/topics/${uuid}/comments`, {
					data: {rows: []}
				}))

				var res = yield this.request("/initiatives/" + uuid)
				res.statusCode.must.equal(200)
			})
		})
	})
})
