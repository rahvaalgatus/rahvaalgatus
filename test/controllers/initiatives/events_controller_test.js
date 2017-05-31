var respond = require("root/test/fixtures").respond
var UUID = "5f9a82a5-e815-440b-abe9-d17311b0b366"

var INITIATIVE = {
	id: UUID,
	status: "followUp",
	description: "<body><h1>My thoughts.</h1></body>",
	creator: {name: "John"},
	permission: {level: "read"}
}

describe("InitiativeEventsController", function() {
	require("root/test/web")()
	require("root/test/mitm")()
	beforeEach(require("root/test/mitm").router)

	describe("GET /", function() {
		describe("when not logged in", function() {
			it("must request events", function*() {
				this.router.get(`/api/topics/${UUID}`, respond.bind(null, {
					data: INITIATIVE
				}))

				this.router.get(`/api/topics/${UUID}/events`, function(req, res) {
					req.headers.must.not.have.property("authorization")
					respond({data: {rows: []}}, req, res)
				})

				var res = yield this.request(`/initiatives/${UUID}/events`)
				res.statusCode.must.equal(200)
			})
		})

		describe("when logged in", function() {
			require("root/test/fixtures").user()

			// This was a bug on Apr 27, 2017 where requests for signed-in users were
			// not using the authorized API function.
			it("must request events", function*() {
				this.router.get(`/api/users/self/topics/${UUID}`, respond.bind(null, {
					data: INITIATIVE
				}))

				this.router.get(`/api/users/self/topics/${UUID}/events`, function(req, res) {
					req.headers.authorization.must.exist()
					respond({data: {rows: []}}, req, res)
				})

				var res = yield this.request(`/initiatives/${UUID}/events`)
				res.statusCode.must.equal(200)
			})
		})
	})

	describe("POST /", function() {
		describe("when not logged in", function() {
			it("must create event given token", function*() {
				this.router.get(`/api/topics/${UUID}`, respond.bind(null, {
					data: INITIATIVE
				}))

				var created = 0
				this.router.post(`/api/topics/${UUID}/events`, function(req, res) {
					++created
					req.headers.authorization.must.equal("Bearer FOOBAR")
					req.body.must.eql({subject: "Finished!", text: "All good."})
					res.end()
				})

				var res = yield this.request(`/initiatives/${UUID}/events`, {
					method: "POST",
					headers: {Cookie: "csrf_token=ABC"},
					form: {
						_csrf_token: "ABC",
						token: "FOOBAR",
						subject: "Finished!",
						text: "All good.",
					}
				})

				res.statusCode.must.equal(303)
				created.must.equal(1)
			})
		})
	})
})
