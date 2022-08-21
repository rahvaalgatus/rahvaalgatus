var _ = require("root/lib/underscore")
var Crypto = require("crypto")
var ValidSubscription = require("root/test/valid_subscription")
var ValidInitiative = require("root/test/valid_initiative")
var ValidUser = require("root/test/valid_user")
var pseudoHex = require("root/lib/crypto").pseudoHex
var sql = require("sqlate")
var subscriptionsDb = require("root/db/initiative_subscriptions_db")
var usersDb = require("root/db/users_db")
var initiativesDb = require("root/db/initiatives_db")
var {pseudoDateTime} = require("root/lib/crypto")
var parseHtml = require("root/test/html").parse
var {parseCookies} = require("root/test/web")
var {serializeCookies} = require("root/test/web")
var renderEmail = require("root/lib/i18n").email.bind(null, "et")
var t = require("root/lib/i18n").t.bind(null, "et")

describe("SubscriptionsController", function() {
	require("root/test/web")()
	require("root/test/mitm")()
	require("root/test/db")()
	beforeEach(require("root/test/mitm").router)

	beforeEach(function() { this.author = usersDb.create(new ValidUser) })

	describe("GET /", function() {
		mustRequireToken(function(url) { return this.request(url) })

		it("must show page given subscription to initiatives", function*() {
			var subscription = subscriptionsDb.create(new ValidSubscription({
				confirmed_at: new Date
			}))

			var res = yield this.request(
				`/subscriptions?update-token=${subscription.update_token}`
			)

			res.statusCode.must.equal(200)
			res.body.must.include(t("SUBSCRIPTIONS_UPDATE_TITLE"))
			var el = parseHtml(res.body).querySelectorAll("li.subscription")
			el.length.must.equal(1)
			el[0].textContent.must.include(t("SUBSCRIPTIONS_ALL_INITIATIVES"))
		})

		it("must not show unconfirmed subscription to initiatives", function*() {
			var initiative = initiativesDb.create(new ValidInitiative({
				user_id: this.author.id
			}))

			var subscription = subscriptionsDb.create(new ValidSubscription({
				initiative_uuid: initiative.uuid,
				confirmed_at: new Date
			}))

			subscriptionsDb.create(new ValidSubscription({
				email: subscription.email
			}))

			var path = `/subscriptions`
			path += `?initiative=${subscription.initiative_uuid}`
			path += `&update-token=${subscription.update_token}`
			var res = yield this.request(path)

			res.statusCode.must.equal(200)
			res.body.must.include(t("SUBSCRIPTIONS_UPDATE_TITLE"))
			var el = parseHtml(res.body).querySelectorAll("li.subscription")
			el.length.must.equal(1)
			el[0].innerHTML.must.include(subscription.initiative_uuid)
			el[0].textContent.must.not.include(t("SUBSCRIPTIONS_ALL_INITIATIVES"))
		})

		it("must show page given subscription to initiative", function*() {
			var initiative = initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				published_at: new Date
			}))

			var subscription = subscriptionsDb.create(new ValidSubscription({
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
			var initiative = initiativesDb.create(new ValidInitiative({
				phase: "parliament",
				external: true
			}))

			var subscription = subscriptionsDb.create(new ValidSubscription({
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
			var subscription = subscriptionsDb.create(new ValidSubscription({
				confirmed_at: new Date
			}))

			var initiative = initiativesDb.create(new ValidInitiative({
				phase: "parliament",
				external: true
			}))

			var other = subscriptionsDb.create(new ValidSubscription({
				email: subscription.email,
				initiative_uuid: initiative.uuid
			}))

			var res = yield this.request(
				`/subscriptions?update-token=${subscription.update_token}`
			)

			res.statusCode.must.equal(200)
			res.body.must.include(t("SUBSCRIPTIONS_UPDATE_TITLE"))
			var el = parseHtml(res.body).querySelectorAll("li.subscription")
			el.length.must.equal(1)
			el[0].innerHTML.must.not.include(other.initiative_uuid)
			el[0].textContent.must.include(t("SUBSCRIPTIONS_ALL_INITIATIVES"))
		})

		it("must show all subscriptions for given email address", function*() {
			var initiatives = _.times(3, () => initiativesDb.create(
				new ValidInitiative({phase: "parliament", external: true})
			))

			var subscriptions = subscriptionsDb.create(initiatives.map((i) => (
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
			var other = initiativesDb.create(new ValidInitiative({
				phase: "parliament",
				external: true
			}))

			subscriptionsDb.create(new ValidSubscription({
				initiative_uuid: other.uuid,
				confirmed_at: new Date
			}))

			var subscription = subscriptionsDb.create(new ValidSubscription({
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
				form: {
					email: "user@example.com",
					new_interest: true,
					signable_interest: true,
					event_interest: true,
					comment_interest: true
				}
			})

			res.statusCode.must.equal(303)
			res.headers.location.must.equal("/")

			var subscriptions = subscriptionsDb.search(sql`
				SELECT * FROM initiative_subscriptions
			`)

			subscriptions.length.must.equal(1)
			var subscription = subscriptions[0]

			subscription.must.eql(new ValidSubscription({
				email: "user@example.com",
				created_ip: "127.0.0.1",
				confirmation_sent_at: new Date,
				update_token: subscription.update_token,
				new_interest: true,
				signable_interest: true,
				event_interest: true,
				comment_interest: true
			}))

			subscription.update_token.must.exist()

			this.emails.length.must.equal(1)
			var email = this.emails[0]
			email.envelope.to.must.eql(["user@example.com"])

			email.headers.subject.must.equal(
				t("CONFIRM_INITIATIVES_SUBSCRIPTION_TITLE")
			)

			email.body.must.equal(
				renderEmail("CONFIRM_INITIATIVES_SUBSCRIPTION_BODY", {
					url: `${this.url}/subscriptions/new?confirmation_token=` +
						subscription.update_token
				})
			)

			var cookies = parseCookies(res.headers["set-cookie"])
			res = yield this.request(res.headers.location, {
				headers: {Cookie: serializeCookies(cookies)}
			})

			res.statusCode.must.equal(200)
			res.body.must.include(t("CONFIRM_INITIATIVES_SUBSCRIPTION"))
		})

		it("must subscribe to defaults if some missing", function*() {
			var res = yield this.request("/subscriptions", {
				method: "POST",
				form: {
					email: "user@example.com",
					signable_interest: false,
					comment_interest: true
				}
			})

			res.statusCode.must.equal(303)

			var subscription = subscriptionsDb.read(sql`
				SELECT * FROM initiative_subscriptions
			`)

			subscription.must.eql(new ValidSubscription({
				email: "user@example.com",
				created_ip: "127.0.0.1",
				confirmation_sent_at: new Date,
				update_token: subscription.update_token,
				new_interest: true,
				signable_interest: false,
				event_interest: false,
				comment_interest: true
			}))
		})

		describe("when logged in", function() {
			require("root/test/fixtures").user()

			it("must subscribe with confirmed email", function*() {
				usersDb.update(this.user, {
					email: "user@example.com",
					email_confirmed_at: new Date
				})

				var res = yield this.request("/subscriptions", {
					method: "POST",
					form: {email: "user@example.com"}
				})

				res.statusCode.must.equal(303)

				var subscription = subscriptionsDb.read(sql`
					SELECT * FROM initiative_subscriptions
				`)

				subscription.must.eql(new ValidSubscription({
					email: "user@example.com",
					created_ip: "127.0.0.1",
					confirmed_at: new Date,
					new_interest: true,
					signable_interest: true,
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
				usersDb.update(this.user, {
					email: "USer@EXAMple.com",
					email_confirmed_at: new Date
				})

				var res = yield this.request("/subscriptions", {
					method: "POST",
					form: {email: "usER@examPLE.com"}
				})

				res.statusCode.must.equal(303)

				var subscription = subscriptionsDb.read(sql`
					SELECT * FROM initiative_subscriptions
				`)

				subscription.must.eql(new ValidSubscription({
					email: "usER@examPLE.com",
					created_ip: "127.0.0.1",
					new_interest: true,
					signable_interest: true,
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
				usersDb.update(this.user, {
					unconfirmed_email: "user@example.com",
					email_confirmation_token: Crypto.randomBytes(12)
				})

				var res = yield this.request("/subscriptions", {
					method: "POST",
					form: {email: "user@example.com"}
				})

				res.statusCode.must.equal(303)

				var subscription = subscriptionsDb.read(sql`
					SELECT * FROM initiative_subscriptions
				`)

				subscription.must.eql(new ValidSubscription({
					email: "user@example.com",
					created_ip: "127.0.0.1",
					confirmation_sent_at: new Date,
					new_interest: true,
					signable_interest: true,
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
				var subscription = subscriptionsDb.create(new ValidSubscription({
					confirmed_at: pseudoDateTime(),
					new_interest: true,
					signable_interest: false,
					event_interest: false,
					comment_interest: true
				}))

				usersDb.update(this.user, {
					email: subscription.email,
					email_confirmed_at: new Date
				})

				var res = yield this.request("/subscriptions", {
					method: "POST",
					form: {
						email: subscription.email,
						new_interest: false,
						signable_interest: true,
						event_interest: true,
						comment_interest: true
					}
				})

				res.statusCode.must.equal(303)

				subscriptionsDb.read(sql`
					SELECT * FROM initiative_subscriptions
				`).must.eql({
					__proto__: subscription,
					confirmed_at: new Date,
					updated_at: new Date,
					new_interest: false,
					signable_interest: true,
					event_interest: true,
					comment_interest: true
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

			var subscription = subscriptionsDb.create(new ValidSubscription({
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

			subscriptionsDb.search(sql`
				SELECT * FROM initiative_subscriptions
			`).must.eql([subscription])

			this.emails.length.must.equal(0)
		})

		it("must not resend confirmation email if less than an hour has passed",
			function*() {
			var subscription = subscriptionsDb.create(new ValidSubscription({
				confirmation_sent_at: new Date
			}))

			this.time.tick(3599 * 1000)
			var res = yield this.request("/subscriptions", {
				method: "POST",
				form: {email: subscription.email}
			})

			res.statusCode.must.equal(303)

			subscriptionsDb.search(sql`
				SELECT * FROM initiative_subscriptions
			`).must.eql([subscription])

			this.emails.length.must.equal(0)
		})

		it("must resend confirmation email if an hour has passed", function*() {
			var subscription = subscriptionsDb.create(new ValidSubscription({
				confirmation_sent_at: new Date
			}))

			this.time.tick(3600 * 1000)
			var res = yield this.request("/subscriptions", {
				method: "POST",
				form: {email: subscription.email}
			})

			res.statusCode.must.equal(303)

			subscriptionsDb.search(sql`
				SELECT * FROM initiative_subscriptions
			`).must.eql([{
				__proto__: subscription,
				confirmation_sent_at: new Date
			}])

			this.emails.length.must.equal(1)
		})

		it("must send reminder email if confirmed and an hour has passed",
			function*() {
			var subscription = subscriptionsDb.create(new ValidSubscription({
				confirmed_at: new Date,
				confirmation_sent_at: new Date
			}))

			this.time.tick(3600 * 1000)
			var res = yield this.request("/subscriptions", {
				method: "POST",
				form: {email: subscription.email}
			})

			res.statusCode.must.equal(303)

			subscriptionsDb.read(subscription).must.eql({
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
			var subscription = subscriptionsDb.create(new ValidSubscription({
				confirmed_at: new Date,
				new_interest: true,
				event_interest: true,
				comment_interest: false
			}))

			var path = `/subscriptions?update-token=${subscription.update_token}`
			var res = yield this.request(path, {
				method: "PUT",
				form: {
					"null[new_interest]": !subscription.new_interest,
					"null[event_interest]": !subscription.event_interest,
					"null[comment_interest]": !subscription.comment_interest
				}
			})

			res.statusCode.must.equal(303)
			res.headers.location.must.equal(path)

			subscriptionsDb.read(subscription).must.eql({
				__proto__: subscription,
				updated_at: new Date,
				new_interest: !subscription.new_interest,
				event_interest: !subscription.event_interest,
				comment_interest: !subscription.comment_interest
			})
		})

		it("must update subscription to initiative", function*() {
			var initiative = initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				published_at: new Date
			}))

			var subscription = subscriptionsDb.create(new ValidSubscription({
				initiative_uuid: initiative.uuid,
				confirmed_at: new Date,
				event_interest: true,
				comment_interest: false
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

			subscriptionsDb.read(subscription).must.eql({
				__proto__: subscription,
				updated_at: new Date,
				event_interest: !subscription.event_interest,
				comment_interest: !subscription.comment_interest
			})
		})

		it("must not update global interests of subscription to initiative",
			function*() {
			var initiative = initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				published_at: new Date
			}))

			var subscription = subscriptionsDb.create(new ValidSubscription({
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
					[uuid + "[new_interest]"]: true,
					[uuid + "[signable_interest]"]: true
				}
			})

			res.statusCode.must.equal(303)

			subscriptionsDb.read(subscription).must.eql({
				__proto__: subscription,
				updated_at: new Date
			})
		})

		it("must update subscription to external initiative", function*() {
			var initiative = initiativesDb.create(new ValidInitiative({
				phase: "parliament",
				external: true
			}))

			var subscription = subscriptionsDb.create(new ValidSubscription({
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

			subscriptionsDb.read(subscription).must.eql({
				__proto__: subscription,
				updated_at: new Date,
				event_interest: !subscription.event_interest,
				comment_interest: !subscription.comment_interest
			})
		})

		it("must not update unconfirmed subscription to initiative", function*() {
			var subscription = subscriptionsDb.create(new ValidSubscription({
				confirmed_at: new Date
			}))

			var initiative = initiativesDb.create(new ValidInitiative({
				user_id: this.author.id
			}))

			var other = subscriptionsDb.create(new ValidSubscription({
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

			subscriptionsDb.search(sql`
				SELECT * FROM initiative_subscriptions
			`).must.eql([subscription, other])
		})

		it("must not update subscription to initiative by other emails",
			function*() {
			var subscription = subscriptionsDb.create(new ValidSubscription({
				confirmed_at: new Date
			}))

			var initiative = initiativesDb.create(new ValidInitiative({
				user_id: this.author.id
			}))

			var other = subscriptionsDb.create(new ValidSubscription({
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

			subscriptionsDb.search(sql`
				SELECT * FROM initiative_subscriptions
			`).must.eql([subscription, other])
		})

		it("must not update email", function*() {
			var subscription = subscriptionsDb.create(new ValidSubscription({
				confirmed_at: new Date
			}))

			var path = `/subscriptions?update-token=${subscription.update_token}`
			var res = yield this.request(path, {
				method: "PUT",
				form: {"null[email]": "root@example.com"}
			})

			res.statusCode.must.equal(303)

			subscriptionsDb.read(subscription).must.eql({
				__proto__: subscription,
				updated_at: new Date
			})
		})

		it("must delete subscription to initiatives", function*() {
			var subscription = subscriptionsDb.create(new ValidSubscription({
				confirmed_at: new Date
			}))

			var path = `/subscriptions?update-token=${subscription.update_token}`
			var res = yield this.request(path, {
				method: "PUT",
				form: {"null[delete]": true}
			})

			res.statusCode.must.equal(303)
			res.headers.location.must.equal("/")

			subscriptionsDb.search(sql`
				SELECT * FROM initiative_subscriptions
			`).must.be.empty()
		})

		it("must delete subscription to initiative", function*() {
			var initiative = initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				published_at: new Date
			}))

			var subscription = subscriptionsDb.create(new ValidSubscription({
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

			subscriptionsDb.search(sql`
				SELECT * FROM initiative_subscriptions
			`).must.be.empty()
		})

		it("must delete subscription to external initiative", function*() {
			var initiative = initiativesDb.create(new ValidInitiative({
				phase: "parliament",
				external: true
			}))

			var subscription = subscriptionsDb.create(new ValidSubscription({
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

			subscriptionsDb.search(sql`
				SELECT * FROM initiative_subscriptions
			`).must.be.empty()
		})

		it("must not delete unconfirmed subscription to initiatives", function*() {
			var initiative = initiativesDb.create(new ValidInitiative({
				phase: "parliament",
				external: true
			}))

			var subscription = subscriptionsDb.create(new ValidSubscription({
				initiative_uuid: initiative.uuid,
				confirmed_at: new Date
			}))

			var other = subscriptionsDb.create(new ValidSubscription({
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

			subscriptionsDb.search(sql`
				SELECT * FROM initiative_subscriptions
			`).must.eql([subscription, other])
		})

		it("must redirect back if deleting another subscription", function*() {
			var subscription = subscriptionsDb.create(new ValidSubscription({
				confirmed_at: new Date
			}))

			var initiative = initiativesDb.create(new ValidInitiative({
				user_id: this.author.id
			}))

			var other = subscriptionsDb.create(new ValidSubscription({
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

			subscriptionsDb.search(sql`
				SELECT * FROM initiative_subscriptions
			`).must.eql([subscription])
		})

		it("must redirect to subscription to initiatives if deleting given",
			function*() {
			var initiative = initiativesDb.create(new ValidInitiative({
				user_id: this.author.id
			}))

			var subscription = subscriptionsDb.create(new ValidSubscription({
				initiative_uuid: initiative.uuid,
				confirmed_at: new Date
			}))

			var other = subscriptionsDb.create(new ValidSubscription({
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

			subscriptionsDb.search(sql`
				SELECT * FROM initiative_subscriptions
			`).must.eql([other])
		})

		it("must redirect to subscription to initiative if deleting given",
			function*() {
			var subscription = subscriptionsDb.create(new ValidSubscription({
				confirmed_at: new Date
			}))

			var initiative = initiativesDb.create(new ValidInitiative({
				user_id: this.author.id
			}))

			var other = subscriptionsDb.create(new ValidSubscription({
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

			subscriptionsDb.search(sql`
				SELECT * FROM initiative_subscriptions
			`).must.eql([other])
		})

		it("must not delete other subscriptions of the same email", function*() {
			var initiative = initiativesDb.create(new ValidInitiative({
				user_id: this.author.id
			}))

			var subscription = subscriptionsDb.create(new ValidSubscription({
				initiative_uuid: initiative.uuid,
				confirmed_at: new Date
			}))

			var otherInitiative = initiativesDb.create(new ValidInitiative({
				user_id: this.author.id
			}))

			var others = subscriptionsDb.create([
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

			subscriptionsDb.search(sql`
				SELECT * FROM initiative_subscriptions
			`).must.eql(others)
		})

		it("must not delete other subscriptions on the same initiative",
			function*() {
			var initiative = initiativesDb.create(new ValidInitiative({
				user_id: this.author.id
			}))

			var others = subscriptionsDb.create([
				new ValidSubscription({confirmed_at: new Date}),

				new ValidSubscription({
					initiative_uuid: initiative.uuid,
					confirmed_at: new Date
				})
			])

			var subscription = subscriptionsDb.create(new ValidSubscription({
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

			subscriptionsDb.search(sql`
				SELECT * FROM initiative_subscriptions
			`).must.eql(others)
		})
	})

	describe("DELETE /", function() {
		require("root/test/fixtures").csrf()

		mustRequireToken(function(url) {
			return this.request(url, {method: "DELETE"})
		})

		it("must delete subscriptions for a given email address", function*() {
			var subscription = subscriptionsDb.create(new ValidSubscription({
				confirmed_at: new Date
			}))

			var initiatives = _.times(3, () => initiativesDb.create(
				new ValidInitiative({phase: "parliament", external: true})
			))

			subscriptionsDb.create(initiatives.map((i) => (
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

			subscriptionsDb.search(sql`
				SELECT * FROM initiative_subscriptions
			`).must.be.empty()
		})

		it("must not delete unconfirmed subscriptions", function*() {
			var initiatives = _.times(2, () => initiativesDb.create(
				new ValidInitiative({phase: "parliament", external: true})
			))

			var unconfirmed = subscriptionsDb.create(new ValidSubscription({
				email: "user@example.com",
				initiative_uuid: initiatives[0].uuid
			}))

			var subscription = subscriptionsDb.create(new ValidSubscription({
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

			subscriptionsDb.search(sql`
				SELECT * FROM initiative_subscriptions
			`).must.eql([unconfirmed])
		})

		it("must not delete subscriptions by other emails", function*() {
			var initiative = initiativesDb.create(new ValidInitiative({
				phase: "parliament",
				external: true
			}))

			var subscriptions = subscriptionsDb.create([
				new ValidSubscription({
					confirmed_at: new Date
				}),

				new ValidSubscription({
					initiative_uuid: initiative.uuid,
					confirmed_at: new Date
				})
			])

			var subscription = subscriptionsDb.create(new ValidSubscription({
				confirmed_at: new Date,
			}))

			var res = yield this.request(
				`/subscriptions?update-token=${subscription.update_token}`,
				{method: "DELETE"}
			)

			res.statusCode.must.equal(303)
			res.headers.location.must.equal("/")

			subscriptionsDb.search(sql`
				SELECT * FROM initiative_subscriptions
			`).must.eql(subscriptions)
		})
	})

	describe("GET /new", function() {
		require("root/test/fixtures").csrf()
		require("root/test/email")()
		require("root/test/time")(Date.UTC(2015, 5, 18))

		it("must confirm given a confirmation token", function*() {
			var createdAt = new Date(2015, 5, 18, 13, 37, 42, 666)
			var token = pseudoHex(8)

			var subscription = subscriptionsDb.create(new ValidSubscription({
				created_at: createdAt,
				updated_at: createdAt,
				update_token: token,
				confirmation_sent_at: createdAt
			}))

			var path = `/subscriptions`
			var res = yield this.request(`${path}/new?confirmation_token=${token}`)
			res.statusCode.must.equal(303)
			res.headers.location.must.equal(`${path}/${token}`)

			subscriptionsDb.read(subscription).must.eql({
				__proto__: subscription,
				confirmed_at: new Date,
				updated_at: new Date
			})
		})

		it("must not confirm twice", function*() {
			var createdAt = new Date(2015, 5, 18, 13, 37, 42, 666)
			var token = pseudoHex(8)

			var subscription = subscriptionsDb.create(new ValidSubscription({
				created_at: createdAt,
				updated_at: createdAt,
				confirmed_at: createdAt,
				update_token: token
			}))

			var path = `/subscriptions`
			var res = yield this.request(`${path}/new?confirmation_token=${token}`)
			res.statusCode.must.equal(303)
			res.headers.location.must.equal(`${path}/${token}`)
			subscriptionsDb.read(subscription).must.eql(subscription)
		})

		it("must not confirm given the wrong token", function*() {
			var createdAt = new Date(2015, 5, 18, 13, 37, 42, 666)
			var token = pseudoHex(8)

			var subscription = subscriptionsDb.create(new ValidSubscription({
				created_at: createdAt,
				updated_at: createdAt,
				update_token: token,
				confirmation_sent_at: createdAt
			}))

			var res = yield this.request(
				"/subscriptions/new?confirmation_token=deadbeef"
			)

			res.statusCode.must.equal(404)
			subscriptionsDb.read(subscription).must.eql(subscription)
		})
	})

	describe("GET /:token", function() {
		require("root/test/fixtures").csrf()

		it("must redirect to subscriptions page", function*() {
			var subscription = subscriptionsDb.create(new ValidSubscription({
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
			var subscription = subscriptionsDb.create(new ValidSubscription({
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
			subscriptionsDb.create(new ValidSubscription({confirmed_at: new Date}))
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
			subscriptionsDb.create(new ValidSubscription({confirmed_at: new Date}))
			var res = yield request.call(this, "/subscriptions?update-token=beef")
			res.statusCode.must.equal(404)
			res.body.must.include(t("SUBSCRIPTION_NOT_FOUND_TITLE"))
		})

		it("must respond with 404 given an update token for an unconfirmed subscription", function*() {
			var subscription = subscriptionsDb.create(new ValidSubscription)
			var path = `/subscriptions?update-token=${subscription.update_token}`
			var res = yield request.call(this, path)
			res.statusCode.must.equal(404)
			res.body.must.include(t("SUBSCRIPTION_NOT_FOUND_TITLE"))
		})

		it("must respond with 404 given an update token of a subscription to initiative", function*() {
			var initiative = initiativesDb.create(new ValidInitiative({
				phase: "parliament",
				external: true
			}))

			var subscription = subscriptionsDb.create(new ValidSubscription({
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
			var initiative = initiativesDb.create(new ValidInitiative({
				phase: "parliament",
				external: true
			}))

			var subscription = subscriptionsDb.create(new ValidSubscription({
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
			var initiative = initiativesDb.create(new ValidInitiative({
				phase: "parliament",
				external: true
			}))

			var subscription = subscriptionsDb.create(new ValidSubscription({
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
			var initiative = initiativesDb.create(new ValidInitiative({
				phase: "parliament",
				external: true
			}))

			subscriptionsDb.create(new ValidSubscription({
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
