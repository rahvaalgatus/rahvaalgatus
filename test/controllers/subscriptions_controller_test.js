var _ = require("root/lib/underscore")
var ValidSubscription = require("root/test/valid_subscription")
var ValidInitiative = require("root/test/valid_db_initiative")
var Config = require("root/config")
var pseudoHex = require("root/lib/crypto").pseudoHex
var newPartner = require("root/test/citizenos_fixtures").newPartner
var newUser = require("root/test/citizenos_fixtures").newUser
var newTopic = require("root/test/citizenos_fixtures").newTopic
var createPartner = require("root/test/citizenos_fixtures").createPartner
var createUser = require("root/test/citizenos_fixtures").createUser
var createTopic = require("root/test/citizenos_fixtures").createTopic
var sql = require("sqlate")
var db = require("root/db/initiative_subscriptions_db")
var initiativesDb = require("root/db/initiatives_db")
var parseDom = require("root/lib/dom").parse
var t = require("root/lib/i18n").t.bind(null, "et")

describe("SubscriptionsController", function() {
	require("root/test/web")()
	require("root/test/mitm")()
	require("root/test/db")()
	beforeEach(require("root/test/mitm").router)

	beforeEach(function*() {
		this.partner = yield createPartner(newPartner({id: Config.apiPartnerId}))
	})

	describe("GET /", function() {
		mustRequireToken(function(url) { return this.request(url) })

		it("must show page given subscription to initiatives", function*() {
			var subscription = yield db.create(new ValidSubscription({
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
			var initiative = yield initiativesDb.create(new ValidInitiative)

			var subscription = yield db.create(new ValidSubscription({
				initiative_uuid: initiative.uuid,
				confirmed_at: new Date
			}))

			yield db.create(new ValidSubscription({email: subscription.email}))

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
				external: true
			}))

			var topic = yield createTopic(newTopic({
				id: initiative.uuid,
				title: "Better life for everyone.",
				creatorId: (yield createUser(newUser())).id,
				sourcePartnerId: this.partner.id,
				visibility: "public"
			}))

			var subscription = yield db.create(new ValidSubscription({
				initiative_uuid: initiative.uuid,
				confirmed_at: new Date
			}))

			var res = yield this.request(
				`/subscriptions?initiative=${initiative.uuid}&update-token=${subscription.update_token}`
			)

			res.statusCode.must.equal(200)
			res.body.must.include(t("SUBSCRIPTIONS_UPDATE_TITLE"))
			res.body.must.include(topic.title)
		})

		it("must show page given subscription to external initiative", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				title: "Better life for everyone.",
				external: true
			}))

			var subscription = yield db.create(new ValidSubscription({
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
			var subscription = yield db.create(new ValidSubscription({
				confirmed_at: new Date
			}))

			var initiative = yield initiativesDb.create(new ValidInitiative({
				external: true
			}))

			var other = yield db.create(new ValidSubscription({
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
			var initiatives = yield _.times(3, (i) => initiativesDb.create(
				new ValidInitiative({title: `Better life for ${i}s.`, external: true})
			))

			var subscriptions = yield initiatives.map((initiative) => db.create(
				new ValidSubscription({
					email: "user@example.com",
					initiative_uuid: initiative.uuid,
					confirmed_at: new Date
				})
			))

			var res = yield this.request(
				`/subscriptions?initiative=${initiatives[0].uuid}&update-token=${subscriptions[0].update_token}`
			)

			res.statusCode.must.equal(200)

			initiatives.forEach((initiative) => (
				res.body.must.include(initiative.title)
			))
		})

		it("must not show subscriptions for other email addresses", function*() {
			var other = yield initiativesDb.create(new ValidInitiative({
				title: "Better life for everyone.",
				external: true
			}))

			yield db.create(new ValidSubscription({
				initiative_uuid: other.uuid,
				confirmed_at: new Date
			}))

			var subscription = yield db.create(new ValidSubscription({
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
			res.body.must.include(t("INVALID_EMAIL"))
		})

		it("must respond with 422 given invalid email", function*() {
			var res = yield this.request("/subscriptions", {
				method: "POST",
				form: {_csrf_token: this.csrfToken, email: "fubar"}
			})

			res.statusCode.must.equal(422)
			res.body.must.include(t("INVALID_EMAIL"))
		})
	})

	describe("PUT /", function() {
		require("root/test/fixtures").csrf()
		require("root/test/time")()

		mustRequireToken(function(url) {
			return this.request(url, {
				method: "POST",
				form: {_method: "put", _csrf_token: this.csrfToken}
			})
		})

		it("must update subscriptions to initiatives", function*() {
			var subscription = yield db.create(new ValidSubscription({
				confirmed_at: new Date
			}))

			var path = `/subscriptions?update-token=${subscription.update_token}`
			var res = yield this.request(path, {
				method: "POST",
				form: {
					_method: "put",
					_csrf_token: this.csrfToken,
					"null[official_interest]": !subscription.official_interest,
					"null[author_interest]": !subscription.author_interest,
					"null[comment_interest]": !subscription.comment_interest
				}
			})

			res.statusCode.must.equal(303)
			res.headers.location.must.equal(path)

			yield db.read(subscription).must.then.eql({
				__proto__: subscription,
				updated_at: new Date,
				official_interest: !subscription.official_interest,
				author_interest: !subscription.author_interest,
				comment_interest: !subscription.comment_interest
			})
		})

		it("must delete subscription to initiatives", function*() {
			var subscription = yield db.create(new ValidSubscription({
				confirmed_at: new Date
			}))

			var path = `/subscriptions?update-token=${subscription.update_token}`
			var res = yield this.request(path, {
				method: "POST",
				form: {
					_method: "put",
					_csrf_token: this.csrfToken,
					"null[delete]": true
				}
			})

			res.statusCode.must.equal(303)
			res.headers.location.must.equal("/")

			yield db.search(sql`
				SELECT * FROM initiative_subscriptions
			`).must.then.be.empty()
		})

		it("must update subscription to initiative", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				external: true
			}))

			yield createTopic(newTopic({
				id: initiative.uuid,
				creatorId: (yield createUser(newUser())).id,
				sourcePartnerId: this.partner.id,
				visibility: "public"
			}))

			var subscription = yield db.create(new ValidSubscription({
				initiative_uuid: initiative.uuid,
				confirmed_at: new Date
			}))

			var uuid = initiative.uuid
			var path = `/subscriptions`
			path += `?initiative=${subscription.initiative_uuid}`
			path += `&update-token=${subscription.update_token}`
			var res = yield this.request(path, {
				method: "POST",
					form: {
						_method: "put",
						_csrf_token: this.csrfToken,
						[uuid + "[official_interest]"]: !subscription.official_interest,
						[uuid + "[author_interest]"]: !subscription.author_interest,
						[uuid + "[comment_interest]"]: !subscription.comment_interest
					}
			})

			res.statusCode.must.equal(303)
			res.headers.location.must.equal(path)

			yield db.read(subscription).must.then.eql({
				__proto__: subscription,
				updated_at: new Date,
				official_interest: !subscription.official_interest,
				author_interest: !subscription.author_interest,
				comment_interest: !subscription.comment_interest
			})
		})

		it("must update subscription to external initiative", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				external: true
			}))

			var subscription = yield db.create(new ValidSubscription({
				initiative_uuid: initiative.uuid,
				confirmed_at: new Date
			}))

			var uuid = initiative.uuid
			var path = `/subscriptions?initiative=${uuid}&update-token=${subscription.update_token}`
			var res = yield this.request(path, {
				method: "POST",
					form: {
						_method: "put",
						_csrf_token: this.csrfToken,
						[uuid + "[official_interest]"]: !subscription.official_interest,
						[uuid + "[author_interest]"]: !subscription.author_interest,
						[uuid + "[comment_interest]"]: !subscription.comment_interest
					}
			})

			res.statusCode.must.equal(303)
			res.headers.location.must.equal(path)

			yield db.read(subscription).must.then.eql({
				__proto__: subscription,
				updated_at: new Date,
				official_interest: !subscription.official_interest,
				author_interest: !subscription.author_interest,
				comment_interest: !subscription.comment_interest
			})
		})

		it("must not update unconfirmed subscription to initiative", function*() {
			var subscription = yield db.create(new ValidSubscription({
				confirmed_at: new Date
			}))

			var initiative = yield initiativesDb.create(new ValidInitiative)

			var other = yield db.create(new ValidSubscription({
				email: subscription.email,
				initiative_uuid: initiative.uuid
			}))

			var uuid = initiative.uuid
			var path = `/subscriptions?update-token=${subscription.update_token}`
			var res = yield this.request(path, {
				method: "POST",
					form: {
						_method: "put",
						_csrf_token: this.csrfToken,
						[uuid + "[official_interest]"]: !subscription.official_interest,
					}
			})

			res.statusCode.must.equal(303)
			res.headers.location.must.equal(path)

			yield db.search(sql`
				SELECT * FROM initiative_subscriptions
			`).must.then.eql([subscription, other])
		})

		it("must not update subscription to initiative by other emails",
			function*() {
			var subscription = yield db.create(new ValidSubscription({
				confirmed_at: new Date
			}))

			var initiative = yield initiativesDb.create(new ValidInitiative)

			var other = yield db.create(new ValidSubscription({
				initiative_uuid: initiative.uuid,
				confirmed_at: new Date
			}))

			var uuid = initiative.uuid
			var path = `/subscriptions?update-token=${subscription.update_token}`
			var res = yield this.request(path, {
				method: "POST",
					form: {
						_method: "put",
						_csrf_token: this.csrfToken,
						[uuid + "[official_interest]"]: !subscription.official_interest,
					}
			})

			res.statusCode.must.equal(303)
			res.headers.location.must.equal(path)

			yield db.search(sql`
				SELECT * FROM initiative_subscriptions
			`).must.then.eql([subscription, other])
		})

		it("must not update email", function*() {
			var subscription = yield db.create(new ValidSubscription({
				confirmed_at: new Date
			}))

			var path = `/subscriptions?update-token=${subscription.update_token}`
			var res = yield this.request(path, {
				method: "POST",
					form: {
						_method: "put",
						_csrf_token: this.csrfToken,
						"null[email]": "root@example.com"
					}
			})

			res.statusCode.must.equal(303)

			yield db.read(subscription).must.then.eql({
				__proto__: subscription,
				updated_at: new Date
			})
		})

		it("must delete subscription to initiatives", function*() {
			var subscription = yield db.create(new ValidSubscription({
				confirmed_at: new Date
			}))

			var path = `/subscriptions?update-token=${subscription.update_token}`
			var res = yield this.request(path, {
				method: "POST",
				form: {
					_method: "put",
					"null[delete]": true,
					_csrf_token: this.csrfToken
				}
			})

			res.statusCode.must.equal(303)
			res.headers.location.must.equal("/")

			yield db.search(sql`
				SELECT * FROM initiative_subscriptions
			`).must.then.be.empty()
		})

		it("must delete subscription to external initiative", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				external: true
			}))

			var subscription = yield db.create(new ValidSubscription({
				initiative_uuid: initiative.uuid,
				confirmed_at: new Date
			}))

			var path = `/subscriptions`
			path += `?initiative=${subscription.initiative_uuid}`
			path += `&update-token=${subscription.update_token}`
			var res = yield this.request(path, {
				method: "POST",
				form: {
					_method: "put",
					[subscription.initiative_uuid + "[delete]"]: true,
					_csrf_token: this.csrfToken
				}
			})

			res.statusCode.must.equal(303)
			res.headers.location.must.equal("/")

			yield db.search(sql`
				SELECT * FROM initiative_subscriptions
			`).must.then.be.empty()
		})

		it("must not delete unconfirmed subscription to initiatives", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative)

			var subscription = yield db.create(new ValidSubscription({
				initiative_uuid: initiative.uuid,
				confirmed_at: new Date
			}))

			var other = yield db.create(new ValidSubscription({
				email: subscription.email
			}))

			var path = `/subscriptions`
			path += `?initiative=${subscription.initiative_uuid}`
			path += `&update-token=${subscription.update_token}`
			var res = yield this.request(path, {
				method: "POST",
				form: {
					_method: "put",
					"null[delete]": true,
					_csrf_token: this.csrfToken
				}
			})

			res.statusCode.must.equal(303)
			res.headers.location.must.equal(path)

			yield db.search(sql`
				SELECT * FROM initiative_subscriptions
			`).must.then.eql([subscription, other])
		})

		it("must redirect back if deleting another subscription", function*() {
			var subscription = yield db.create(new ValidSubscription({
				confirmed_at: new Date
			}))

			var initiative = yield initiativesDb.create(new ValidInitiative)

			var other = yield db.create(new ValidSubscription({
				email: subscription.email,
				initiative_uuid: initiative.uuid,
				confirmed_at: new Date
			}))

			var path = `/subscriptions?update-token=${subscription.update_token}`
			var res = yield this.request(path, {
				method: "POST",
				form: {
					_method: "put",
					[other.initiative_uuid + "[delete]"]: true,
					_csrf_token: this.csrfToken
				}
			})

			res.statusCode.must.equal(303)
			res.headers.location.must.equal(path)

			yield db.search(sql`
				SELECT * FROM initiative_subscriptions
			`).must.then.eql([subscription])
		})

		it("must redirect to subscription to initiatives if deleting given",
			function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative)

			var subscription = yield db.create(new ValidSubscription({
				initiative_uuid: initiative.uuid,
				confirmed_at: new Date
			}))

			var other = yield db.create(new ValidSubscription({
				email: subscription.email,
				confirmed_at: new Date
			}))

			var path = `/subscriptions`
			path += `?initiative=${subscription.initiative_uuid}`
			path += `&update-token=${subscription.update_token}`
			var res = yield this.request(path, {
				method: "POST",
				form: {
					_method: "put",
					[subscription.initiative_uuid + "[delete]"]: true,
					_csrf_token: this.csrfToken
				}
			})

			res.statusCode.must.equal(303)
			path = `/subscriptions?update-token=${other.update_token}`
			res.headers.location.must.equal(path)

			yield db.search(sql`
				SELECT * FROM initiative_subscriptions
			`).must.then.eql([other])
		})

		it("must redirect to subscription to initiative if deleting given",
			function*() {
			var subscription = yield db.create(new ValidSubscription({
				confirmed_at: new Date
			}))

			var initiative = yield initiativesDb.create(new ValidInitiative)

			var other = yield db.create(new ValidSubscription({
				email: subscription.email,
				initiative_uuid: initiative.uuid,
				confirmed_at: new Date
			}))

				var path = `/subscriptions?update-token=${subscription.update_token}`
			var res = yield this.request(path, {
				method: "POST",
				form: {
					_method: "put",
					"null[delete]": true,
					_csrf_token: this.csrfToken
				}
			})

			res.statusCode.must.equal(303)
			path = `/subscriptions`
			path += `?initiative=${other.initiative_uuid}`
			path += `&update-token=${other.update_token}`
			res.headers.location.must.equal(path)

			yield db.search(sql`
				SELECT * FROM initiative_subscriptions
			`).must.then.eql([other])
		})

		it("must not delete other subscriptions of the same email", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative)

			var subscription = yield db.create(new ValidSubscription({
				initiative_uuid: initiative.uuid,
				confirmed_at: new Date
			}))

			var otherInitiative = yield initiativesDb.create(new ValidInitiative)

			var others = yield db.create([
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
				method: "POST",
				form: {
					_method: "put",
					[subscription.initiative_uuid + "[delete]"]: true,
					_csrf_token: this.csrfToken
				}
			})

			res.statusCode.must.equal(303)
			path = `/subscriptions?update-token=${others[0].update_token}`
			res.headers.location.must.equal(path)

			yield db.search(sql`
				SELECT * FROM initiative_subscriptions
			`).must.then.eql(others)
		})

		it("must not delete other subscriptions on the same initiative",
			function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative)

			var others = yield db.create([
				new ValidSubscription({confirmed_at: new Date}),

				new ValidSubscription({
					initiative_uuid: initiative.uuid,
					confirmed_at: new Date
				})
			])

			var subscription = yield db.create(new ValidSubscription({
				initiative_uuid: initiative.uuid,
				confirmed_at: new Date
			}))

			var path = `/subscriptions`
			path += `?initiative=${subscription.initiative_uuid}`
			path += `&update-token=${subscription.update_token}`
			var res = yield this.request(path, {
				method: "POST",
				form: {
					_method: "put",
					[subscription.initiative_uuid + "[delete]"]: true,
					_csrf_token: this.csrfToken
				}
			})

			res.statusCode.must.equal(303)
			res.headers.location.must.equal("/")

			yield db.search(sql`
				SELECT * FROM initiative_subscriptions
			`).must.then.eql(others)
		})
	})

	describe("DELETE /", function() {
		require("root/test/fixtures").csrf()

		mustRequireToken(function(url) {
			return this.request(url, {
				method: "POST",
				form: {_method: "delete", _csrf_token: this.csrfToken}
			})
		})

		it("must delete all subscriptions for a given email address", function*() {
			var subscription = yield db.create(new ValidSubscription({
				confirmed_at: new Date
			}))

			var initiatives = yield _.times(3, (i) => initiativesDb.create(
				new ValidInitiative({title: `Better life for ${i}s.`, external: true})
			))

			yield initiatives.map((initiative) => db.create(new ValidSubscription({
				email: subscription.email,
				initiative_uuid: initiative.uuid,
				confirmed_at: new Date
			})))

			var path = `/subscriptions?update-token=${subscription.update_token}`
			var res = yield this.request(path, {
				method: "POST",
				form: {_method: "delete", _csrf_token: this.csrfToken}
			})

			res.statusCode.must.equal(303)
			res.headers.location.must.equal("/")

			yield db.search(sql`
				SELECT * FROM initiative_subscriptions
			`).must.then.be.empty()
		})

		it("must not delete unconfirmed subscriptions", function*() {
			var initiatives = yield _.times(2, (i) => initiativesDb.create(
				new ValidInitiative({title: `Better life for ${i}s.`, external: true})
			))

			var unconfirmed = yield db.create(new ValidSubscription({
				email: "user@example.com",
				initiative_uuid: initiatives[0].uuid
			}))

			var subscription = yield db.create(new ValidSubscription({
				email: "user@example.com",
				initiative_uuid: initiatives[1].uuid,
				confirmed_at: new Date
			}))

			var path = "/subscriptions"
			path += `?initiative=${subscription.initiative_uuid}`
			path += `&update-token=${subscription.update_token}`
			var res = yield this.request(path, {
				method: "POST",
				form: {_method: "delete", _csrf_token: this.csrfToken}
			})

			res.statusCode.must.equal(303)
			res.headers.location.must.equal("/")

			yield db.search(sql`
				SELECT * FROM initiative_subscriptions
			`).must.then.eql([unconfirmed])
		})

		it("must not delete subscriptions by other emails", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				external: true
			}))
			
			var subscriptions = yield db.create([
				new ValidSubscription({
					confirmed_at: new Date
				}),

				new ValidSubscription({
					initiative_uuid: initiative.uuid,
					confirmed_at: new Date
				})
			])

			var subscription = yield db.create(new ValidSubscription({
				confirmed_at: new Date,
			}))

			var res = yield this.request(
				`/subscriptions?update-token=${subscription.update_token}`, {
					method: "POST",
					form: {_method: "delete", _csrf_token: this.csrfToken}
				}
			)

			res.statusCode.must.equal(303)
			res.headers.location.must.equal("/")

			yield db.search(sql`
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

			var subscription = yield db.create(new ValidSubscription({
				created_at: createdAt,
				updated_at: createdAt,
				update_token: token,
				confirmation_sent_at: createdAt
			}))

			var path = `/subscriptions`
			var res = yield this.request(`${path}/new?confirmation_token=${token}`)
			res.statusCode.must.equal(303)
			res.headers.location.must.equal(`${path}/${token}`)

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

			var path = `/subscriptions`
			var res = yield this.request(`${path}/new?confirmation_token=${token}`)
			res.statusCode.must.equal(303)
			res.headers.location.must.equal(`${path}/${token}`)
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

		it("must redirect to subscriptions page", function*() {
			var subscription = yield db.create(new ValidSubscription({
				confirmed_at: new Date
			}))

			var res = yield this.request(
				`/subscriptions/${subscription.update_token}`
			)

			res.statusCode.must.equal(302)
			var path = "/subscriptions?update-token=" + subscription.update_token
			res.headers.location.must.equal(path)
		})

		it("must respond with 404 given invalid update token", function*() {
			// Still have a single subscription to ensure it's not picking randomly.
			yield db.create(new ValidSubscription({confirmed_at: new Date}))
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
			yield db.create(new ValidSubscription({confirmed_at: new Date}))
			var res = yield request.call(this, "/subscriptions?update-token=beef")
			res.statusCode.must.equal(404)
			res.body.must.include(t("SUBSCRIPTION_NOT_FOUND_TITLE"))
		})

		it("must respond with 404 given an update token for an unconfirmed subscription", function*() {
			var subscription = yield db.create(new ValidSubscription)
			var path = `/subscriptions?update-token=${subscription.update_token}`
			var res = yield request.call(this, path)
			res.statusCode.must.equal(404)
			res.body.must.include(t("SUBSCRIPTION_NOT_FOUND_TITLE"))
		})

		it("must respond with 404 given an update token of a subscription to initiative", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative)

			var subscription = yield db.create(new ValidSubscription({
				initiative_uuid: initiative.uuid,
				confirmed_at: new Date
			}))

			var res = yield request.call(this,
				`/subscriptions?update-token=${subscription.update_token}`
			)

			res.statusCode.must.equal(404)
			res.body.must.include(t("SUBSCRIPTION_NOT_FOUND_TITLE"))
		})

		it("must respond with 404 given an update token of an unconfirmed subscription to initiative", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative)

			var subscription = yield db.create(new ValidSubscription({
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
			var initiative = yield initiativesDb.create(new ValidInitiative)

			var subscription = yield db.create(new ValidSubscription({
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
			var initiative = yield initiativesDb.create(new ValidInitiative)

			yield db.create(new ValidSubscription({
				initiative_uuid: initiative.uuid,
				confirmed_at: new Date
			}))

			var res = yield request.call(this,
				`/subscriptions?update-token=beef&initiative=${initiative.uuid}`
			)

			res.statusCode.must.equal(404)
			res.body.must.include(t("SUBSCRIPTION_NOT_FOUND_TITLE"))
		})
	})
}
