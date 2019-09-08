var Config = require("root/config")
var ValidInitiative = require("root/test/valid_db_initiative")
var ValidSubscription = require("root/test/valid_subscription")
var t = require("root/lib/i18n").t.bind(null, "et")
var newPartner = require("root/test/citizenos_fixtures").newPartner
var newUser = require("root/test/citizenos_fixtures").newUser
var newTopic = require("root/test/citizenos_fixtures").newTopic
var createPartner = require("root/test/citizenos_fixtures").createPartner
var createUser = require("root/test/citizenos_fixtures").createUser
var createTopic = require("root/test/citizenos_fixtures").createTopic
var sql = require("sqlate")
var pseudoHex = require("root/lib/crypto").pseudoHex
var subscriptionsDb = require("root/db/initiative_subscriptions_db")
var initiativesDb = require("root/db/initiatives_db")

describe("InitiativeSubscriptionsController", function() {
	require("root/test/web")()
	require("root/test/mitm")()
	require("root/test/db")()
	require("root/test/email")()
	beforeEach(require("root/test/mitm").router)

	beforeEach(function*() {
		this.partner = yield createPartner(newPartner({id: Config.apiPartnerId}))
		this.initiative = yield initiativesDb.create(new ValidInitiative)

		this.topic = yield createTopic(newTopic({
			id: this.initiative.uuid,
			creatorId: (yield createUser(newUser())).id,
			sourcePartnerId: this.partner.id,
			visibility: "public"
		}))
	})

	describe("POST /", function() {
		require("root/test/fixtures").csrf()
		require("root/test/email")()
		require("root/test/time")(Date.UTC(2015, 5, 18))

		it("must subscribe", function*() {
			var path = `/initiatives/${this.initiative.uuid}/subscriptions`
			var res = yield this.request(path, {
				method: "POST",
				form: {_csrf_token: this.csrfToken, email: "user@example.com"}
			})

			res.statusCode.must.equal(303)
			res.headers.location.must.equal("/initiatives/" + this.initiative.uuid)

			var subscriptions = yield subscriptionsDb.search(sql`
				SELECT * FROM initiative_subscriptions
			`)

			subscriptions.length.must.equal(1)
			var subscription = subscriptions[0]

			subscription.must.eql(new ValidSubscription({
				initiative_uuid: this.initiative.uuid,
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
			body.match(/^Subject: .*/m)[0].must.include(this.topic.title)
			body.must.include(`confirmation_token=3D${subscription.update_token}`)
		})

		it("must subscribe given an external initiative", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				external: true
			}))

			var path = `/initiatives/${initiative.uuid}/subscriptions`
			var res = yield this.request(path, {
				method: "POST",
				form: {_csrf_token: this.csrfToken, email: "user@example.com"}
			})

			res.statusCode.must.equal(303)
			res.headers.location.must.equal("/initiatives/" + initiative.uuid)

			var subscriptions = yield subscriptionsDb.search(sql`
				SELECT * FROM initiative_subscriptions
			`)

			subscriptions.length.must.equal(1)
			subscriptions[0].initiative_uuid.must.equal(initiative.uuid)

			this.emails.length.must.equal(1)
			this.emails[0].envelope.to.must.eql(["user@example.com"])
			var body = String(this.emails[0].message)
			body.match(/^Subject: .*/m)[0].must.include(initiative.title)
		})

		it(`must subscribe case-insensitively`, function*() {
			var createdAt = new Date(2015, 5, 18, 13, 37, 42, 666)
			var email = "user@example.com"

			var subscription = yield subscriptionsDb.create(new ValidSubscription({
				initiative_uuid: this.initiative.uuid,
				email: email,
				created_at: createdAt,
				updated_at: createdAt,
				confirmed_at: createdAt,
				confirmation_sent_at: new Date
			}))

			var res = yield this.request(`/initiatives/${this.initiative.uuid}/subscriptions`, {
				method: "POST",
				form: {_csrf_token: this.csrfToken, email: email.toUpperCase()}
			})

			res.statusCode.must.equal(303)
			res.headers.location.must.equal("/initiatives/" + this.initiative.uuid)

			yield subscriptionsDb.search(sql`
				SELECT * FROM initiative_subscriptions
			`).must.then.eql([subscription])

			this.emails.length.must.equal(0)
		})

		it("must not resend confirmation email if less than an hour has passed",
			function*() {
			var subscription = yield subscriptionsDb.create(new ValidSubscription({
				initiative_uuid: this.initiative.uuid,
				confirmation_sent_at: new Date
			}))

			this.time.tick(3599 * 1000)
			var res = yield this.request(`/initiatives/${this.initiative.uuid}/subscriptions`, {
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
				initiative_uuid: this.initiative.uuid,
				confirmation_sent_at: new Date
			}))

			this.time.tick(3600 * 1000)
			var res = yield this.request(`/initiatives/${this.initiative.uuid}/subscriptions`, {
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
				initiative_uuid: this.initiative.uuid,
				confirmed_at: new Date,
				confirmation_sent_at: new Date
			}))

			this.time.tick(3600 * 1000)
			var res = yield this.request(`/initiatives/${this.initiative.uuid}/subscriptions`, {
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
			var initiative = yield initiativesDb.create(new ValidInitiative)

			yield createTopic(newTopic({
				id: initiative.uuid,
				creatorId: (yield createUser(newUser())).id,
				sourcePartnerId: this.partner.id,
				visibility: "private"
			}))

			var path = `/initiatives/${initiative.uuid}/subscriptions`
			var res = yield this.request(path, {
				method: "POST",
				form: {_csrf_token: this.csrfToken, email: "user@example.com"}
			})

			res.statusCode.must.equal(403)
			res.statusMessage.must.match(/public/i)
		})

		it("must respond with 422 given missing email", function*() {
			var res = yield this.request(`/initiatives/${this.initiative.uuid}/subscriptions`, {
				method: "POST",
				form: {_csrf_token: this.csrfToken, email: ""}
			})

			res.statusCode.must.equal(422)
		})

		it("must respond with 422 given invalid email", function*() {
			var res = yield this.request(`/initiatives/${this.initiative.uuid}/subscriptions`, {
				method: "POST",
				form: {_csrf_token: this.csrfToken, email: "fubar"}
			})

			res.statusCode.must.equal(422)
		})
	})

	describe("GET /new", function() {
		require("root/test/fixtures").csrf()
		require("root/test/time")(Date.UTC(2015, 5, 18))

		it("must confirm given a confirmation token", function*() {
			var createdAt = new Date(2015, 5, 18, 13, 37, 42, 666)
			var token = pseudoHex(8)

			var subscription = new ValidSubscription({
				initiative_uuid: this.initiative.uuid,
				created_at: createdAt,
				updated_at: createdAt,
				update_token: token,
				confirmation_sent_at: createdAt
			})

			yield subscriptionsDb.create(subscription)

			var path = `/initiatives/${this.initiative.uuid}/subscriptions`
			var res = yield this.request(`${path}/new?confirmation_token=${token}`)

			res.statusCode.must.equal(303)
			res.headers.location.must.equal(`${path}/${token}`)

			yield subscriptionsDb.read(subscription).must.then.eql({
				__proto__: subscription,
				confirmed_at: new Date,
				confirmation_sent_at: null,
				updated_at: new Date
			})
		})

		it("must confirm given a confirmation token and external initiative",
			function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				external: true
			}))

			var createdAt = new Date(2015, 5, 18, 13, 37, 42, 666)
			var token = pseudoHex(8)

			var subscription = new ValidSubscription({
				initiative_uuid: initiative.uuid,
				created_at: createdAt,
				updated_at: createdAt,
				update_token: token,
				confirmation_sent_at: createdAt
			})

			yield subscriptionsDb.create(subscription)

			var path = `/initiatives/${initiative.uuid}/subscriptions`
			var res = yield this.request(`${path}/new?confirmation_token=${token}`)

			res.statusCode.must.equal(303)
			res.headers.location.must.equal(`${path}/${token}`)

			yield subscriptionsDb.read(subscription).must.then.eql({
				__proto__: subscription,
				confirmed_at: new Date,
				confirmation_sent_at: null,
				updated_at: new Date
			})
		})

		it("must not confirm twice", function*() {
			var createdAt = new Date(2015, 5, 18, 13, 37, 42, 666)
			var token = pseudoHex(8)

			var subscription = new ValidSubscription({
				initiative_uuid: this.initiative.uuid,
				created_at: createdAt,
				updated_at: createdAt,
				confirmed_at: createdAt,
				update_token: token
			})

			yield subscriptionsDb.create(subscription)

			var path = `/initiatives/${this.initiative.uuid}/subscriptions`
			var res = yield this.request(`${path}/new?confirmation_token=${token}`)
			res.statusCode.must.equal(303)
			res.headers.location.must.equal(`${path}/${token}`)
			yield subscriptionsDb.read(subscription).must.then.eql(subscription)
		})

		it("must not confirm given the wrong token", function*() {
			var createdAt = new Date(2015, 5, 18, 13, 37, 42, 666)
			var token = pseudoHex(8)

			var subscription = new ValidSubscription({
				initiative_uuid: this.initiative.uuid,
				created_at: createdAt,
				updated_at: createdAt,
				update_token: token,
				confirmation_sent_at: createdAt
			})

			yield subscriptionsDb.create(subscription)

			var res = yield this.request(
				`/initiatives/${this.initiative.uuid}/subscriptions/new?confirmation_token=deadbeef`
			)

			res.statusCode.must.equal(404)
			yield subscriptionsDb.read(subscription).must.then.eql(subscription)
		})
	})

	describe("GET /:token", function() {
		require("root/test/fixtures").csrf()

		it("must show subscription page", function*() {
			var subscription = new ValidSubscription({
				initiative_uuid: this.initiative.uuid,
				confirmed_at: new Date
			})

			yield subscriptionsDb.create(subscription)

			var res = yield this.request(
				`/initiatives/${this.initiative.uuid}/subscriptions/${subscription.update_token}`
			)

			res.statusCode.must.equal(200)
			res.body.must.include(t("SUBSCRIPTION_UPDATE_TITLE"))
		})

		it("must show subscription page given an external initiative", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				external: true
			}))

			var subscription = new ValidSubscription({
				initiative_uuid: initiative.uuid,
				confirmed_at: new Date
			})

			yield subscriptionsDb.create(subscription)

			var res = yield this.request(
				`/initiatives/${initiative.uuid}/subscriptions/${subscription.update_token}`
			)

			res.statusCode.must.equal(200)
			res.body.must.include(t("SUBSCRIPTION_UPDATE_TITLE"))
		})

		it("must respond with 404 given invalid update token", function*() {
			// Still have a single subscription to ensure it's not picking randomly.
			yield subscriptionsDb.create(new ValidSubscription({
				initiative_uuid: this.initiative.uuid,
				confirmed_at: new Date
			}))

			var res = yield this.request(`/initiatives/${this.initiative.uuid}/subscriptions/beef`)
			res.statusCode.must.equal(404)
			res.body.must.include(t("SUBSCRIPTION_NOT_FOUND_TITLE"))
		})
	})

	describe("PUT /:token", function() {
		require("root/test/fixtures").csrf()
		require("root/test/time")()

		it("must update subscription", function*() {
			var sub = yield subscriptionsDb.create(new ValidSubscription({
				initiative_uuid: this.initiative.uuid,
				confirmed_at: new Date
			}))

			var path = `/initiatives/${this.initiative.uuid}/subscriptions/${sub.update_token}`
			var res = yield this.request(path, {
				method: "POST",
					form: {
						_method: "put",
						_csrf_token: this.csrfToken,
						official_interest: !sub.official_interest,
						author_interest: !sub.author_interest,
						comment_interest: !sub.comment_interest
					}
			})

			res.statusCode.must.equal(303)
			res.headers.location.must.equal(path)

			yield subscriptionsDb.read(sub).must.then.eql({
				__proto__: sub,
				updated_at: new Date,
				official_interest: !sub.official_interest,
				author_interest: !sub.author_interest,
				comment_interest: !sub.comment_interest
			})
		})

		it("must update subscription given an external initiative", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				external: true
			}))

			var sub = yield subscriptionsDb.create(new ValidSubscription({
				initiative_uuid: initiative.uuid,
				confirmed_at: new Date
			}))

			var path = `/initiatives/${initiative.uuid}/subscriptions/${sub.update_token}`
			var res = yield this.request(path, {
				method: "POST",
					form: {
						_method: "put",
						_csrf_token: this.csrfToken,
						official_interest: !sub.official_interest
					}
			})

			res.statusCode.must.equal(303)
			res.headers.location.must.equal(path)

			yield subscriptionsDb.read(sub).must.then.eql({
				__proto__: sub,
				updated_at: new Date,
				official_interest: !sub.official_interest
			})
		})

		it("must not update email", function*() {
			var sub = yield subscriptionsDb.create(new ValidSubscription({
				initiative_uuid: this.initiative.uuid,
				confirmed_at: new Date
			}))

			var path = `/initiatives/${this.initiative.uuid}/subscriptions/${sub.update_token}`
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
			// Still have a single subscription to ensure it's not picking randomly.
			var subscription = yield subscriptionsDb.create(new ValidSubscription({
				initiative_uuid: this.initiative.uuid,
				confirmed_at: new Date
			}))

			var res = yield this.request(
				`/initiatives/${this.initiative.uuid}/subscriptions/deadbeef`, {
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

	describe("DELETE /:token", function() {
		require("root/test/fixtures").csrf()

		it("must delete subscription", function*() {
			var subscription = yield subscriptionsDb.create(new ValidSubscription({
				initiative_uuid: this.initiative.uuid,
				confirmed_at: new Date
			}))

			var res = yield this.request(
				`/initiatives/${this.initiative.uuid}/subscriptions/${subscription.update_token}`, {
				method: "POST",
				form: {_method: "delete", _csrf_token: this.csrfToken}
			})

			res.statusCode.must.equal(303)
			res.headers.location.must.equal("/initiatives/" + this.initiative.uuid)

			yield subscriptionsDb.search(sql`
				SELECT * FROM initiative_subscriptions
			`).must.then.be.empty()
		})

		it("must delete subscription given an external initiative", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				external: true
			}))

			var subscription = yield subscriptionsDb.create(new ValidSubscription({
				initiative_uuid: initiative.uuid,
				confirmed_at: new Date
			}))

			var res = yield this.request(
				`/initiatives/${initiative.uuid}/subscriptions/${subscription.update_token}`, {
				method: "POST",
				form: {_method: "delete", _csrf_token: this.csrfToken}
			})

			res.statusCode.must.equal(303)
			res.headers.location.must.equal("/initiatives/" + initiative.uuid)

			yield subscriptionsDb.search(sql`
				SELECT * FROM initiative_subscriptions
			`).must.then.be.empty()
		})

		it("must respond with 404 given invalid update token", function*() {
			// Still have a single subscription to ensure it's not picking randomly.
			var subscription = yield subscriptionsDb.create(new ValidSubscription({
				initiative_uuid: this.initiative.uuid,
				confirmed_at: new Date
			}))

			var res = yield this.request(
				`/initiatives/${this.initiative.uuid}/subscriptions/deadbeef`, {
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
			var other = new ValidSubscription({
				initiative_uuid: this.initiative.uuid,
				confirmed_at: new Date
			})

			var subscription = new ValidSubscription({
				initiative_uuid: this.initiative.uuid,
				confirmed_at: new Date,
			})

			yield subscriptionsDb.create([other, subscription])

			var res = yield this.request(
				`/initiatives/${this.initiative.uuid}/subscriptions/${subscription.update_token}`, {
				method: "POST",
				form: {_method: "delete", _csrf_token: this.csrfToken}
			})

			res.statusCode.must.equal(303)
			res.headers.location.must.equal("/initiatives/" + this.initiative.uuid)

			yield subscriptionsDb.search(sql`
				SELECT * FROM initiative_subscriptions
			`).must.then.eql([other])
		})
	})
})
