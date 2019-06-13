var ValidSubscription =
	require("root/test/valid_db_initiative_subscription")
var pseudoHex = require("root/lib/crypto").pseudoHex
var sql = require("sqlate")
var db = require("root/db/initiative_subscriptions_db")
var t = require("root/lib/i18n").t.bind(null, "et")

describe("SubscriptionsController", function() {
	require("root/test/web")()
	require("root/test/mitm")()
	require("root/test/db")()
	beforeEach(require("root/test/mitm").router)

	describe("POST /", function() {
		require("root/test/fixtures").csrf()
		require("root/test/email")()
		require("root/test/time")(Date.UTC(2015, 5, 18))

		it("must subscribe", function*() {
			var res = yield this.request("/subscriptions", {
				method: "POST",
				form: {_csrf_token: this.csrfToken, email: "user@example.com"}
			})

			res.statusCode.must.equal(303)
			res.headers.location.must.equal("/")

			var subscriptions = yield db.search(sql`
				SELECT * FROM initiative_subscriptions
			`)

			subscriptions.length.must.equal(1)
			var subscription = subscriptions[0]

			subscription.must.eql(new ValidSubscription({
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
			body.must.include(`confirmation_token=3D${subscription.update_token}`)
		})

		it("must subscribe case-insensitively", function*() {
			var createdAt = new Date(2015, 5, 18, 13, 37, 42, 666)
			var email = "user@example.com"

			var subscription = yield db.create(new ValidSubscription({
				email: email,
				created_at: createdAt,
				updated_at: createdAt,
				confirmed_at: createdAt,
				confirmation_sent_at: createdAt
			}))

			var res = yield this.request("/subscriptions", {
				method: "POST",
				form: {_csrf_token: this.csrfToken, email: email.toUpperCase()}
			})

			res.statusCode.must.equal(303)
			res.headers.location.must.equal("/")

			var subs = yield db.search(sql`SELECT * FROM initiative_subscriptions`)
			subs.must.eql([subscription])
			this.emails.length.must.equal(0)
		})

		it("must not resend confirmation email if less than an hour has passed",
			function*() {
			var subscription = yield db.create(new ValidSubscription({
				confirmation_sent_at: new Date
			}))

			this.time.tick(3599 * 1000)
			var res = yield this.request("/subscriptions", {
				method: "POST",
				form: {_csrf_token: this.csrfToken, email: subscription.email}
			})

			res.statusCode.must.equal(303)

			var subs = yield db.search(sql`SELECT * FROM initiative_subscriptions`)
			subs.must.eql([subscription])
			this.emails.length.must.equal(0)
		})

		it("must resend confirmation email if an hour has passed", function*() {
			var subscription = yield db.create(new ValidSubscription({
				confirmation_sent_at: new Date
			}))

			this.time.tick(3600 * 1000)
			var res = yield this.request("/subscriptions", {
				method: "POST",
				form: {_csrf_token: this.csrfToken, email: subscription.email}
			})

			res.statusCode.must.equal(303)

			yield db.search(sql`
				SELECT * FROM initiative_subscriptions
			`).must.then.eql([{
				__proto__: subscription,
				updated_at: new Date,
				confirmation_sent_at: new Date
			}])

			this.emails.length.must.equal(1)
		})

		it("must send reminder email if an hour has passed", function*() {
			var subscription = yield db.create(new ValidSubscription({
				confirmed_at: new Date,
				confirmation_sent_at: new Date
			}))

			this.time.tick(3600 * 1000)
			var res = yield this.request("/subscriptions", {
				method: "POST",
				form: {_csrf_token: this.csrfToken, email: subscription.email}
			})

			res.statusCode.must.equal(303)

			yield db.read(subscription).must.then.eql({
				__proto__: subscription,
				updated_at: new Date,
				confirmation_sent_at: new Date
			})

			this.emails.length.must.equal(1)
		})

		it("must respond with 422 given missing email", function*() {
			var res = yield this.request("/subscriptions", {
				method: "POST",
				form: {_csrf_token: this.csrfToken, email: ""}
			})

			res.statusCode.must.equal(422)
		})

		it("must respond with 422 given invalid email", function*() {
			var res = yield this.request("/subscriptions", {
				method: "POST",
				form: {_csrf_token: this.csrfToken, email: "fubar"}
			})

			res.statusCode.must.equal(422)
		})
	})

	describe("GET /new", function() {
		require("root/test/fixtures").csrf()
		require("root/test/email")()
		require("root/test/time")(Date.UTC(2015, 5, 18))
		
		it("must confirm given a confirmation token", function*() {
			var createdAt = new Date(2015, 5, 18, 13, 37, 42, 666)
			var token = pseudoHex(8)

			var subscription = yield db.create(new ValidSubscription({
				created_at: createdAt,
				updated_at: createdAt,
				update_token: token,
				confirmation_sent_at: createdAt
			}))

			var res = yield this.request(
				`/subscriptions/new?confirmation_token=${token}`
			)

			res.statusCode.must.equal(303)
			res.headers.location.must.equal("/")

			yield db.read(subscription).must.then.eql({
				__proto__: subscription,
				confirmed_at: new Date,
				updated_at: new Date
			})
		})

		it("must not confirm twice", function*() {
			var createdAt = new Date(2015, 5, 18, 13, 37, 42, 666)
			var token = pseudoHex(8)

			var subscription = yield db.create(new ValidSubscription({
				created_at: createdAt,
				updated_at: createdAt,
				confirmed_at: createdAt,
				update_token: token
			}))

			var res = yield this.request(
				`/subscriptions/new?confirmation_token=${token}`
			)

			res.statusCode.must.equal(303)
			res.headers.location.must.equal("/")
			yield db.read(subscription).must.then.eql(subscription)
		})

		it("must not confirm given the wrong token", function*() {
			var createdAt = new Date(2015, 5, 18, 13, 37, 42, 666)
			var token = pseudoHex(8)

			var subscription = yield db.create(new ValidSubscription({
				created_at: createdAt,
				updated_at: createdAt,
				update_token: token,
				confirmation_sent_at: createdAt
			}))

			var res = yield this.request(
				"/subscriptions/new?confirmation_token=deadbeef"
			)

			res.statusCode.must.equal(404)
			yield db.read(subscription).must.then.eql(subscription)
		})
	})

	describe("GET /:token", function() {
		require("root/test/fixtures").csrf()

		it("must show subscription page", function*() {
			var subscription = yield db.create(new ValidSubscription({
				confirmed_at: new Date
			}))

			var res = yield this.request(
				`/subscriptions/${subscription.update_token}`
			)

			res.statusCode.must.equal(200)
			res.body.must.include(t("SUBSCRIPTIONS_UPDATE_TITLE"))
		})

		it("must respond with 404 given invalid update token", function*() {
			// Still have a single subscription to ensure it's not picking randomly.
			yield db.create(new ValidSubscription({
				confirmed_at: new Date
			}))

			var res = yield this.request("/subscriptions/beef")
			res.statusCode.must.equal(404)
			res.body.must.include(t("SUBSCRIPTION_NOT_FOUND_TITLE"))
		})
	})

	describe("PUT /:id/subscriptions/:token", function() {
		require("root/test/fixtures").csrf()
		require("root/test/time")()

		it("must update subscription", function*() {
			var sub = yield db.create(new ValidSubscription({
				confirmed_at: new Date
			}))

			var path = `/subscriptions/${sub.update_token}`
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

			yield db.read(sub).must.then.eql({
				__proto__: sub,
				updated_at: new Date,
				official_interest: false,
				author_interest: false
			})
		})

		it("must not update email", function*() {
			var sub = yield db.create(new ValidSubscription({
				confirmed_at: new Date
			}))

			var res = yield this.request(`/subscriptions/${sub.update_token}`, {
				method: "POST",
					form: {
						_method: "put",
						_csrf_token: this.csrfToken,
						email: "root@example.com"
					}
			})

			res.statusCode.must.equal(303)

			yield db.read(sub).must.then.eql({
				__proto__: sub,
				updated_at: new Date
			})
		})

		it("must respond with 404 given invalid update token", function*() {
			// Still have a single subscription to ensure it's not picking randomly.
			var subscription = yield db.create(new ValidSubscription({
				confirmed_at: new Date
			}))

			var res = yield this.request(`/subscriptions/deadbeef`, {
				method: "POST",
				form: {_method: "put", _csrf_token: this.csrfToken}
			})

			res.statusCode.must.equal(404)
			res.body.must.include(t("SUBSCRIPTION_NOT_FOUND_TITLE"))

			yield db.search(sql`
				SELECT * FROM initiative_subscriptions
			`).must.then.eql([subscription])
		})
	})

	describe("DELETE /:id/subscriptions/:token", function() {
		require("root/test/fixtures").csrf()

		it("must delete subscription", function*() {
			var subscription = yield db.create(new ValidSubscription({
				confirmed_at: new Date
			}))

			var res = yield this.request(
				`/subscriptions/${subscription.update_token}`, {
				method: "POST",
				form: {_method: "delete", _csrf_token: this.csrfToken}
			})

			res.statusCode.must.equal(303)
			res.headers.location.must.equal("/")

			yield db.search(sql`
				SELECT * FROM initiative_subscriptions
			`).must.then.be.empty()
		})

		it("must respond with 404 given invalid update token", function*() {
			// Still have a single subscription to ensure it's not picking randomly.
			var subscription = yield db.create(new ValidSubscription({
				confirmed_at: new Date
			}))

			var res = yield this.request(`/subscriptions/deadbeef`, {
				method: "POST",
				form: {_method: "delete", _csrf_token: this.csrfToken}
			})

			res.statusCode.must.equal(404)
			res.body.must.include(t("SUBSCRIPTION_NOT_FOUND_TITLE"))

			yield db.search(sql`
				SELECT * FROM initiative_subscriptions
			`).must.then.eql([subscription])
		})

		it("must not delete other subscription on same initiative", function*() {
			var other = yield db.create(new ValidSubscription({
				confirmed_at: new Date
			}))

			var subscription = yield db.create(new ValidSubscription({
				confirmed_at: new Date,
			}))

			var res = yield this.request(
				`/subscriptions/${subscription.update_token}`, {
				method: "POST",
				form: {_method: "delete", _csrf_token: this.csrfToken}
			})

			res.statusCode.must.equal(303)
			res.headers.location.must.equal("/")

			yield db.search(sql`
				SELECT * FROM initiative_subscriptions
			`).must.then.eql([other])
		})
	})
})
