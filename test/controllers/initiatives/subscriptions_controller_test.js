var _ = require("root/lib/underscore")
var Config = require("root/config")
var respond = require("root/test/fixtures").respond
var ValidSubscription = require("root/test/valid_db_initiative_subscription")
var sql = require("sqlate")
var pseudoHex = require("root/lib/crypto").pseudoHex
var t = require("root/lib/i18n").t.bind(null, "et")
var subscriptionsDb = require("root/db/initiative_subscriptions_db")
var UUID = "5f9a82a5-e815-440b-abe9-d17311b0b366"
var EMPTY_RES = {data: {rows: []}}

var INITIATIVE = {
	id: UUID,
	createdAt: new Date(2000, 0, 1),
	updatedAt: new Date(2000, 0, 2),
	sourcePartnerId: Config.apiPartnerId,
	status: "voting",
	title: "My thoughts",
	description: "<body><h1>My thoughts</h1></body>",
	creator: {name: "John"},
	visibility: "public",
	permission: {level: "read"},

	vote: {
		id: "396b0e5b-cca7-4255-9238-19b464e60b65",
		endsAt: new Date(3000, 0, 1),
		options: {rows: [{value: "Yes", voteCount: 0}]}
	}
}

var DISCUSSION = {
	id: UUID,
	createdAt: new Date(2000, 0, 1),
	updatedAt: new Date(2000, 0, 2),
	sourcePartnerId: Config.apiPartnerId,
	status: "inProgress",
	title: "My future thoughts",
	description: "<body><h1>My future thoughts</h1></body>",
	creator: {name: "John"},
	visibility: "public",
	permission: {level: "read"}
}

var PRIVATE_DISCUSSION = _.merge({}, DISCUSSION, {
	visibility: "private",
	permission: {level: "admin"}
})

describe("InitiativeSubscriptionsController", function() {
	require("root/test/web")()
	require("root/test/mitm")()
	require("root/test/db")()
	require("root/test/email")()
	beforeEach(require("root/test/mitm").router)

	describe("POST /:id/subscriptions", function() {
		require("root/test/fixtures").csrf()
		require("root/test/email")()
		require("root/test/time")(Date.UTC(2015, 5, 18))

		it("must subscribe", function*() {
			this.router.get(`/api/topics/${UUID}`,
				respond.bind(null, {data: INITIATIVE}))

			var res = yield this.request(`/initiatives/${UUID}/subscriptions`, {
				method: "POST",
				form: {_csrf_token: this.csrfToken, email: "user@example.com"}
			})

			res.statusCode.must.equal(303)
			res.headers.location.must.equal("/initiatives/" + UUID)

			var subscriptions = yield subscriptionsDb.search(sql`
				SELECT * FROM initiative_subscriptions
			`)

			subscriptions.length.must.equal(1)
			var subscription = subscriptions[0]

			subscription.must.eql(new ValidSubscription({
				initiative_uuid: UUID,
				email: "user@example.com",
				created_at: new Date,
				created_ip: "127.0.0.1",
				updated_at: new Date,
				confirmation_sent_at: new Date,
				update_token: subscription.update_token
			}))

			subscription.update_token.must.exist()

			this.emails.length.must.equal(1)
			this.emails[0].envelope.to.must.eql(["user@example.com"])
			var body = String(this.emails[0].message)
			body.match(/^Subject: .*/m)[0].must.include(INITIATIVE.title)
			body.must.include(`confirmation_token=3D${subscription.update_token}`)
		})

		it(`must subscribe case-insensitively`, function*() {
			this.router.get(`/api/topics/${UUID}`,
				respond.bind(null, {data: INITIATIVE}))

			var createdAt = new Date(2015, 5, 18, 13, 37, 42, 666)
			var email = "user@example.com"

			var subscription = yield subscriptionsDb.create(new ValidSubscription({
				initiative_uuid: UUID,
				email: email,
				created_at: createdAt,
				updated_at: createdAt,
				confirmed_at: createdAt,
				confirmation_sent_at: new Date
			}))

			var res = yield this.request(`/initiatives/${UUID}/subscriptions`, {
				method: "POST",
				form: {_csrf_token: this.csrfToken, email: email.toUpperCase()}
			})

			res.statusCode.must.equal(303)
			res.headers.location.must.equal("/initiatives/" + UUID)

			yield subscriptionsDb.search(sql`
				SELECT * FROM initiative_subscriptions
			`).must.then.eql([subscription])

			this.emails.length.must.equal(0)
		})

		it("must not resend confirmation email if less than an hour has passed",
			function*() {
			var subscription = yield subscriptionsDb.create(new ValidSubscription({
				initiative_uuid: UUID,
				confirmation_sent_at: new Date
			}))

			this.router.get(`/api/topics/${UUID}`,
				respond.bind(null, {data: INITIATIVE}))

			this.time.tick(3599 * 1000)
			var res = yield this.request(`/initiatives/${UUID}/subscriptions`, {
				method: "POST",
				form: {_csrf_token: this.csrfToken, email: subscription.email}
			})

			res.statusCode.must.equal(303)

			yield subscriptionsDb.search(sql`
				SELECT * FROM initiative_subscriptions
			`).must.then.eql([subscription])

			this.emails.length.must.equal(0)
		})

		it("must resend confirmation email if an hour has passed", function*() {
			var subscription = yield subscriptionsDb.create(new ValidSubscription({
				initiative_uuid: UUID,
				confirmation_sent_at: new Date
			}))

			this.router.get(`/api/topics/${UUID}`,
				respond.bind(null, {data: INITIATIVE}))

			this.time.tick(3600 * 1000)
			var res = yield this.request(`/initiatives/${UUID}/subscriptions`, {
				method: "POST",
				form: {_csrf_token: this.csrfToken, email: subscription.email}
			})

			res.statusCode.must.equal(303)

			yield subscriptionsDb.search(sql`
				SELECT * FROM initiative_subscriptions
			`).must.then.eql([{
				__proto__: subscription,
				updated_at: new Date,
				confirmation_sent_at: new Date
			}])

			this.emails.length.must.equal(1)
		})

		it("must send reminder email if an hour has passed", function*() {
			var subscription = yield subscriptionsDb.create(new ValidSubscription({
				initiative_uuid: UUID,
				confirmed_at: new Date,
				confirmation_sent_at: new Date
			}))

			this.router.get(`/api/topics/${UUID}`,
				respond.bind(null, {data: INITIATIVE}))

			this.time.tick(3600 * 1000)
			var res = yield this.request(`/initiatives/${UUID}/subscriptions`, {
				method: "POST",
				form: {_csrf_token: this.csrfToken, email: subscription.email}
			})

			res.statusCode.must.equal(303)

			yield subscriptionsDb.search(sql`
				SELECT * FROM initiative_subscriptions
			`).must.then.eql([{
				__proto__: subscription,
				updated_at: new Date,
				confirmation_sent_at: new Date
			}])

			this.emails.length.must.equal(1)
		})

		it("must respond with 403 Forbidden if discussion not public", function*() {
			PRIVATE_DISCUSSION.visibility.must.not.equal("public")

			this.router.get(`/api/topics/${UUID}`,
				respond.bind(null, {data: PRIVATE_DISCUSSION}))

			var res = yield this.request(`/initiatives/${UUID}/subscriptions`, {
				method: "POST",
				form: {_csrf_token: this.csrfToken, email: "user@example.com"}
			})

			res.statusCode.must.equal(403)
		})

		it("must respond with 422 given missing email", function*() {
			this.router.get(`/api/topics/${UUID}`,
				respond.bind(null, {data: INITIATIVE}))

			var res = yield this.request(`/initiatives/${UUID}/subscriptions`, {
				method: "POST",
				form: {_csrf_token: this.csrfToken, email: ""}
			})

			res.statusCode.must.equal(422)
		})

		it("must respond with 422 given invalid email", function*() {
			this.router.get(`/api/topics/${UUID}`,
				respond.bind(null, {data: INITIATIVE}))

			var res = yield this.request(`/initiatives/${UUID}/subscriptions`, {
				method: "POST",
				form: {_csrf_token: this.csrfToken, email: "fubar"}
			})

			res.statusCode.must.equal(422)
		})
	})

	describe("GET /:id/subscriptions/new", function() {
		require("root/test/fixtures").csrf()
		require("root/test/time")(Date.UTC(2015, 5, 18))

		it("must confirm given a confirmation token", function*() {
			this.router.get(`/api/topics/${UUID}`,
				respond.bind(null, {data: INITIATIVE}))

			var createdAt = new Date(2015, 5, 18, 13, 37, 42, 666)
			var token = pseudoHex(8)

			var subscription = new ValidSubscription({
				initiative_uuid: UUID,
				created_at: createdAt,
				updated_at: createdAt,
				update_token: token,
				confirmation_sent_at: createdAt
			})

			yield subscriptionsDb.create(subscription)

			var res = yield this.request(
				`/initiatives/${UUID}/subscriptions/new?confirmation_token=${token}`
			)

			res.statusCode.must.equal(303)
			res.headers.location.must.equal("/initiatives/" + UUID)

			yield subscriptionsDb.read(subscription).must.then.eql({
				__proto__: subscription,
				confirmed_at: new Date,
				confirmation_sent_at: null,
				updated_at: new Date
			})
		})

		it("must not confirm twice", function*() {
			this.router.get(`/api/topics/${UUID}`,
				respond.bind(null, {data: INITIATIVE}))

			var createdAt = new Date(2015, 5, 18, 13, 37, 42, 666)
			var token = pseudoHex(8)

			var subscription = new ValidSubscription({
				initiative_uuid: UUID,
				created_at: createdAt,
				updated_at: createdAt,
				confirmed_at: createdAt,
				update_token: token
			})

			yield subscriptionsDb.create(subscription)

			var res = yield this.request(
				`/initiatives/${UUID}/subscriptions/new?confirmation_token=${token}`
			)

			res.statusCode.must.equal(303)
			res.headers.location.must.equal("/initiatives/" + UUID)
			yield subscriptionsDb.read(subscription).must.then.eql(subscription)
		})

		it("must not confirm given the wrong token", function*() {
			this.router.get(`/api/topics/${UUID}`,
				respond.bind(null, {data: INITIATIVE}))
			this.router.get(`/api/topics/${UUID}/comments`,
				respond.bind(null, EMPTY_RES))

			var createdAt = new Date(2015, 5, 18, 13, 37, 42, 666)
			var token = pseudoHex(8)

			var subscription = new ValidSubscription({
				initiative_uuid: UUID,
				created_at: createdAt,
				updated_at: createdAt,
				update_token: token,
				confirmation_sent_at: createdAt
			})

			yield subscriptionsDb.create(subscription)

			var res = yield this.request(
				`/initiatives/${UUID}/subscriptions/new?confirmation_token=deadbeef`
			)

			res.statusCode.must.equal(404)
			yield subscriptionsDb.read(subscription).must.then.eql(subscription)
		})
	})

	describe("GET /:id/subscriptions/:token", function() {
		require("root/test/fixtures").csrf()

		it("must show subscription page", function*() {
			this.router.get(`/api/topics/${UUID}`,
				respond.bind(null, {data: INITIATIVE}))

			var subscription = new ValidSubscription({
				initiative_uuid: UUID,
				confirmed_at: new Date
			})

			yield subscriptionsDb.create(subscription)

			var res = yield this.request(
				`/initiatives/${UUID}/subscriptions/${subscription.update_token}`
			)

			res.statusCode.must.equal(200)
			res.body.must.include(t("SUBSCRIPTION_UPDATE_TITLE"))
		})

		it("must respond with 404 given invalid update token", function*() {
			this.router.get(`/api/topics/${UUID}`,
				respond.bind(null, {data: INITIATIVE}))

			// Still have a single subscription to ensure it's not picking randomly.
			yield subscriptionsDb.create(new ValidSubscription({
				initiative_uuid: UUID,
				confirmed_at: new Date
			}))

			var res = yield this.request(`/initiatives/${UUID}/subscriptions/beef`)
			res.statusCode.must.equal(404)
			res.body.must.include(t("SUBSCRIPTION_NOT_FOUND_TITLE"))
		})
	})

	describe("PUT /:id/subscriptions/:token", function() {
		require("root/test/fixtures").csrf()
		require("root/test/time")()

		it("must update subscription", function*() {
			this.router.get(`/api/topics/${UUID}`,
				respond.bind(null, {data: INITIATIVE}))

			var sub = yield subscriptionsDb.create(new ValidSubscription({
				initiative_uuid: UUID,
				confirmed_at: new Date
			}))

			var path = `/initiatives/${UUID}/subscriptions/${sub.update_token}`
			var res = yield this.request(path, {
				method: "POST",
					form: {
						_method: "put",
						_csrf_token: this.csrfToken,
						official_interest: false,
						author_interest: false
					}
			})

			res.statusCode.must.equal(303)
			res.headers.location.must.equal(path)

			yield subscriptionsDb.read(sub).must.then.eql({
				__proto__: sub,
				updated_at: new Date,
				official_interest: false,
				author_interest: false
			})
		})

		it("must not update email", function*() {
			this.router.get(`/api/topics/${UUID}`,
				respond.bind(null, {data: INITIATIVE}))

			var sub = yield subscriptionsDb.create(new ValidSubscription({
				initiative_uuid: UUID,
				confirmed_at: new Date
			}))

			var path = `/initiatives/${UUID}/subscriptions/${sub.update_token}`
			var res = yield this.request(path, {
				method: "POST",
					form: {
						_method: "put",
						_csrf_token: this.csrfToken,
						email: "root@example.com"
					}
			})

			res.statusCode.must.equal(303)

			yield subscriptionsDb.read(sub).must.then.eql({
				__proto__: sub,
				updated_at: new Date
			})
		})

		it("must respond with 404 given invalid update token", function*() {
			this.router.get(`/api/topics/${UUID}`,
				respond.bind(null, {data: INITIATIVE}))

			// Still have a single subscription to ensure it's not picking randomly.
			var subscription = yield subscriptionsDb.create(new ValidSubscription({
				initiative_uuid: UUID,
				confirmed_at: new Date
			}))

			var res = yield this.request(
				`/initiatives/${UUID}/subscriptions/deadbeef`, {
				method: "POST",
				form: {_method: "put", _csrf_token: this.csrfToken}
			})

			res.statusCode.must.equal(404)
			res.body.must.include(t("SUBSCRIPTION_NOT_FOUND_TITLE"))

			yield subscriptionsDb.search(sql`
				SELECT * FROM initiative_subscriptions
			`).must.then.eql([subscription])
		})
	})

	describe("DELETE /:id/subscriptions/:token", function() {
		require("root/test/fixtures").csrf()

		it("must delete subscription", function*() {
			this.router.get(`/api/topics/${UUID}`,
				respond.bind(null, {data: INITIATIVE}))

			var subscription = yield subscriptionsDb.create(new ValidSubscription({
				initiative_uuid: UUID,
				confirmed_at: new Date
			}))

			var res = yield this.request(
				`/initiatives/${UUID}/subscriptions/${subscription.update_token}`, {
				method: "POST",
				form: {_method: "delete", _csrf_token: this.csrfToken}
			})

			res.statusCode.must.equal(303)
			res.headers.location.must.equal("/initiatives/" + UUID)

			yield subscriptionsDb.search(sql`
				SELECT * FROM initiative_subscriptions
			`).must.then.be.empty()
		})

		it("must respond with 404 given invalid update token", function*() {
			this.router.get(`/api/topics/${UUID}`,
				respond.bind(null, {data: INITIATIVE}))

			// Still have a single subscription to ensure it's not picking randomly.
			var subscription = yield subscriptionsDb.create(new ValidSubscription({
				initiative_uuid: UUID,
				confirmed_at: new Date
			}))

			var res = yield this.request(
				`/initiatives/${UUID}/subscriptions/deadbeef`, {
				method: "POST",
				form: {_method: "delete", _csrf_token: this.csrfToken}
			})

			res.statusCode.must.equal(404)
			res.body.must.include(t("SUBSCRIPTION_NOT_FOUND_TITLE"))

			yield subscriptionsDb.search(sql`
				SELECT * FROM initiative_subscriptions
			`).must.then.eql([subscription])
		})

		it("must not delete other subscription on same initiative", function*() {
			this.router.get(`/api/topics/${UUID}`,
				respond.bind(null, {data: INITIATIVE}))

			var other = new ValidSubscription({
				initiative_uuid: UUID,
				confirmed_at: new Date
			})

			var subscription = new ValidSubscription({
				initiative_uuid: UUID,
				confirmed_at: new Date,
			})

			yield subscriptionsDb.create([other, subscription])

			var res = yield this.request(
				`/initiatives/${UUID}/subscriptions/${subscription.update_token}`, {
				method: "POST",
				form: {_method: "delete", _csrf_token: this.csrfToken}
			})

			res.statusCode.must.equal(303)
			res.headers.location.must.equal("/initiatives/" + UUID)

			yield subscriptionsDb.search(sql`
				SELECT * FROM initiative_subscriptions
			`).must.then.eql([other])
		})
	})
})
