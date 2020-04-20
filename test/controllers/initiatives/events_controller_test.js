var _ = require("root/lib/underscore")
var Config = require("root/config")
var DateFns = require("date-fns")
var ValidInitiative = require("root/test/valid_db_initiative")
var ValidSubscription = require("root/test/valid_subscription")
var ValidEvent = require("root/test/valid_db_initiative_event")
var newPartner = require("root/test/citizenos_fixtures").newPartner
var newTopic = require("root/test/citizenos_fixtures").newTopic
var newVote = require("root/test/citizenos_fixtures").newVote
var createPartner = require("root/test/citizenos_fixtures").createPartner
var createUser = require("root/test/fixtures").createUser
var createTopic = require("root/test/citizenos_fixtures").createTopic
var createVote = require("root/test/citizenos_fixtures").createVote
var initiativesDb = require("root/db/initiatives_db")
var subscriptionsDb = require("root/db/initiative_subscriptions_db")
var eventsDb = require("root/db/initiative_events_db")
var messagesDb = require("root/db/initiative_messages_db")
var t = require("root/lib/i18n").t.bind(null, "et")
var renderEmail = require("root/lib/i18n").email.bind(null, "et")
var sql = require("sqlate")
var EVENT_RATE = 3
var EVENTABLE_PHASES = ["sign", "parliament", "government", "done"]

describe("InitiativeEventsController", function() {
	require("root/test/web")()
	require("root/test/mitm")()
	require("root/test/db")()
	require("root/test/email")()
	require("root/test/time")(Date.UTC(2015, 5, 18))
	require("root/test/fixtures").csrf()
	beforeEach(require("root/test/mitm").router)

	beforeEach(function*() {
		this.partner = yield createPartner(newPartner({id: Config.apiPartnerId}))
	})

	describe("GET /new", function() {
		describe("when not logged in", function() {
			it("must respond with 401", function*() {
				var author = yield createUser()

				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: author.id,
					published_at: new Date
				}))

				yield createTopic(newTopic({
					id: initiative.uuid,
					creatorId: author.uuid,
					sourcePartnerId: this.partner.id,
					visibility: "public"
				}))

				var path = `/initiatives/${initiative.uuid}/events/new`
				var res = yield this.request(path)
				res.statusCode.must.equal(401)
			})
		})

		describe("when logged in", function() {
			require("root/test/fixtures").user()

			mustRateLimit(function() {
				return this.request(`/initiatives/${this.initiative.uuid}/events/new`)
			})

			it("must respond with 403 if in edit phase", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: this.user.id
				}))

				yield createTopic(newTopic({
					id: initiative.uuid,
					creatorId: this.user.uuid,
					sourcePartnerId: this.partner.id,
					visibility: "public"
				}))

				var path = `/initiatives/${initiative.uuid}/events/new`
				var res = yield this.request(path)
				res.statusCode.must.equal(403)
				res.statusMessage.must.match(/cannot create events/i)
			})

			EVENTABLE_PHASES.forEach(function(phase) {
				it(`must render if in ${phase} phase`, function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative({
						user_id: this.user.id,
						phase: phase
					}))

					var topic = yield createTopic(newTopic({
						id: initiative.uuid,
						creatorId: this.user.uuid,
						sourcePartnerId: this.partner.id,
						status: "voting"
					}))

					yield createVote(topic, newVote())

					var path = `/initiatives/${initiative.uuid}/events/new`
					var res = yield this.request(path)
					res.statusCode.must.equal(200)
				})
			})

			it("must respond with 403 if lacking permissions", function*() {
				var author = yield createUser()

				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: author.id,
					published_at: new Date
				}))

				yield createTopic(newTopic({
					id: initiative.uuid,
					creatorId: author.uuid,
					sourcePartnerId: this.partner.id,
					visibility: "public"
				}))

				var path = `/initiatives/${initiative.uuid}/events/new`
				var res = yield this.request(path)
				res.statusCode.must.equal(403)
				res.statusMessage.must.equal("No Permission to Edit")
			})
		})
	})

	describe("GET /:id", function() {
		it("must redirect to initiative page given event id", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				external: true
			}))
			
			var event = yield eventsDb.create(new ValidEvent({
				initiative_uuid: initiative.uuid,
				title: "We sent it.",
				content: "To somewhere."
			}))

			var path = `/initiatives/${initiative.uuid}/events/${event.id}`
			var res = yield this.request(path)
			res.statusCode.must.equal(302)
			path = `/initiatives/${initiative.uuid}#event-${event.id}`
			res.headers.location.must.equal(path)
		})

		it("must redirect to initiative page given virtual event id",
			function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				external: true
			}))

			var path = `/initiatives/${initiative.uuid}/events/finished-in-government`
			var res = yield this.request(path)
			res.statusCode.must.equal(302)
			path = `/initiatives/${initiative.uuid}#event-finished-in-government`
			res.headers.location.must.equal(path)
		})
	})

	describe("POST /", function() {
		describe("when logged in", function() {
			require("root/test/fixtures").user()

			mustRateLimit(function() {
				return this.request(`/initiatives/${this.initiative.uuid}/events`, {
					method: "POST",
					form: {
						_csrf_token: this.csrfToken,
						title: "Something happened",
						content: "You shouldn't miss it."
					}
				})
			})

			it("must respond with 403 if in edit phase", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: this.user.id
				}))

				yield createTopic(newTopic({
					id: initiative.uuid,
					creatorId: this.user.uuid,
					sourcePartnerId: this.partner.id,
					visibility: "public"
				}))

				var res = yield this.request(`/initiatives/${initiative.uuid}/events`, {
					method: "POST",
					form: {_csrf_token: this.csrfToken}
				})

				res.statusCode.must.equal(403)
				res.statusMessage.must.match(/cannot create events/i)
			})

			EVENTABLE_PHASES.forEach(function(phase) {
				it(`must create event if in ${phase} phase`, function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative({
						user_id: this.user.id,
						phase: phase
					}))

					var topic = yield createTopic(newTopic({
						id: initiative.uuid,
						creatorId: this.user.uuid,
						sourcePartnerId: this.partner.id,
						status: "voting"
					}))

					yield createVote(topic, newVote())

					var path = `/initiatives/${initiative.uuid}/events`
					var res = yield this.request(path, {
						method: "POST",
						form: {
							_csrf_token: this.csrfToken,
							title: "Something happened",
							content: "You shouldn't miss it."
						}
					})

					res.statusCode.must.equal(302)
					res.headers.location.must.equal(`/initiatives/${initiative.uuid}`)

					var events = yield eventsDb.search(sql`
						SELECT * FROM initiative_events
					`)

					events.must.eql([new ValidEvent({
						id: events[0].id,
						initiative_uuid: initiative.uuid,
						user_id: this.user.id,
						origin: "author",
						title: "Something happened",
						content: "You shouldn't miss it."
					})])
				})
			})

			it("must email subscribers interested in author events", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: this.user.id,
					phase: "sign"
				}))

				var topic = yield createTopic(newTopic({
					id: initiative.uuid,
					creatorId: this.user.uuid,
					sourcePartnerId: this.partner.id,
					status: "voting"
				}))

				yield createVote(topic, newVote())

				var subscriptions = yield subscriptionsDb.create([
					new ValidSubscription({
						initiative_uuid: initiative.uuid,
						confirmed_at: new Date,
						author_interest: false
					}),

					new ValidSubscription({
						initiative_uuid: null,
						confirmed_at: new Date,
						author_interest: false
					}),

					new ValidSubscription({
						initiative_uuid: initiative.uuid,
						confirmed_at: new Date
					}),

					new ValidSubscription({
						initiative_uuid: null,
						confirmed_at: new Date
					})
				])

				var res = yield this.request(`/initiatives/${initiative.uuid}/events`, {
					method: "POST",
					form: {
						_csrf_token: this.csrfToken,
						title: "Something happened",
						content: "You shouldn't miss it."
					}
				})

				res.statusCode.must.equal(302)

				var messages = yield messagesDb.search(sql`
					SELECT * FROM initiative_messages
				`)

				var emails = subscriptions.slice(2).map((s) => s.email).sort()

				messages.must.eql([{
					id: messages[0].id,
					initiative_uuid: initiative.uuid,
					created_at: new Date,
					updated_at: new Date,
					origin: "event",

					title: t("EMAIL_INITIATIVE_AUTHOR_EVENT_TITLE", {
						title: "Something happened",
						initiativeTitle: topic.title
					}),

					text: renderEmail("EMAIL_INITIATIVE_AUTHOR_EVENT_BODY", {
						initiativeTitle: topic.title,
						initiativeUrl: `${Config.url}/initiatives/${initiative.uuid}`,
						title: "Something happened",
						text: "> You shouldn't miss it.",
						unsubscribeUrl: "{{unsubscribeUrl}}"
					}),

					sent_at: new Date,
					sent_to: emails
				}])

				this.emails.length.must.equal(1)
				this.emails[0].envelope.to.must.eql(emails)
				var msg = String(this.emails[0].message)
				msg.match(/^Subject: .*/m)[0].must.include(topic.title)
				subscriptions.slice(2).forEach((s) => msg.must.include(s.update_token))
			})

			it("must respond with 403 if not an admin", function*() {
				var author = yield createUser()

				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: author.id,
					published_at: new Date
				}))

				yield createTopic(newTopic({
					id: initiative.uuid,
					creatorId: author.uuid,
					sourcePartnerId: this.partner.id,
					visibility: "public"
				}))

				var res = yield this.request(`/initiatives/${initiative.uuid}/events`, {
					method: "POST",
					form: {_csrf_token: this.csrfToken}
				})

				res.statusCode.must.equal(403)
				res.statusMessage.must.equal("No Permission to Edit")
			})
		})
	})
})

function mustRateLimit(request) {
	describe("as a rate limited endpoint", function() {
		beforeEach(function*() {
			this.initiative = yield initiativesDb.create(new ValidInitiative({
				user_id: this.user.id,
				phase: "sign"
			}))

			this.topic = yield createTopic(newTopic({
				id: this.initiative.uuid,
				creatorId: this.user.uuid,
				sourcePartnerId: this.partner.id,
				status: "voting"
			}))

			yield createVote(this.topic, newVote())
		})

		it(`must respond with 429 if created ${EVENT_RATE} events in the last 15m`,
			function*() {
			yield eventsDb.create(_.times(EVENT_RATE, (_i) => new ValidEvent({
				initiative_uuid: this.initiative.uuid,
				created_at: DateFns.addSeconds(DateFns.addMinutes(new Date, -15), 1),
				user_id: this.user.id
			})))

			var res = yield request.call(this)
			res.statusCode.must.equal(429)
		})

		it(`must not respond with 429 if created <${EVENT_RATE} events in the last 15m`, function*() {
			yield eventsDb.create(_.times(EVENT_RATE - 1, (_i) => new ValidEvent({
				initiative_uuid: this.initiative.uuid,
				created_at: DateFns.addSeconds(DateFns.addMinutes(new Date, -15), 1),
				user_id: this.user.id
			})))

			var res = yield request.call(this)
			res.statusCode.must.be.between(200, 399)
		})

		it(`must not respond with 429 if created ${EVENT_RATE} events earlier than 15m`, function*() {
			yield eventsDb.create(_.times(EVENT_RATE, (_i) => new ValidEvent({
				initiative_uuid: this.initiative.uuid,
				created_at: DateFns.addMinutes(new Date, -15),
				user_id: this.user.id
			})))

			var res = yield request.call(this)
			res.statusCode.must.be.between(200, 399)
		})
	})
}
