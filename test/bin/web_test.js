var _ = require("root/lib/underscore")
var DateFns = require("date-fns")
var ValidUser = require("root/test/valid_user")
var ValidSession = require("root/test/valid_session")
var usersDb = require("root/db/users_db")
var sessionsDb = require("root/db/sessions_db")
var SESSION_LENGTH_IN_DAYS = 120

describe("Web", function() {
	require("root/test/web")()

	describe("/", function() {
		it("must respond with cache headers", function*() {
			var res = yield this.request("/")
			res.statusCode.must.equal(200)

			res.headers["cache-control"].must.equal("no-cache")
			res.headers.must.have.property("etag")
			res.headers.must.not.have.property("last-modified")
			res.headers.must.not.have.property("expires")
		})
	})

	describe("/non-existent", function() {
		it("must respond with 404", function*() {
			var res = yield this.request("/non-exitent")
			res.statusCode.must.equal(404)

			res.headers["cache-control"].must.equal("no-cache")
			res.headers.must.have.property("etag")
			res.headers.must.not.have.property("last-modified")
			res.headers.must.not.have.property("expires")
		})
	})

	_.each({
		"/votings": "/",
		"/topics": "/",
		"/topics/": "/",
		"/topics/42": "/initiatives/42",
		"/topics/42/discussion": "/initiatives/42/discussion",
		"/topics/42/vote": "/initiatives/42",
		"/topics/42/events": "/initiatives/42/events",
		"/topics/42/events/create?token=42": "/initiatives/42/events/new?token=42",
		"/topics/42/votes/69": "/initiatives/42",
		"/initiatives/42/discussion": "/initiatives/42",
		"/initiatives/42/vote": "/initiatives/42",
		"/initiatives/42/events": "/initiatives/42",
		"/topics/create1": "/initiatives/new",
		"/discussions": "/",
		"/goodpractice": "/about",
		"/support_us": "/donate",
		"/session/new": "/sessions/new",

		"/initiatives/42/events/create?token=42":
			"/initiatives/42/events/new?token=42",
	}, function(to, from) {
		describe(from, function() {
			before(function*() {
				this.res = yield this.request(from, {method: "HEAD"})
			})

			it("must redirect to " + to, function() {
				;[301, 302].must.include(this.res.statusCode)
				this.res.headers.location.must.equal(to)
			})
		})
	})

	describe("session", function() {
		require("root/test/time")()

		it("must authenticate given valid session token", function*() {
			var user = usersDb.create(new ValidUser)
			var session = new ValidSession({user_id: user.id})
			session = _.assign(sessionsDb.create(session), {token: session.token})
			var res = yield this.request("/user", {session: session})
			res.statusCode.must.equal(200)
		})

		it("must not authenticate given invalid session token", function*() {
			var user = usersDb.create(new ValidUser)
			var session = new ValidSession({user_id: user.id})
			session = _.assign(sessionsDb.create(session), {token: session.token})
			session.token[0] = ~session.token[0]
			var res = yield this.request("/user", {session: session})
			res.statusCode.must.equal(401)
			res.statusMessage.must.equal("Unauthorized")
		})

		it("must not authenticate given deleted session", function*() {
			var user = usersDb.create(new ValidUser)

			var session = new ValidSession({
				user_id: user.id,
				deleted_at: new Date
			})

			session = _.assign(sessionsDb.create(session), {token: session.token})

			var res = yield this.request("/user", {session: session})
			res.statusCode.must.equal(401)
			res.statusMessage.must.equal("Unauthorized")
		})

		it(`must authenticate given session token newer than ${SESSION_LENGTH_IN_DAYS} days`, function*() {
			var user = usersDb.create(new ValidUser)

			var session = new ValidSession({
				user_id: user.id,

				created_at: DateFns.addSeconds(
					DateFns.addDays(new Date, -SESSION_LENGTH_IN_DAYS),
					1
				)
			})

			session = _.assign(sessionsDb.create(session), {token: session.token})
			var res = yield this.request("/user", {session: session})
			res.statusCode.must.equal(200)
		})

		it(`must not authenticate given session token older than ${SESSION_LENGTH_IN_DAYS} days`, function*() {
			var user = usersDb.create(new ValidUser)

			var session = new ValidSession({
				user_id: user.id,
				created_at: DateFns.addDays(new Date, -SESSION_LENGTH_IN_DAYS)
			})

			session = _.assign(sessionsDb.create(session), {token: session.token})

			var res = yield this.request("/user", {session: session})
			res.statusCode.must.equal(401)
			res.statusMessage.must.equal("Unauthorized")
		})
	})

	describe("multipart form", function() {
		// https://github.com/mscdex/dicer/pull/22
		// https://github.com/mscdex/busboy/issues/250
		it("must not crash when a header is preceded with a space", function*() {
			var res = yield this.request(`/non-existent`, {
				method: "PUT",

				headers: {
					"Content-Type": "multipart/form-data; boundary=----limitless",
				},

				body: "------limitless\r\n Content-Disposition: form-data; name=\"image\"\r\n\r\n\r\n------limitless--"
			})

			res.statusCode.must.equal(500)
			res.statusMessage.must.equal("Internal Server Error")
		})
	})
})
