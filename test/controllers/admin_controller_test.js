var _ = require("root/lib/underscore")
var Config = require("root/config")
var ValidUser = require("root/test/valid_user")
var ValidInitiative = require("root/test/valid_db_initiative")
var ValidComment = require("root/test/valid_comment")
var ValidEvent = require("root/test/valid_db_initiative_event")
var ValidSubscription = require("root/test/valid_subscription")
var sql = require("sqlate")
var usersDb = require("root/db/users_db")
var initiativesDb = require("root/db/initiatives_db")
var commentsDb = require("root/db/comments_db")
var eventsDb = require("root/db/initiative_events_db")
var renderEmail = require("root/lib/i18n").email.bind(null, "et")
var messagesDb = require("root/db/initiative_messages_db")
var subscriptionsDb = require("root/db/initiative_subscriptions_db")
var t = require("root/lib/i18n").t.bind(null, "et")

describe("AdminController", function() {
	require("root/test/adm")()
	require("root/test/mitm")()
	require("root/test/db")()
	require("root/test/time")()
	require("root/test/email")()
	require("root/test/fixtures").csrf()
	beforeEach(require("root/test/mitm").router)

	describe("/", function() {
		describe("when not logged in", function() {
			it("must respond with 401", function*() {
				var res = yield this.request(`/`)
				res.statusCode.must.equal(401)
				res.statusMessage.must.equal("Not an Admin")
			})
		})
	})

	describe("PUT /users/:id", function() {
		require("root/test/fixtures").user({
			country: Config.adminPersonalIds[0].slice(0, 2),
			personal_id: Config.adminPersonalIds[0].slice(2)
		})

		describe("when merging", function() {
			it("must merge initiatives, comments and more", function*() {
				var source = yield usersDb.create(new ValidUser({
					country: null,
					personal_id: null,
					email: "john@example.com",
					email_confirmed_at: new Date
				}))

				var target = yield usersDb.create(new ValidUser({
					country: "EE",
					personal_id: "38706181337"
				}))

				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: source.id
				}))

				var comment = yield commentsDb.create(new ValidComment({
					initiative_uuid: initiative.uuid,
					user_id: source.id,
					user_uuid: _.serializeUuid(source.id)
				}))

				var event = yield eventsDb.create(new ValidEvent({
					initiative_uuid: initiative.uuid,
					user_id: source.id,
					created_by: _.serializeUuid(source.id)
				}))

				var res = yield this.request(`/users/${source.id}`, {
					method: "PUT",
					form: {mergedWithPersonalId: target.personal_id}
				})

				res.statusCode.must.equal(303)
				res.headers.location.must.equal(`/users/${source.id}`)

				yield usersDb.read(source).must.then.eql({
					__proto__: source,
					merged_with_id: target.id
				})

				yield usersDb.read(target).must.then.eql(target)

				yield initiativesDb.read(initiative).must.then.eql({
					__proto__: initiative,
					user_id: target.id
				})

				yield commentsDb.read(comment).must.then.eql({
					__proto__: comment,
					user_id: target.id,
					user_uuid: _.serializeUuid(target.uuid)
				})

				yield eventsDb.read(event).must.then.eql({
					__proto__: event,
					user_id: target.id,
					created_by: _.serializeUuid(target.uuid)
				})
			})

			it("must not touch unrelated rows", function*() {
				var other = yield usersDb.create(new ValidUser)

				var source = yield usersDb.create(new ValidUser({
					country: null,
					personal_id: null,
					email: "john@example.com",
					email_confirmed_at: new Date
				}))

				var target = yield usersDb.create(new ValidUser({
					country: "EE",
					personal_id: "38706181337"
				}))

				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: other.id
				}))

				var comment = yield commentsDb.create(new ValidComment({
					initiative_uuid: initiative.uuid,
					user_id: other.id,
					user_uuid: _.serializeUuid(other.id)
				}))

				var event = yield eventsDb.create(new ValidEvent({
					initiative_uuid: initiative.uuid,
					user_id: other.id,
					created_by: _.serializeUuid(other.id)
				}))

				var res = yield this.request(`/users/${source.id}`, {
					method: "PUT",
					form: {mergedWithPersonalId: target.personal_id}
				})

				res.statusCode.must.equal(303)

				yield initiativesDb.read(initiative).must.then.eql(initiative)
				yield commentsDb.read(comment).must.then.eql(comment)
				yield eventsDb.read(event).must.then.eql(event)
			})
		})
	})

	describe("POST /initiatives/:id/events", function() {
		require("root/test/fixtures").user({
			country: Config.adminPersonalIds[0].slice(0, 2),
			personal_id: Config.adminPersonalIds[0].slice(2)
		})

		beforeEach(function*() {
			this.author = yield usersDb.create(new ValidUser)

			this.initiative = yield initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				phase: "parliament"
			}))
		})

		describe("with action=create", function() {
			it("must create event", function*() {
				var res = yield this.request(`/initiatives/${this.initiative.uuid}/events`, {
					method: "POST",

					form: {
						action: "create",
						occurredOn: "2020-01-02",
						occurredAt: "13:37",
						title: "Initiative was handled",
						content: "All good."
					}
				})

				res.statusCode.must.equal(302)
				res.headers.location.must.equal(`/initiatives/${this.initiative.uuid}`)

				var events = yield eventsDb.search(sql`SELECT * FROM initiative_events`)
				events.length.must.equal(1)

				events[0].must.eql(new ValidEvent({
					id: events[0].id,
					initiative_uuid: this.initiative.uuid,
					created_at: new Date,
					updated_at: new Date,
					occurred_at: new Date(2020, 0, 2, 13, 37),
					user_id: this.user.id,
					origin: "admin",
					title: "Initiative was handled",
					content: "All good."
				}))
			})

			it("must email subscribers interested in events", function*() {
				var subscriptions = yield subscriptionsDb.create([
					new ValidSubscription({
						initiative_uuid: this.initiative.uuid,
						confirmed_at: new Date,
						event_interest: false
					}),

					new ValidSubscription({
						initiative_uuid: null,
						confirmed_at: new Date,
						event_interest: false
					}),

					new ValidSubscription({
						initiative_uuid: this.initiative.uuid,
						confirmed_at: new Date,
						event_interest: true
					}),

					new ValidSubscription({
						initiative_uuid: null,
						confirmed_at: new Date,
						event_interest: true
					})
				])

				var res = yield this.request(`/initiatives/${this.initiative.uuid}/events`, {
					method: "POST",

					form: {
						action: "create",
						occurredOn: "2020-01-02",
						occurredAt: "13:37",
						title: "Initiative was handled",
						content: "All good."
					}
				})

				res.statusCode.must.equal(302)

				var messages = yield messagesDb.search(sql`
					SELECT * FROM initiative_messages
				`)

				var emails = subscriptions.slice(2).map((s) => s.email).sort()

				messages.must.eql([{
					id: messages[0].id,
					initiative_uuid: this.initiative.uuid,
					created_at: new Date,
					updated_at: new Date,
					origin: "event",

					title: t("EMAIL_INITIATIVE_TEXT_EVENT_MESSAGE_TITLE", {
						title: "Initiative was handled",
						initiativeTitle: this.initiative.title
					}),

					text: renderEmail("EMAIL_INITIATIVE_TEXT_EVENT_MESSAGE_BODY", {
						initiativeTitle: this.initiative.title,
						initiativeUrl: `${Config.url}/initiatives/${this.initiative.uuid}`,
						title: "Initiative was handled",
						text: "> All good.",
						unsubscribeUrl: "{{unsubscribeUrl}}"
					}),

					sent_at: new Date,
					sent_to: emails
				}])

				this.emails.length.must.equal(1)
				this.emails[0].envelope.to.must.eql(emails)
				var msg = String(this.emails[0].message)
				msg.match(/^Subject: .*/m)[0].must.include("Initiative was handled")
				subscriptions.slice(2).forEach((s) => msg.must.include(s.update_token))
			})
		})
	})
})
