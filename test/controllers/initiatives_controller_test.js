var Router = require("express").Router
var DateFns = require("date-fns")
var I18n = require("root/lib/i18n")
var parseBody = require("body-parser").json()
var respond = require("root/test/fixtures").respond
var respondFor = require("root/test/fixtures").respondFor
var route = require("root/test/mitm").route
var wait = require("root/lib/promise").wait
var UUID = "5f9a82a5-e815-440b-abe9-d17311b0b366"
var VOTES = require("root/config").votesRequired

var PUBLISHABLE_INITIATIVE = {
	id: UUID,
	createdAt: new Date(2000, 0, 1),
	status: "inProgress",
	description: "<body><h1>My thoughts.</h1></body>",
	creator: {name: "John"},
	visibility: "private",
	permission: {level: "admin"}
}

var PROPOSABLE_INITIATIVE = {
	id: UUID,
	createdAt: new Date(2000, 0, 1),
	status: "inProgress",
	description: "<body><h1>My thoughts.</h1></body>",
	creator: {name: "John"},
	visibility: "public",
	permission: {level: "admin"}
}

var VOTING_INITIATIVE = {
	id: UUID,
	status: "voting",
	description: "<body><h1>My thoughts.</h1></body>",
	creator: {name: "John"},
	permission: {level: "read"},
	vote: {options: {rows: [{value: "Yes", voteCount: 0}]}}
}

describe("InitiativesController", function() {
	require("root/test/web")()
	require("root/test/mitm")()

	describe("GET /new", function() {
		require("root/test/fixtures").user()

		it("must render", function*() {
			var res = yield this.request("/initiatives/new")
			res.statusCode.must.equal(200)
		})
	})

	describe("POST /", function() {
		require("root/test/fixtures").user()

		it("must escape title", function*() {
			var router = Router().use(parseBody)

			var created = 0
			router.post("/api/users/self/topics", function(req, res) {
				++created
				req.headers.authorization.must.exist(0)

				var title = "Hello &lt;mike&gt;!"
				var html = I18n.t("et", "INITIATIVE_DEFAULT_HTML", {title: title})
				req.body.visibility.must.equal("private")
				req.body.description.must.equal(html)

				respond({data: {id: UUID}}, req, res)
			})

			this.mitm.on("request", route.bind(null, router))

			var res = yield this.request("/initiatives", {
				method: "POST",
				form: {
					_csrf_token: this.csrfToken,
					"accept-tos": true,
					title: "Hello <mike>!"
				}
			})

			res.statusCode.must.equal(303)
			res.headers.location.must.equal("/initiatives/" + UUID)
			created.must.equal(1)
		})
	})

	describe("GET /:id", function() {
		describe("when not logged in", function() {
			it("must render discussion", function*() {
				this.mitm.on("request", respondFor.bind(null, `/topics/${UUID}?`, {
					data: {
						id: UUID,
						status: "inProgress",
						description: "<body><h1>My thoughts.</h1></body>",
						creator: {name: "John"},
						permission: {level: "read"}
					}
				}))

				this.mitm.on("request", respondFor.bind(null, `/topics/${UUID}/comments`, {
					data: {rows: []}
				}))

				var res = yield this.request("/initiatives/" + UUID)
				res.statusCode.must.equal(200)
			})
		})

		describe("when logged in", function() {
			require("root/test/fixtures").user()

			it("must render discussion", function*() {
				this.mitm.on("request", respondFor.bind(null, `/topics/${UUID}?`, {
					data: {
						id: UUID,
						status: "inProgress",
						description: "<body><h1>My thoughts.</h1></body>",
						creator: {name: "John"},
						permission: {level: "read"}
					}
				}))

				this.mitm.on("request", respondFor.bind(null, `/topics/${UUID}/comments`, {
					data: {rows: []}
				}))

				var res = yield this.request("/initiatives/" + UUID)
				res.statusCode.must.equal(200)
			})

			// This was a bug noticed on Mar 24, 2017 where the UI translation strings
			// were not rendered on the page. They were used only for ID-card errors.
			it("must render UI strings when voting", function*() {
				var router = Router()

				router.get(`/api/users/self/topics/${UUID}`, respond.bind(null, {
					data: VOTING_INITIATIVE
				}))

				router.get(`/api/users/self/topics/${UUID}/comments`,
					respond.bind(null, {data: {rows: []}})
				)

				this.mitm.on("request", route.bind(null, router))

				var res = yield this.request("/initiatives/" + UUID)
				res.statusCode.must.equal(200)
				var body = res.read().toString()
				body.must.include("MSG_ERROR_HWCRYPTO_NO_CERTIFICATES")
			})

			it("must respond with 404 when API responds 403 Forbidden", function*() {
				var router = Router()

				router.get(`/api/users/self/topics/${UUID}`, function(_req, res) {
					res.statusCode = 403
					res.end()
				})

				this.mitm.on("request", route.bind(null, router))

				var res = yield this.request("/initiatives/" + UUID)
				res.statusCode.must.equal(404)
			})

			it("must respond with 404 when API responds 404 Not Found", function*() {
				var router = Router()

				router.get(`/api/users/self/topics/${UUID}`, function(_req, res) {
					res.statusCode = 404
					res.end()
				})

				this.mitm.on("request", route.bind(null, router))

				var res = yield this.request("/initiatives/" + UUID)
				res.statusCode.must.equal(404)
			})
		})
	})

	describe("PUT /:id", function() {
		require("root/test/fixtures").user()

		it("must render update visibility page", function*() {
			this.mitm.on("request",
				respondFor.bind(null, `/topics/${UUID}?`, {data: PUBLISHABLE_INITIATIVE}))

			var res = yield this.request("/initiatives/" + UUID, {
				method: "PUT",
				form: {_csrf_token: this.csrfToken, visibility: "public"}
			})

			res.statusCode.must.equal(200)
		})

		it("must update visibility", function*() {
			this.mitm.on("request",
				respondFor.bind(null, `/topics/${UUID}?`, {data: PUBLISHABLE_INITIATIVE}))

			var today = DateFns.startOfDay(new Date)
			var endsAt = DateFns.endOfDay(DateFns.addDays(today, 5))

			var path = "/initiatives/" + UUID
			var res = this.request(path, {
				method: "PUT",
				form: {
					_csrf_token: this.csrfToken,
					visibility: "public",
					endsAt: endsAt.toJSON().slice(0, 10)
				}
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

		it("must render update status for voting page", function*() {
			this.mitm.on("request",
				respondFor.bind(null, `/topics/${UUID}?`, {data: PROPOSABLE_INITIATIVE}))

			var res = yield this.request("/initiatives/" + UUID, {
				method: "PUT",
				form: {_csrf_token: this.csrfToken, status: "voting"}
			})

			res.statusCode.must.equal(200)
		})

		it("must update status", function*() {
			this.mitm.on("request", respondFor.bind(null, `/topics/${UUID}?`, {
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
					_csrf_token: this.csrfToken,
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
	})
})
