var DateFns = require("date-fns")
var I18n = require("root/lib/i18n")
var respond = require("root/test/fixtures").respond
var wait = require("root/lib/promise").wait
var UUID = "5f9a82a5-e815-440b-abe9-d17311b0b366"
var VOTES = require("root/config").votesRequired
var HEADERS = {"Content-Type": "application/json"}

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

	describe("POST /initiatives", function() {
		require("root/test/fixtures").user()

		it("must escape title", function*() {
			var res = this.request("/initiatives", {
				method: "POST",
				form: {"accept-tos": true, title: "Hello <mike>!"}
			})

			var req, next = wait.bind(null, this.mitm, "request")
			while ((req = yield next()) && req.method !== "POST");
			req.res.writeHead(200, HEADERS)
			req.res.end(JSON.stringify({data: {id: UUID}}))

			var attrs = JSON.parse(req.read())
			var title = "Hello &lt;mike&gt;!"
			var html = I18n.t("et", "INITIATIVE_DEFAULT_HTML", {title: title})
			attrs.description.must.equal(html)

			res = yield res
			res.statusCode.must.equal(303)
			res.headers.location.must.equal("/initiatives/" + UUID)
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

		it("must render update visibility page", function*() {
			this.mitm.on("request",
				respond.bind(null, `/topics/${UUID}?`, {data: PUBLISHABLE_INITIATIVE}))

			var res = yield this.request("/initiatives/" + UUID, {
				method: "PUT",
				form: {visibility: "public"}
			})

			res.statusCode.must.equal(200)
		})

		it("must update visibility", function*() {
			this.mitm.on("request",
				respond.bind(null, `/topics/${UUID}?`, {data: PUBLISHABLE_INITIATIVE}))

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

		it("must render update status for voting page", function*() {
			this.mitm.on("request",
				respond.bind(null, `/topics/${UUID}?`, {data: PROPOSABLE_INITIATIVE}))

			var res = yield this.request("/initiatives/" + UUID, {
				method: "PUT",
				form: {status: "voting"}
			})

			res.statusCode.must.equal(200)
		})

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
	})
})
