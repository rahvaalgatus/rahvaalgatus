var DateFns = require("date-fns")
var respond = require("root/test/fixtures").respond
var UUID = "5f9a82a5-e815-440b-abe9-d17311b0b366"
var VOTES = require("root/config").votesRequired
var wait = require("root/lib/promise").wait

describe("InitiativesController", function() {
	require("root/test/web")()
	require("root/test/mitm")()

	describe("GET /initiatives/new", function() {
		require("root/test/fixtures").user()

		it("must render", function*() {
			var res = yield this.request("/initiatives/new")
			res.statusCode.must.equal(200)
		})
	})

	describe("GET /initiatives/:id", function() {
		describe("when not logged in", function() {
			it("must render discussion", function*() {
				this.mitm.on("request", respond.bind(null, `/topics/${UUID}?`, {
					data: {
						id: UUID,
						status: "inProgress",
						description: "<body><h1>My thoughts.</h1></body>",
						creator: {name: "John"},
						permission: {level: "read"}
					}
				}))

				this.mitm.on("request", respond.bind(null, `/topics/${UUID}/comments`, {
					data: {rows: []}
				}))

				var res = yield this.request("/initiatives/" + UUID)
				res.statusCode.must.equal(200)
			})
		})
	})

	describe("PUT /initiatives/:id", function() {
		require("root/test/fixtures").user()

		it("must update status", function*() {
			this.mitm.on("request", respond.bind(null, `/topics/${UUID}?`, {
				data: {
					id: UUID,
					status: "voting",
					description: "<body><h1>My thoughts.</h1></body>",
					creator: {name: "John"},
					permission: {level: "admin"},
					vote: {options: {rows: [{value: "Yes", voteCount: VOTES}]}}
				}
			}))

			var path = "/initiatives/" + UUID
			var res = this.request(path, {
				method: "PUT",
				form: {
					status: "followUp",
					"contact[name]": "John",
					"contact[email]": "john@example.com",
					"contact[phone]": "42"
				}
			})

			var req, next = wait.bind(null, this.mitm, "request")
			while ((req = yield next()) && req.method !== "PUT");
			req.res.end()

			JSON.parse(req.read()).must.eql({
				status: "followUp",
				contact: {name: "John", email: "john@example.com", phone: "42"}
			})

			res = yield res
			res.statusCode.must.equal(303)
			res.headers.location.must.equal(path)
		})

		it("must update visibility", function*() {
			this.mitm.on("request", respond.bind(null, `/topics/${UUID}?`, {
				data: {
					id: UUID,
					status: "inProgress",
					description: "<body><h1>My thoughts.</h1></body>",
					creator: {name: "John"},
					visibility: "private",
					permission: {level: "admin"}
				}
			}))

			var today = DateFns.startOfDay(new Date)
			var endsAt = DateFns.endOfDay(DateFns.addDays(today, 5))

			var path = "/initiatives/" + UUID
			var res = this.request(path, {
				method: "PUT",
				form: {visibility: "public", endsAt: endsAt.toJSON().slice(0, 10)}
			})

			var req, next = wait.bind(null, this.mitm, "request")
			while ((req = yield next()) && req.method !== "PUT");
			req.res.end()

			JSON.parse(req.read()).must.eql({
				visibility: "public", endsAt: endsAt.toJSON()
			})

			res = yield res
			res.statusCode.must.equal(303)
			res.headers.location.must.equal(path)
		})
	})
})
