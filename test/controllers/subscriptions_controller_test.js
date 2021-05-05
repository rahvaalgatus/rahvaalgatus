var _ = require("root/lib/underscore")
var Crypto = require("crypto")
var ValidSubscription = require("root/test/valid_subscription")
var ValidInitiative = require("root/test/valid_db_initiative")
var ValidUser = require("root/test/valid_user")
var pseudoHex = require("root/lib/crypto").pseudoHex
var sql = require("sqlate")
var subscriptionsDb = require("root/db/initiative_subscriptions_db")
var usersDb = require("root/db/users_db")
var initiativesDb = require("root/db/initiatives_db")
var {pseudoDateTime} = require("root/lib/crypto")
var parseDom = require("root/lib/dom").parse
var {parseCookies} = require("root/lib/http")
var {serializeCookies} = require("root/lib/http")
var t = require("root/lib/i18n").t.bind(null, "et")

describe("SubscriptionsController", function() {
	require("root/test/web")()
	require("root/test/mitm")()
	require("root/test/db")()
	beforeEach(require("root/test/mitm").router)

	beforeEach(function*() {
		this.author = yield usersDb.create(new ValidUser)
	})

	describe("GET /", function() {
		mustRequireToken(function(url) { return this.request(url) })

		it("must show page given subscription to initiatives", function*() {
			var subscription = yield subscriptionsDb.create(new ValidSubscription({
				confirmed_at: new Date
			}))

			var res = yield this.request(
				`/subscriptions?update-token=${subscription.update_token}`
			)

			res.statusCode.must.equal(200)
			res.body.must.include(t("SUBSCRIPTIONS_UPDATE_TITLE"))
			var el = parseDom(res.body).querySelectorAll("li.subscription")
			el.length.must.equal(1)
			el[0].textContent.must.include(t("SUBSCRIPTIONS_ALL_INITIATIVES"))
		})

		it("must not show unconfirmed subscription to initiatives", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				user_id: this.author.id
			}))

			var subscription = yield subscriptionsDb.create(new ValidSubscription({
				initiative_uuid: initiative.uuid,
				confirmed_at: new Date
			}))

			yield subscriptionsDb.create(new ValidSubscription({
				email: subscription.email
			}))

			var path = `/subscriptions`
			path += `?initiative=${subscription.initiative_uuid}`
			path += `&update-token=${subscription.update_token}`
			var res = yield this.request(path)

			res.statusCode.must.equal(200)
			res.body.must.include(t("SUBSCRIPTIONS_UPDATE_TITLE"))
			var el = parseDom(res.body).querySelectorAll("li.subscription")
			el.length.must.equal(1)
			el[0].innerHTML.must.include(subscription.initiative_uuid)
			el[0].textContent.must.not.include(t("SUBSCRIPTIONS_ALL_INITIATIVES"))
		})

		it("must show page given subscription to initiative", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				published_at: new Date
			}))

			var subscription = yield subscriptionsDb.create(new ValidSubscription({
				initiative_uuid: initiative.uuid,
				confirmed_at: new Date
			}))

			var res = yield this.request(
				`/subscriptions?initiative=${initiative.uuid}&update-token=${subscription.update_token}`
			)

			res.statusCode.must.equal(200)
			res.body.must.include(t("SUBSCRIPTIONS_UPDATE_TITLE"))
			res.body.must.include(initiative.title)
		})

		it("must show page given subscription to external initiative", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				phase: "parliament",
				external: true
			}))

			var subscription = yield subscriptionsDb.create(new ValidSubscription({
				initiative_uuid: initiative.uuid,
				confirmed_at: new Date
			}))

			var path = `/subscriptions`
			path += `?initiative=${subscription.initiative_uuid}`
			path += `&update-token=${subscription.update_token}`
			var res = yield this.request(path)
			res.statusCode.must.equal(200)
			res.body.must.include(t("SUBSCRIPTIONS_UPDATE_TITLE"))
			res.body.must.include(initiative.title)
		})

		it("must not show unconfirmed subscription to initiatives", function*() {
			var subscription = yield subscriptionsDb.create(new ValidSubscription({
				confirmed_at: new Date
			}))

			var initiative = yield initiativesDb.create(new ValidInitiative({
				phase: "parliament",
				external: true
			}))

			var other = yield subscriptionsDb.create(new ValidSubscription({
				email: subscription.email,
				initiative_uuid: initiative.uuid
			}))

			var res = yield this.request(
				`/subscriptions?update-token=${subscription.update_token}`
			)

			res.statusCode.must.equal(200)
			res.body.must.include(t("SUBSCRIPTIONS_UPDATE_TITLE"))
			var el = parseDom(res.body).querySelectorAll("li.subscription")
			el.length.must.equal(1)
			el[0].innerHTML.must.not.include(other.initiative_uuid)
			el[0].textContent.must.include(t("SUBSCRIPTIONS_ALL_INITIATIVES"))
		})

		it("must show all subscriptions for given email address", function*() {
			var initiatives = yield _.times(3, () => initiativesDb.create(
				new ValidInitiative({phase: "parliament", external: true})
			))

			var subscriptions = yield subscriptionsDb.create(initiatives.map((i) => (
				new ValidSubscription({
					email: "user@example.com",
					initiative_uuid: i.uuid,
					confirmed_at: new Date
				})
			)))

			var res = yield this.request(
				`/subscriptions?initiative=${initiatives[0].uuid}&update-token=${subscriptions[0].update_token}`
			)

			res.statusCode.must.equal(200)
			initiatives.forEach((i) => res.body.must.include(i.title))
		})

		it("must not show subscriptions for other email addresses", function*() {
			var other = yield initiativesDb.create(new ValidInitiative({
				phase: "parliament",
				external: true
			}))

			yield subscriptionsDb.create(new ValidSubscription({
				initiative_uuid: other.uuid,
				confirmed_at: new Date
			}))

			var subscription = yield subscriptionsDb.create(new ValidSubscription({
				confirmed_at: new Date
			}))

			var res = yield this.request(
				`/subscriptions?update-token=${subscription.update_token}`
			)

			res.statusCode.must.equal(200)
			res.body.must.not.include(other.title)
		})
	})

	describe("POST /", function() {
		require("root/test/fixtures").csrf()
		require("root/test/email")()
		require("root/test/time")(Date.UTC(2015, 5, 18))

		it("must subscribe", function*() {
			var res = yield this.request("/subscriptions", {
				method: "POST",
				form: {email: "user@example.com"}
			})

			res.statusCode.must.equal(303)
			res.headers.location.must.equal("/")

			var subscriptions = yield subscriptionsDb.search(sql`
				SELECT * FROM initiative_subscriptions
			`)

			subscriptions.length.must.equal(1)
			var subscription = subscriptions[0]

			subscription.must.eql(new ValidSubscription({
				email: "user@example.com",
				created_ip: "127.0.0.1",
				confirmation_sent_at: new Date,
				update_token: subscription.update_token
			}))

			subscription.update_token.must.exist()

			this.emails.length.must.equal(1)
			this.emails[0].envelope.to.must.eql(["user@example.com"])
			var body = String(this.emails[0].message)
			body.must.include(`confirmation_token=3D${subscription.update_token}`)

			var cookies = parseCookies(res.headers["set-cookie"])
			res = yield this.request(res.headers.location, {
				headers: {Cookie: serializeCookies(cookies)}
			})

			res.statusCode.must.equal(200)
			res.body.must.include(t("CONFIRM_INITIATIVES_SUBSCRIPTION"))
		})

		describe("when logged in", function() {
			require("root/test/fixtures").user()

			it("must subscribe with confirmed email", function*() {
				yield usersDb.update(this.user, {
					email: "user@example.com",
					email_confirmed_at: new Date
				})

				var res = yield this.request("/subscriptions", {
					method: "POST",
					form: {email: "user@example.com"}
				})

				res.statusCode.must.equal(303)

				var subscription = yield subscriptionsDb.read(sql`
					SELECT * FROM initiative_subscriptions
				`)

				subscription.must.eql(new ValidSubscription({
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
				res.body.must.include(t("CONFIRMED_INITIATIVES_SUBSCRIPTION"))
			})

			it("must subscribe with confirmed email case-insensitively", function*() {
				yield usersDb.update(this.user, {
					email: "USer@EXAMple.com",
					email_confirmed_at: new Date
				})

				var res = yield this.request("/subscriptions", {
					method: "POST",
					form: {email: "usER@examPLE.com"}
				})

				res.statusCode.must.equal(303)

				var subscription = yield subscriptionsDb.read(sql`
					SELECT * FROM initiative_subscriptions
				`)

				subscription.must.eql(new ValidSubscription({
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
				res.body.must.include(t("CONFIRMED_INITIATIVES_SUBSCRIPTION"))
			})

			it("must subscribe with unconfirmed email", function*() {
				yield usersDb.update(this.user, {
					unconfirmed_email: "user@example.com",
					email_confirmation_token: Crypto.randomBytes(12)
				})

				var res = yield this.request("/subscriptions", {
					method: "POST",
					form: {email: "user@example.com"}
				})

				res.statusCode.must.equal(303)

				var subscription = yield subscriptionsDb.read(sql`
					SELECT * FROM initiative_subscriptions
				`)

				subscription.must.eql(new ValidSubscription({
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
				res.body.must.include(t("CONFIRM_INITIATIVES_SUBSCRIPTION"))
			})

			it("must update if already subscribed", function*() {
				var subscription = yield subscriptionsDb.create(new ValidSubscription({
					confirmed_at: pseudoDateTime(),
					event_interest: false,
					comment_interest: true
				}))

				yield usersDb.update(this.user, {
					email: subscription.email,
					email_confirmed_at: new Date
				})

				var res = yield this.request("/subscriptions", {
					method: "POST",
					form: {email: subscription.email}
				})

				res.statusCode.must.equal(303)

				yield subscriptionsDb.read(sql`
					SELECT * FROM initiative_subscriptions
				`).must.then.eql({
					__proto__: subscription,
					confirmed_at: new Date,
					updated_at: new Date,
					event_interest: true
				})

				this.emails.length.must.equal(0)

				var cookies = parseCookies(res.headers["set-cookie"])
				res = yield this.request(res.headers.location, {
					headers: {Cookie: serializeCookies(cookies)}
				})

				res.statusCode.must.equal(200)
				res.body.must.include(t("CONFIRMED_INITIATIVES_SUBSCRIPTION"))
			})
		})

		it("must subscribe case-insensitively", function*() {
			var createdAt = new Date(2015, 5, 18, 13, 37, 42, 666)

			var subscription = yield subscriptionsDb.create(new ValidSubscription({
				email: "USer@EXAMple.com",
				created_at: createdAt,
				updated_at: createdAt,
				confirmed_at: createdAt,
				confirmation_sent_at: createdAt
			}))

			var res = yield this.request("/subscriptions", {
				method: "POST",
				form: {email: "usER@examPLE.com"}
			})

			res.statusCode.must.equal(303)
			res.headers.location.must.equal("/")

			var subs = yield subscriptionsDb.search(sql`SELECT * FROM initiative_subscriptions`)
			subs.must.eql([subscription])
			this.emails.length.must.equal(0)
		})

		it("must not resend confirmation email if less than an hour has passed",
			function*() {
			var subscription = yield subscriptionsDb.create(new ValidSubscription({
				confirmation_sent_at: new Date
			}))

			this.time.tick(3599 * 1000)
			var res = yield this.request("/subscriptions", {
				method: "POST",
				form: {email: subscription.email}
			})

			res.statusCode.must.equal(303)

			var subs = yield subscriptionsDb.search(sql`SELECT * FROM initiative_subscriptions`)
			subs.must.eql([subscription])
			this.emails.length.must.equal(0)
		})

		it("must resend confirmation email if an hour has passed", function*() {
			var subscription = yield subscriptionsDb.create(new ValidSubscription({
				confirmation_sent_at: new Date
			}))

			this.time.tick(3600 * 1000)
			var res = yield this.request("/subscriptions", {
				method: "POST",
				form: {email: subscription.email}
			})

			res.statusCode.must.equal(303)

			yield subscriptionsDb.search(sql`
				SELECT * FROM initiative_subscriptions
			`).must.then.eql([{
				__proto__: subscription,
				confirmation_sent_at: new Date
			}])

			this.emails.length.must.equal(1)
		})

		it("must send reminder email if confirmed and an hour has passed",
			function*() {
			var subscription = yield subscriptionsDb.create(new ValidSubscription({
				confirmed_at: new Date,
				confirmation_sent_at: new Date
			}))

			this.time.tick(3600 * 1000)
			var res = yield this.request("/subscriptions", {
				method: "POST",
				form: {email: subscription.email}
			})

			res.statusCode.must.equal(303)

			yield subscriptionsDb.read(subscription).must.then.eql({
				__proto__: subscription,
				confirmation_sent_at: new Date
			})

			this.emails.length.must.equal(1)
		})

		it("must respond with 422 given missing email", function*() {
			var res = yield this.request("/subscriptions", {
				method: "POST",
				form: {email: ""}
			})

			res.statusCode.must.equal(422)
			res.body.must.include(t("INVALID_EMAIL"))
		})

		it("must respond with 422 given invalid email", function*() {
			var res = yield this.request("/subscriptions", {
				method: "POST",
				form: {email: "fubar"}
			})

			res.statusCode.must.equal(422)
			res.body.must.include(t("INVALID_EMAIL"))
		})
	})

	describe("PUT /", function() {
		require("root/test/fixtures").csrf()
		require("root/test/time")()

		mustRequireToken(function(url) {
			return this.request(url, {method: "PUT"})
		})

		it("must update subscriptions to initiatives", function*() {
			var subscription = yield subscriptionsDb.create(new ValidSubscription({
				confirmed_at: new Date
			}))

			var path = `/subscriptions?update-token=${subscription.update_token}`
			var res = yield this.request(path, {
				method: "PUT",
				form: {
					"null[event_interest]": !subscription.event_interest,
					"null[comment_interest]": !subscription.comment_interest
				}
			})

			res.statusCode.must.equal(303)
			res.headers.location.must.equal(path)

			yield subscriptionsDb.read(subscription).must.then.eql({
				__proto__: subscription,
				updated_at: new Date,
				event_interest: !subscription.event_interest,
				comment_interest: !subscription.comment_interest
			})
		})

		it("must update subscription to initiative", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				published_at: new Date
			}))

			var subscription = yield subscriptionsDb.create(new ValidSubscription({
				initiative_uuid: initiative.uuid,
				confirmed_at: new Date
			}))

			var uuid = initiative.uuid
			var path = `/subscriptions`
			path += `?initiative=${subscription.initiative_uuid}`
			path += `&update-token=${subscription.update_token}`
			var res = yield this.request(path, {
				method: "PUT",
				form: {
					[uuid + "[event_interest]"]: !subscription.event_interest,
					[uuid + "[comment_interest]"]: !subscription.comment_interest
				}
			})

			res.statusCode.must.equal(303)
			res.headers.location.must.equal(path)

			yield subscriptionsDb.read(subscription).must.then.eql({
				__proto__: subscription,
				updated_at: new Date,
				event_interest: !subscription.event_interest,
				comment_interest: !subscription.comment_interest
			})
		})

		it("must update subscription to external initiative", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				phase: "parliament",
				external: true
			}))

			var subscription = yield subscriptionsDb.create(new ValidSubscription({
				initiative_uuid: initiative.uuid,
				confirmed_at: new Date
			}))

			var uuid = initiative.uuid
			var path = `/subscriptions?initiative=${uuid}&update-token=${subscription.update_token}`
			var res = yield this.request(path, {
				method: "PUT",
				form: {
					[uuid + "[event_interest]"]: !subscription.event_interest,
					[uuid + "[comment_interest]"]: !subscription.comment_interest
				}
			})

			res.statusCode.must.equal(303)
			res.headers.location.must.equal(path)

			yield subscriptionsDb.read(subscription).must.then.eql({
				__proto__: subscription,
				updated_at: new Date,
				event_interest: !subscription.event_interest,
				comment_interest: !subscription.comment_interest
			})
		})

		it("must not update unconfirmed subscription to initiative", function*() {
			var subscription = yield subscriptionsDb.create(new ValidSubscription({
				confirmed_at: new Date
			}))

			var initiative = yield initiativesDb.create(new ValidInitiative({
				user_id: this.author.id
			}))

			var other = yield subscriptionsDb.create(new ValidSubscription({
				email: subscription.email,
				initiative_uuid: initiative.uuid
			}))

			var uuid = initiative.uuid
			var path = `/subscriptions?update-token=${subscription.update_token}`
			var res = yield this.request(path, {
				method: "PUT",
				form: {[uuid + "[event_interest]"]: !subscription.event_interest}
			})

			res.statusCode.must.equal(303)
			res.headers.location.must.equal(path)

			yield subscriptionsDb.search(sql`
				SELECT * FROM initiative_subscriptions
			`).must.then.eql([subscription, other])
		})

		it("must not update subscription to initiative by other emails",
			function*() {
			var subscription = yield subscriptionsDb.create(new ValidSubscription({
				confirmed_at: new Date
			}))

			var initiative = yield initiativesDb.create(new ValidInitiative({
				user_id: this.author.id
			}))

			var other = yield subscriptionsDb.create(new ValidSubscription({
				initiative_uuid: initiative.uuid,
				confirmed_at: new Date
			}))

			var uuid = initiative.uuid
			var path = `/subscriptions?update-token=${subscription.update_token}`
			var res = yield this.request(path, {
				method: "PUT",
				form: {[uuid + "[event_interest]"]: !subscription.event_interest}
			})

			res.statusCode.must.equal(303)
			res.headers.location.must.equal(path)

			yield subscriptionsDb.search(sql`
				SELECT * FROM initiative_subscriptions
			`).must.then.eql([subscription, other])
		})

		it("must not update email", function*() {
			var subscription = yield subscriptionsDb.create(new ValidSubscription({
				confirmed_at: new Date
			}))

			var path = `/subscriptions?update-token=${subscription.update_token}`
			var res = yield this.request(path, {
				method: "PUT",
				form: {"null[email]": "root@example.com"}
			})

			res.statusCode.must.equal(303)

			yield subscriptionsDb.read(subscription).must.then.eql({
				__proto__: subscription,
				updated_at: new Date
			})
		})

		it("must delete subscription to initiatives", function*() {
			var subscription = yield subscriptionsDb.create(new ValidSubscription({
				confirmed_at: new Date
			}))

			var path = `/subscriptions?update-token=${subscription.update_token}`
			var res = yield this.request(path, {
				method: "PUT",
				form: {"null[delete]": true}
			})

			res.statusCode.must.equal(303)
			res.headers.location.must.equal("/")

			yield subscriptionsDb.search(sql`
				SELECT * FROM initiative_subscriptions
			`).must.then.be.empty()
		})

		it("must delete subscription to initiative", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				published_at: new Date
			}))

			var subscription = yield subscriptionsDb.create(new ValidSubscription({
				initiative_uuid: initiative.uuid,
				confirmed_at: new Date
			}))

			var path = `/subscriptions`
			path += `?initiative=${subscription.initiative_uuid}`
			path += `&update-token=${subscription.update_token}`
			var res = yield this.request(path, {
				method: "PUT",
				form: {[subscription.initiative_uuid + "[delete]"]: true}
			})

			res.statusCode.must.equal(303)
			res.headers.location.must.equal("/")

			yield subscriptionsDb.search(sql`
				SELECT * FROM initiative_subscriptions
			`).must.then.be.empty()
		})

		it("must delete subscription to external initiative", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				phase: "parliament",
				external: true
			}))

			var subscription = yield subscriptionsDb.create(new ValidSubscription({
				initiative_uuid: initiative.uuid,
				confirmed_at: new Date
			}))

			var path = `/subscriptions`
			path += `?initiative=${subscription.initiative_uuid}`
			path += `&update-token=${subscription.update_token}`
			var res = yield this.request(path, {
				method: "PUT",
				form: {[subscription.initiative_uuid + "[delete]"]: true}
			})

			res.statusCode.must.equal(303)
			res.headers.location.must.equal("/")

			yield subscriptionsDb.search(sql`
				SELECT * FROM initiative_subscriptions
			`).must.then.be.empty()
		})

		it("must not delete unconfirmed subscription to initiatives", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				phase: "parliament",
				external: true
			}))

			var subscription = yield subscriptionsDb.create(new ValidSubscription({
				initiative_uuid: initiative.uuid,
				confirmed_at: new Date
			}))

			var other = yield subscriptionsDb.create(new ValidSubscription({
				email: subscription.email
			}))

			var path = `/subscriptions`
			path += `?initiative=${subscription.initiative_uuid}`
			path += `&update-token=${subscription.update_token}`
			var res = yield this.request(path, {
				method: "PUT",
				form: {"null[delete]": true}
			})

			res.statusCode.must.equal(303)
			res.headers.location.must.equal(path)

			yield subscriptionsDb.search(sql`
				SELECT * FROM initiative_subscriptions
			`).must.then.eql([subscription, other])
		})

		it("must redirect back if deleting another subscription", function*() {
			var subscription = yield subscriptionsDb.create(new ValidSubscription({
				confirmed_at: new Date
			}))

			var initiative = yield initiativesDb.create(new ValidInitiative({
				user_id: this.author.id
			}))

			var other = yield subscriptionsDb.create(new ValidSubscription({
				email: subscription.email,
				initiative_uuid: initiative.uuid,
				confirmed_at: new Date
			}))

			var path = `/subscriptions?update-token=${subscription.update_token}`
			var res = yield this.request(path, {
				method: "PUT",
				form: {[other.initiative_uuid + "[delete]"]: true}
			})

			res.statusCode.must.equal(303)
			res.headers.location.must.equal(path)

			yield subscriptionsDb.search(sql`
				SELECT * FROM initiative_subscriptions
			`).must.then.eql([subscription])
		})

		it("must redirect to subscription to initiatives if deleting given",
			function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				user_id: this.author.id
			}))

			var subscription = yield subscriptionsDb.create(new ValidSubscription({
				initiative_uuid: initiative.uuid,
				confirmed_at: new Date
			}))

			var other = yield subscriptionsDb.create(new ValidSubscription({
				email: subscription.email,
				confirmed_at: new Date
			}))

			var path = `/subscriptions`
			path += `?initiative=${subscription.initiative_uuid}`
			path += `&update-token=${subscription.update_token}`
			var res = yield this.request(path, {
				method: "PUT",
				form: {[subscription.initiative_uuid + "[delete]"]: true}
			})

			res.statusCode.must.equal(303)
			path = `/subscriptions?update-token=${other.update_token}`
			res.headers.location.must.equal(path)

			yield subscriptionsDb.search(sql`
				SELECT * FROM initiative_subscriptions
			`).must.then.eql([other])
		})

		it("must redirect to subscription to initiative if deleting given",
			function*() {
			var subscription = yield subscriptionsDb.create(new ValidSubscription({
				confirmed_at: new Date
			}))

			var initiative = yield initiativesDb.create(new ValidInitiative({
				user_id: this.author.id
			}))

			var other = yield subscriptionsDb.create(new ValidSubscription({
				email: subscription.email,
				initiative_uuid: initiative.uuid,
				confirmed_at: new Date
			}))

				var path = `/subscriptions?update-token=${subscription.update_token}`
			var res = yield this.request(path, {
				method: "PUT",
				form: {"null[delete]": true}
			})

			res.statusCode.must.equal(303)
			path = `/subscriptions`
			path += `?initiative=${other.initiative_uuid}`
			path += `&update-token=${other.update_token}`
			res.headers.location.must.equal(path)

			yield subscriptionsDb.search(sql`
				SELECT * FROM initiative_subscriptions
			`).must.then.eql([other])
		})

		it("must not delete other subscriptions of the same email", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				user_id: this.author.id
			}))

			var subscription = yield subscriptionsDb.create(new ValidSubscription({
				initiative_uuid: initiative.uuid,
				confirmed_at: new Date
			}))

			var otherInitiative = yield initiativesDb.create(new ValidInitiative({
				user_id: this.author.id
			}))

			var others = yield subscriptionsDb.create([
				new ValidSubscription({
					email: subscription.email,
					confirmed_at: new Date
				}),

				new ValidSubscription({
					email: subscription.email,
					initiative_uuid: otherInitiative.uuid,
					confirmed_at: new Date
				})
			])

			var path = `/subscriptions`
			path += `?initiative=${subscription.initiative_uuid}`
			path += `&update-token=${subscription.update_token}`
			var res = yield this.request(path, {
				method: "PUT",
				form: {[subscription.initiative_uuid + "[delete]"]: true}
			})

			res.statusCode.must.equal(303)
			path = `/subscriptions?update-token=${others[0].update_token}`
			res.headers.location.must.equal(path)

			yield subscriptionsDb.search(sql`
				SELECT * FROM initiative_subscriptions
			`).must.then.eql(others)
		})

		it("must not delete other subscriptions on the same initiative",
			function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				user_id: this.author.id
			}))

			var others = yield subscriptionsDb.create([
				new ValidSubscription({confirmed_at: new Date}),

				new ValidSubscription({
					initiative_uuid: initiative.uuid,
					confirmed_at: new Date
				})
			])

			var subscription = yield subscriptionsDb.create(new ValidSubscription({
				initiative_uuid: initiative.uuid,
				confirmed_at: new Date
			}))

			var path = `/subscriptions`
			path += `?initiative=${subscription.initiative_uuid}`
			path += `&update-token=${subscription.update_token}`
			var res = yield this.request(path, {
				method: "PUT",
				form: {[subscription.initiative_uuid + "[delete]"]: true}
			})

			res.statusCode.must.equal(303)
			res.headers.location.must.equal("/")

			yield subscriptionsDb.search(sql`
				SELECT * FROM initiative_subscriptions
			`).must.then.eql(others)
		})
	})

	describe("DELETE /", function() {
		require("root/test/fixtures").csrf()

		mustRequireToken(function(url) {
			return this.request(url, {method: "DELETE"})
		})

		it("must delete subscriptions for a given email address", function*() {
			var subscription = yield subscriptionsDb.create(new ValidSubscription({
				confirmed_at: new Date
			}))

			var initiatives = yield _.times(3, () => initiativesDb.create(
				new ValidInitiative({phase: "parliament", external: true})
			))

			yield subscriptionsDb.create(initiatives.map((i) => (
				new ValidSubscription({
					email: subscription.email,
					initiative_uuid: i.uuid,
					confirmed_at: new Date
				})
			)))

			var path = `/subscriptions?update-token=${subscription.update_token}`
			var res = yield this.request(path, {method: "DELETE"})
			res.statusCode.must.equal(303)
			res.headers.location.must.equal("/")

			yield subscriptionsDb.search(sql`
				SELECT * FROM initiative_subscriptions
			`).must.then.be.empty()
		})

		it("must not delete unconfirmed subscriptions", function*() {
			var initiatives = yield _.times(2, () => initiativesDb.create(
				new ValidInitiative({phase: "parliament", external: true})
			))

			var unconfirmed = yield subscriptionsDb.create(new ValidSubscription({
				email: "user@example.com",
				initiative_uuid: initiatives[0].uuid
			}))

			var subscription = yield subscriptionsDb.create(new ValidSubscription({
				email: "user@example.com",
				initiative_uuid: initiatives[1].uuid,
				confirmed_at: new Date
			}))

			var path = "/subscriptions"
			path += `?initiative=${subscription.initiative_uuid}`
			path += `&update-token=${subscription.update_token}`
			var res = yield this.request(path, {method: "DELETE"})
			res.statusCode.must.equal(303)
			res.headers.location.must.equal("/")

			yield subscriptionsDb.search(sql`
				SELECT * FROM initiative_subscriptions
			`).must.then.eql([unconfirmed])
		})

		it("must not delete subscriptions by other emails", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				phase: "parliament",
				external: true
			}))

			var subscriptions = yield subscriptionsDb.create([
				new ValidSubscription({
					confirmed_at: new Date
				}),

				new ValidSubscription({
					initiative_uuid: initiative.uuid,
					confirmed_at: new Date
				})
			])

			var subscription = yield subscriptionsDb.create(new ValidSubscription({
				confirmed_at: new Date,
			}))

			var res = yield this.request(
				`/subscriptions?update-token=${subscription.update_token}`,
				{method: "DELETE"}
			)

			res.statusCode.must.equal(303)
			res.headers.location.must.equal("/")

			yield subscriptionsDb.search(sql`
				SELECT * FROM initiative_subscriptions
			`).must.then.eql(subscriptions)
		})
	})

	describe("GET /new", function() {
		require("root/test/fixtures").csrf()
		require("root/test/email")()
		require("root/test/time")(Date.UTC(2015, 5, 18))

		it("must confirm given a confirmation token", function*() {
			var createdAt = new Date(2015, 5, 18, 13, 37, 42, 666)
			var token = pseudoHex(8)

			var subscription = yield subscriptionsDb.create(new ValidSubscription({
				created_at: createdAt,
				updated_at: createdAt,
				update_token: token,
				confirmation_sent_at: createdAt
			}))

			var path = `/subscriptions`
			var res = yield this.request(`${path}/new?confirmation_token=${token}`)
			res.statusCode.must.equal(303)
			res.headers.location.must.equal(`${path}/${token}`)

			yield subscriptionsDb.read(subscription).must.then.eql({
				__proto__: subscription,
				confirmed_at: new Date,
				updated_at: new Date
			})
		})

		it("must not confirm twice", function*() {
			var createdAt = new Date(2015, 5, 18, 13, 37, 42, 666)
			var token = pseudoHex(8)

			var subscription = yield subscriptionsDb.create(new ValidSubscription({
				created_at: createdAt,
				updated_at: createdAt,
				confirmed_at: createdAt,
				update_token: token
			}))

			var path = `/subscriptions`
			var res = yield this.request(`${path}/new?confirmation_token=${token}`)
			res.statusCode.must.equal(303)
			res.headers.location.must.equal(`${path}/${token}`)
			yield subscriptionsDb.read(subscription).must.then.eql(subscription)
		})

		it("must not confirm given the wrong token", function*() {
			var createdAt = new Date(2015, 5, 18, 13, 37, 42, 666)
			var token = pseudoHex(8)

			var subscription = yield subscriptionsDb.create(new ValidSubscription({
				created_at: createdAt,
				updated_at: createdAt,
				update_token: token,
				confirmation_sent_at: createdAt
			}))

			var res = yield this.request(
				"/subscriptions/new?confirmation_token=deadbeef"
			)

			res.statusCode.must.equal(404)
			yield subscriptionsDb.read(subscription).must.then.eql(subscription)
		})
	})

	describe("GET /:token", function() {
		require("root/test/fixtures").csrf()

		it("must redirect to subscriptions page", function*() {
			var subscription = yield subscriptionsDb.create(new ValidSubscription({
				confirmed_at: new Date
			}))

			var res = yield this.request(
				`/subscriptions/${subscription.update_token}`
			)

			res.statusCode.must.equal(302)
			var path = "/subscriptions?update-token=" + subscription.update_token
			res.headers.location.must.equal(path)
		})

		it("must redirect to subscriptions page if ends with period", function*() {
			var subscription = yield subscriptionsDb.create(new ValidSubscription({
				confirmed_at: new Date
			}))

			var res = yield this.request(
				`/subscriptions/${subscription.update_token}.`
			)

			res.statusCode.must.equal(302)
			var path = "/subscriptions?update-token=" + subscription.update_token
			res.headers.location.must.equal(path)
		})

		it("must respond with 404 given invalid update token", function*() {
			// Still have a single subscription to ensure it's not picking randomly.
			yield subscriptionsDb.create(new ValidSubscription({confirmed_at: new Date}))
			var res = yield this.request("/subscriptions/beef")
			res.statusCode.must.equal(404)
			res.body.must.include(t("SUBSCRIPTION_NOT_FOUND_TITLE"))
		})
	})
})

function mustRequireToken(request) {
	describe("as an authenticated endpoint", function() {
		it("must respond with 404 given an invalid update token", function*() {
			// Still have a single subscription to ensure it's not picking randomly.
			yield subscriptionsDb.create(new ValidSubscription({confirmed_at: new Date}))
			var res = yield request.call(this, "/subscriptions?update-token=beef")
			res.statusCode.must.equal(404)
			res.body.must.include(t("SUBSCRIPTION_NOT_FOUND_TITLE"))
		})

		it("must respond with 404 given an update token for an unconfirmed subscription", function*() {
			var subscription = yield subscriptionsDb.create(new ValidSubscription)
			var path = `/subscriptions?update-token=${subscription.update_token}`
			var res = yield request.call(this, path)
			res.statusCode.must.equal(404)
			res.body.must.include(t("SUBSCRIPTION_NOT_FOUND_TITLE"))
		})

		it("must respond with 404 given an update token of a subscription to initiative", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				phase: "parliament",
				external: true
			}))

			var subscription = yield subscriptionsDb.create(new ValidSubscription({
				initiative_uuid: initiative.uuid,
				confirmed_at: new Date
			}))

			var res = yield request.call(
				this,
				`/subscriptions?update-token=${subscription.update_token}`
			)

			res.statusCode.must.equal(404)
			res.body.must.include(t("SUBSCRIPTION_NOT_FOUND_TITLE"))
		})

		it("must respond with 404 given an update token of an unconfirmed subscription to initiative", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				phase: "parliament",
				external: true
			}))

			var subscription = yield subscriptionsDb.create(new ValidSubscription({
				initiative_uuid: initiative.uuid
			}))

			var path = `/subscriptions`
			path += `?initiative=${subscription.initiative_uuid}`
			path += `&update-token=${subscription.update_token}`
			var res = yield request.call(this, path)
			res.statusCode.must.equal(404)
			res.body.must.include(t("SUBSCRIPTION_NOT_FOUND_TITLE"))
		})

		it("must respond with 404 given an initiative uuid and update token of a subscription without initiative", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				phase: "parliament",
				external: true
			}))

			var subscription = yield subscriptionsDb.create(new ValidSubscription({
				confirmed_at: new Date
			}))

			var path = "/subscriptions"
			path += `?initiative=${initiative.uuid}`
			path += `&update-token=${subscription.update_token}`
			var res = yield request.call(this, path)
			res.statusCode.must.equal(404)
			res.body.must.include(t("SUBSCRIPTION_NOT_FOUND_TITLE"))
		})

		it("must respond with 404 given an initiative uuid and invalid update token", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				phase: "parliament",
				external: true
			}))

			yield subscriptionsDb.create(new ValidSubscription({
				initiative_uuid: initiative.uuid,
				confirmed_at: new Date
			}))

			var res = yield request.call(
				this,
				`/subscriptions?update-token=beef&initiative=${initiative.uuid}`
			)

			res.statusCode.must.equal(404)
			res.body.must.include(t("SUBSCRIPTION_NOT_FOUND_TITLE"))
		})
	})
}
