var ValidDbInitiativeSubscription =
	require("root/test/valid_db_initiative_subscription")
var randomHex = require("root/lib/crypto").randomHex
var sql = require("sqlate")
var db = require("root/db/initiative_subscriptions_db")

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
			var email = "user@example.com"

			var res = yield this.request("/subscriptions", {
				method: "POST",
				form: {_csrf_token: this.csrfToken, email: email}
			})

			res.statusCode.must.equal(303)
			res.headers.location.must.equal("/")

			var subscriptions = yield db.search(sql`
				SELECT * FROM initiative_subscriptions
			`)

			subscriptions.length.must.equal(1)
			var subscription = subscriptions[0]

			subscription.must.eql(new ValidDbInitiativeSubscription({
				email: email,
				created_at: new Date,
				created_ip: "127.0.0.1",
				updated_at: new Date,
				confirmation_token: subscription.confirmation_token,
				confirmation_sent_at: new Date,
				update_token: subscription.update_token
			}))

			subscription.confirmation_token.must.exist()

			this.emails.length.must.equal(1)
			this.emails[0].envelope.to.must.eql([email])
			var body = String(this.emails[0].message)
			body.must.include(subscription.confirmation_token)
		})

		it("must subscribe only once case-insensitively",
			function*() {
			var createdAt = new Date(2015, 5, 18, 13, 37, 42, 666)
			var email = "user@example.com"

			var subscription = new ValidDbInitiativeSubscription({
				email: email,
				created_at: createdAt,
				updated_at: createdAt,
				confirmed_at: createdAt
			})

			yield db.create(subscription)

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
			var token = randomHex(8)

			var subscription = new ValidDbInitiativeSubscription({
				created_at: createdAt,
				updated_at: createdAt,
				confirmation_token: token,
				confirmation_sent_at: createdAt
			})

			yield db.create(subscription)

			var res = yield this.request(
				`/subscriptions/new?confirmation_token=${token}`
			)

			res.statusCode.must.equal(303)
			res.headers.location.must.equal("/")

			yield db.read(token).must.then.eql({
				__proto__: subscription,
				confirmed_at: new Date,
				confirmation_sent_at: null,
				updated_at: new Date
			})
		})

		it("must not confirm twice", function*() {
			var createdAt = new Date(2015, 5, 18, 13, 37, 42, 666)
			var token = randomHex(8)

			var subscription = new ValidDbInitiativeSubscription({
				created_at: createdAt,
				updated_at: createdAt,
				confirmed_at: createdAt,
				confirmation_token: token
			})

			yield db.create(subscription)

			var res = yield this.request(
				`/subscriptions/new?confirmation_token=${token}`
			)

			res.statusCode.must.equal(303)
			res.headers.location.must.equal("/")
			yield db.read(token).must.then.eql(subscription)
		})

		it("must not confirm given the wrong token", function*() {
			var createdAt = new Date(2015, 5, 18, 13, 37, 42, 666)
			var token = randomHex(8)

			var subscription = new ValidDbInitiativeSubscription({
				created_at: createdAt,
				updated_at: createdAt,
				confirmation_token: token,
				confirmation_sent_at: createdAt
			})

			yield db.create(subscription)

			var res = yield this.request(
				"/subscriptions/new?confirmation_token=deadbeef"
			)

			res.statusCode.must.equal(404)
			yield db.read(token).must.then.eql(subscription)
		})
	})
})
