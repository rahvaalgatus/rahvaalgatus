var respondFor = require("root/test/fixtures").respondFor
var wait = require("root/lib/promise").wait
var UUID = "5f9a82a5-e815-440b-abe9-d17311b0b366"

describe("EventsController", function() {
	require("root/test/web")()
	require("root/test/mitm")()

	describe("POST", function() {
		it("must create event given token", function*() {
			this.mitm.on("request", respondFor.bind(null, `/topics/${UUID}?`, {
				data: {
					id: UUID,
					status: "followUp",
					description: "<body><h1>My thoughts.</h1></body>",
					creator: {name: "John"},
					permission: {level: "read"}
				}
			}))

			var res = this.request(`/initiatives/${UUID}/events`, {
				method: "POST",
				headers: {Cookie: "csrf_token=ABC"},
				form: {
					_csrf_token: "ABC",
					token: "FOOBAR",
					subject: "Finished!",
					text: "All good.",
				}
			})

			var req, next = wait.bind(null, this.mitm, "request")
			while ((req = yield next()) && req.method !== "POST");
			req.method.must.equal("POST")
			req.url.must.equal(`/api/topics/${UUID}/events`)
			req.headers.authorization.must.equal("Bearer FOOBAR")

			var body = JSON.parse(req.read())
			body.must.eql({subject: "Finished!", text: "All good."})
			req.res.end()

			res = yield res
			res.statusCode.must.equal(303)
		})
	})
})
