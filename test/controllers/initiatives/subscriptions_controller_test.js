var Crypto = require("crypto")
var ValidInitiative = require("root/test/valid_db_initiative")
var ValidSubscription = require("root/test/valid_subscription")
var ValidUser = require("root/test/valid_user")
var t = require("root/lib/i18n").t.bind(null, "et")
var sql = require("sqlate")
var {parseCookies} = require("root/lib/http")
var {serializeCookies} = require("root/lib/http")
var {pseudoHex} = require("root/lib/crypto")
var usersDb = require("root/db/users_db")
var subscriptionsDb = require("root/db/initiative_subscriptions_db")
var initiativesDb = require("root/db/initiatives_db")
var {pseudoDateTime} = require("root/lib/crypto")

describe("InitiativeSubscriptionsController", function() {
	require("root/test/web")()
	require("root/test/mitm")()
	require("root/test/db")()
	require("root/test/email")()
	beforeEach(require("root/test/mitm").router)

	beforeEach(function*() {
		this.author = yield usersDb.create(new ValidUser)

		this.initiative = yield initiativesDb.create(new ValidInitiative({
			user_id: this.author.id,
			published_at: new Date
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
				form: {email: "user@example.com"}
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
				created_ip: "127.0.0.1",
				confirmation_sent_at: new Date,
				update_token: subscription.update_token
			}))

			subscription.update_token.must.exist()

			this.emails.length.must.equal(1)
			this.emails[0].envelope.to.must.eql(["user@example.com"])
			var body = String(this.emails[0].message)
			body.match(/^Subject: .*/m)[0].must.include(this.initiative.title)
			body.must.include(`confirmation_token=3D${subscription.update_token}`)
		})

		it("must subscribe given an external initiative", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				phase: "parliament",
				external: true
			}))

			var path = `/initiatives/${initiative.uuid}/subscriptions`
			var res = yield this.request(path, {
				method: "POST",
				form: {email: "user@example.com"}
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

		describe("when logged in", function() {
			require("root/test/fixtures").user()

			it("must subscribe with confirmed email", function*() {
				yield usersDb.update(this.user, {
					email: "user@example.com",
					email_confirmed_at: new Date
				})

				var path = `/initiatives/${this.initiative.uuid}/subscriptions`
				var res = yield this.request(path, {
					method: "POST",
					form: {email: "user@example.com"}
				})

				res.statusCode.must.equal(303)

				var subscription = yield subscriptionsDb.read(sql`
					SELECT * FROM initiative_subscriptions
				`)

				subscription.must.eql(new ValidSubscription({
					initiative_uuid: this.initiative.uuid,
					email: "user@example.com",
					created_ip: "127.0.0.1",
					confirmed_at: new Date,
					update_token: subscription.update_token
				}))

				this.emails.length.must.equal(0)

				var cookies = parseCookies(res.headers["set-cookie"])
				res = yield this.request(res.headers.location, {
					headers: {Cookie: serializeCookies(cookies)}
				})

				res.statusCode.must.equal(200)
				res.body.must.include(t("CONFIRMED_INITIATIVE_SUBSCRIPTION"))
			})

			it("must subscribe with confirmed email case-insensitively", function*() {
				yield usersDb.update(this.user, {
					email: "USer@EXAMple.com",
					email_confirmed_at: new Date
				})

				var path = `/initiatives/${this.initiative.uuid}/subscriptions`
				var res = yield this.request(path, {
					method: "POST",
					form: {email: "usER@examPLE.com"}
				})

				res.statusCode.must.equal(303)

				var subscription = yield subscriptionsDb.read(sql`
					SELECT * FROM initiative_subscriptions
				`)

				subscription.must.eql(new ValidSubscription({
					initiative_uuid: this.initiative.uuid,
					email: "usER@examPLE.com",
					created_ip: "127.0.0.1",
					confirmed_at: new Date,
					update_token: subscription.update_token
				}))

				this.emails.length.must.equal(0)

				var cookies = parseCookies(res.headers["set-cookie"])
				res = yield this.request(res.headers.location, {
					headers: {Cookie: serializeCookies(cookies)}
				})

				res.statusCode.must.equal(200)
				res.body.must.include(t("CONFIRMED_INITIATIVE_SUBSCRIPTION"))
			})

			it("must subscribe with unconfirmed email", function*() {
				yield usersDb.update(this.user, {
					unconfirmed_email: "user@example.com",
					email_confirmation_token: Crypto.randomBytes(12)
				})

				var path = `/initiatives/${this.initiative.uuid}/subscriptions`
				var res = yield this.request(path, {
					method: "POST",
					form: {email: "user@example.com"}
				})

				res.statusCode.must.equal(303)

				var subscription = yield subscriptionsDb.read(sql`
					SELECT * FROM initiative_subscriptions
				`)

				subscription.must.eql(new ValidSubscription({
					initiative_uuid: this.initiative.uuid,
					email: "user@example.com",
					created_ip: "127.0.0.1",
					confirmation_sent_at: new Date,
					update_token: subscription.update_token
				}))

				this.emails.length.must.equal(1)

				var cookies = parseCookies(res.headers["set-cookie"])
				res = yield this.request(res.headers.location, {
					headers: {Cookie: serializeCookies(cookies)}
				})

				res.statusCode.must.equal(200)
				res.body.must.include(t("CONFIRM_INITIATIVE_SUBSCRIPTION"))
			})

			it("must update if already subscribed", function*() {
				var subscription = yield subscriptionsDb.create(new ValidSubscription({
					initiative_uuid: this.initiative.uuid,
					confirmed_at: pseudoDateTime(),
					official_interest: false,
					author_interest: false,
					comment_interest: true,
				}))

				yield usersDb.update(this.user, {
					email: subscription.email,
					email_confirmed_at: new Date
				})

				var path = `/initiatives/${this.initiative.uuid}/subscriptions`
				var res = yield this.request(path, {
					method: "POST",
					form: {email: subscription.email}
				})

				res.statusCode.must.equal(303)

				yield subscriptionsDb.read(sql`
					SELECT * FROM initiative_subscriptions
				`).must.then.eql({
					__proto__: subscription,
					updated_at: new Date,
					official_interest: true,
					author_interest: true
				})

				this.emails.length.must.equal(0)

				var cookies = parseCookies(res.headers["set-cookie"])
				res = yield this.request(res.headers.location, {
					headers: {Cookie: serializeCookies(cookies)}
				})

				res.statusCode.must.equal(200)
				res.body.must.include(t("CONFIRMED_INITIATIVE_SUBSCRIPTION"))
			})
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
				form: {email: email.toUpperCase()}
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
				form: {email: subscription.email}
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
				form: {email: subscription.email}
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
				form: {email: subscription.email}
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

		it("must respond with 401 if discussion not published", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				user_id: this.author.id
			}))

			var path = `/initiatives/${initiative.uuid}/subscriptions`
			var res = yield this.request(path, {
				method: "POST",
				form: {email: "user@example.com"}
			})

			res.statusCode.must.equal(401)
			res.statusMessage.must.equal("Initiative Not Public")
		})

		it("must respond with 422 given missing email", function*() {
			var res = yield this.request(`/initiatives/${this.initiative.uuid}/subscriptions`, {
				method: "POST",
				form: {email: ""}
			})

			res.statusCode.must.equal(422)
		})

		it("must respond with 422 given invalid email", function*() {
			var res = yield this.request(`/initiatives/${this.initiative.uuid}/subscriptions`, {
				method: "POST",
				form: {email: "fubar"}
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
				phase: "parliament",
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

		it("must redirect to subscriptions page", function*() {
			var subscription = yield subscriptionsDb.create(new ValidSubscription({
				initiative_uuid: this.initiative.uuid,
				confirmed_at: new Date
			}))

			var res = yield this.request(
				`/initiatives/${this.initiative.uuid}/subscriptions/${subscription.update_token}`
			)

			res.statusCode.must.equal(302)
			var path = "/subscriptions"
			path += "?initiative=" + subscription.initiative_uuid
			path += "&update-token=" + subscription.update_token
			path += "#subscription-" + subscription.initiative_uuid
			res.headers.location.must.equal(path)
		})

		it("must redirect to subscriptions page if ends with period", function*() {
			var subscription = yield subscriptionsDb.create(new ValidSubscription({
				initiative_uuid: this.initiative.uuid,
				confirmed_at: new Date
			}))

			var res = yield this.request(
				`/initiatives/${this.initiative.uuid}/subscriptions/${subscription.update_token}.`
			)

			res.statusCode.must.equal(302)
			var path = "/subscriptions"
			path += "?initiative=" + subscription.initiative_uuid
			path += "&update-token=" + subscription.update_token
			path += "#subscription-" + subscription.initiative_uuid
			res.headers.location.must.equal(path)
		})

		it("must redirect to subscriptions page given an external initiative",
			function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				phase: "parliament",
				external: true
			}))

			var subscription = yield subscriptionsDb.create(new ValidSubscription({
				initiative_uuid: initiative.uuid,
				confirmed_at: new Date
			}))

			var res = yield this.request(
				`/initiatives/${initiative.uuid}/subscriptions/${subscription.update_token}`
			)

			res.statusCode.must.equal(302)
			var path = "/subscriptions"
			path += "?initiative=" + subscription.initiative_uuid
			path += "&update-token=" + subscription.update_token
			path += "#subscription-" + subscription.initiative_uuid
			res.headers.location.must.equal(path)
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
})
