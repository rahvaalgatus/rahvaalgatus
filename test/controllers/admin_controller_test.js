var _ = require("root/lib/underscore")
var Config = require("root/config")
var ValidSubscription = require("root/test/valid_subscription")
var ValidEvent = require("root/test/valid_db_initiative_event")
var sql = require("sqlate")
var newUuid = require("uuid/v4")
var pseudoHex = require("root/lib/crypto").pseudoHex
var pseudoInt = require("root/lib/crypto").pseudoInt
var initiativesDb = require("root/db/initiatives_db")
var renderEmail = require("root/lib/i18n").email.bind(null, "et")
var messagesDb = require("root/db/initiative_messages_db")
var eventsDb = require("root/db/initiative_events_db")
var subscriptionsDb = require("root/db/initiative_subscriptions_db")
var cosDb = require("root").cosDb
var t = require("root/lib/i18n").t.bind(null, "et")

describe("AdminController", function() {
	require("root/test/adm")()
	require("root/test/mitm")()
	require("root/test/db")()
	require("root/test/time")()
	require("root/test/email")()
	require("root/test/fixtures").csrf()
	beforeEach(require("root/test/mitm").router)

	describe("POST /initiatives/:id/events", function() {
		require("root/test/fixtures").user({id: Config.adminUserIds[0]})

		beforeEach(function*() {
			this.topic = yield createTopic({creatorId: this.user.id})
			this.initiative = yield initiativesDb.create({uuid: this.topic.id})
		})
		
		describe("with action=create", function() {
			it("must create event", function*() {
				var res = yield this.request(`/initiatives/${this.topic.id}/events`, {
					method: "POST",

					form: {
						_csrf_token: this.csrfToken,
						action: "create",
						occurredOn: "2020-01-02",
						occurredAt: "13:37",
						title: "Initiative was handled",
						content: "All good."
					}
				})

				res.statusCode.must.equal(302)
				res.headers.location.must.equal(`/initiatives/${this.topic.id}`)

				var events = yield eventsDb.search(sql`SELECT * FROM initiative_events`)
				events.length.must.equal(1)

				events[0].must.eql(new ValidEvent({
					id: events[0].id,
					initiative_uuid: this.topic.id,
					created_at: new Date,
					updated_at: new Date,
					occurred_at: new Date(2020, 0, 2, 13, 37),
					created_by: this.user.id,
					origin: "admin",
					title: "Initiative was handled",
					content: "All good."
				}))
			})

			it("must email subscribers interested in official events", function*() {
				var subscriptions = yield subscriptionsDb.create([
					new ValidSubscription({
						initiative_uuid: this.topic.id,
						confirmed_at: new Date,
						official_interest: false
					}),

					new ValidSubscription({
						initiative_uuid: null,
						confirmed_at: new Date,
						official_interest: false
					}),

					new ValidSubscription({
						initiative_uuid: this.topic.id,
						confirmed_at: new Date
					}),

					new ValidSubscription({
						initiative_uuid: null,
						confirmed_at: new Date
					})
				])

				var res = yield this.request(`/initiatives/${this.topic.id}/events`, {
					method: "POST",

					form: {
						_csrf_token: this.csrfToken,
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
					initiative_uuid: this.topic.id,
					created_at: new Date,
					updated_at: new Date,
					origin: "event",

					title: t("DEFAULT_INITIATIVE_EVENT_MESSAGE_TITLE", {
						title: "Initiative was handled",
						initiativeTitle: this.topic.title
					}),

					text: renderEmail("DEFAULT_INITIATIVE_EVENT_MESSAGE_BODY", {
						initiativeTitle: this.topic.title,
						initiativeUrl: `${Config.url}/initiatives/${this.topic.id}`,
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

	describe("POST /initiatives/:id/messages", function() {
		require("root/test/fixtures").user({id: Config.adminUserIds[0]})

		beforeEach(function*() {
			this.topic = yield createTopic({creatorId: this.user.id})
			this.initiative = yield initiativesDb.create({uuid: this.topic.id})
		})

		describe("with action=send", function() {
			it("must email subscribers", function*() {
				var subscriptions = yield subscriptionsDb.create([
					new ValidSubscription({
						initiative_uuid: this.topic.id,
						confirmed_at: new Date
					}),

					new ValidSubscription({
						initiative_uuid: null,
						confirmed_at: new Date
					})
				])

				var res = yield this.request(`/initiatives/${this.topic.id}/messages`, {
					method: "POST",

					form: {
						_csrf_token: this.csrfToken,
						action: "send",
						title: "Initiative was updated",
						text: "Go check it out"
					}
				})

				res.statusCode.must.equal(302)
				res.headers.location.must.equal(`/initiatives/${this.topic.id}`)

				var messages = yield messagesDb.search(sql`
					SELECT * FROM initiative_messages
				`)

				var emails = subscriptions.map((s) => s.email).sort()

				messages.must.eql([{
					id: messages[0].id,
					initiative_uuid: this.topic.id,
					created_at: new Date,
					updated_at: new Date,
					origin: "message",
					title: "Initiative was updated",
					text: "Go check it out",
					sent_at: new Date,
					sent_to: emails
				}])

				this.emails.length.must.equal(1)
				this.emails[0].envelope.to.must.eql(emails)
				var msg = String(this.emails[0].message)
				msg.match(/^Subject: .*/m)[0].must.include("Initiative was updated")
				subscriptions.forEach((s) => msg.must.include(s.update_token))
			})

			it("must not email the same subscriber twice", function*() {
				var generic = yield subscriptionsDb.create({
					email: "user@example.com",
					confirmed_at: new Date
				})

				var specific = yield subscriptionsDb.create({
					initiative_uuid: this.topic.id,
					email: "user@example.com",
					confirmed_at: new Date
				})

				var res = yield this.request(`/initiatives/${this.topic.id}/messages`, {
					method: "POST",

					form: {
						_csrf_token: this.csrfToken,
						action: "send",
						title: "Initiative was updated",
						text: "Go check it out"
					}
				})

				res.statusCode.must.equal(302)
				res.headers.location.must.equal(`/initiatives/${this.topic.id}`)

				var messages = yield messagesDb.search(sql`
					SELECT * FROM initiative_messages
				`)

				messages.must.eql([{
					id: messages[0].id,
					initiative_uuid: this.topic.id,
					created_at: new Date,
					updated_at: new Date,
					origin: "message",
					title: "Initiative was updated",
					text: "Go check it out",
					sent_at: new Date,
					sent_to: [specific.email]
				}])

				this.emails.length.must.equal(1)
				this.emails[0].envelope.to.must.eql([specific.email])
				var body = String(this.emails[0].message)
				body.match(/^Subject: .*/m)[0].must.include("Initiative was updated")
				body.must.include(specific.update_token)
				body.must.not.include(generic.update_token)
			})

			it("must not email subscribers of other initiatives", function*() {
				yield subscriptionsDb.create({
					initiative_uuid: "20a431ac-d7fa-4469-af6f-0b914a76c9c7",
					email: "user@example.com",
					confirmed_at: new Date
				})

				var res = yield this.request(`/initiatives/${this.topic.id}/messages`, {
					method: "POST",

					form: {
						_csrf_token: this.csrfToken,
						action: "send",
						title: "Initiative was updated",
						text: "Go check it out"
					}
				})

				res.statusCode.must.equal(302)
				res.headers.location.must.equal(`/initiatives/${this.topic.id}`)

				var messages = yield messagesDb.search(sql`
					SELECT * FROM initiative_messages
				`)

				messages.length.must.equal(1)
				messages[0].sent_at.must.eql(new Date)
				messages[0].sent_to.must.eql([])
				this.emails.length.must.equal(0)
			})
		})
	})
})

function createTopic(attrs) {
	return cosDb("Topics").insert(_.assign({
		id: newUuid(),
		title: "Initiative #" + pseudoInt(100),
		status: "inProgress",
		visibility: "public",
		createdAt: new Date,
		updatedAt: new Date,
		tokenJoin: pseudoHex(4),
		padUrl: "/etherpad"
	}, attrs)).returning("*").then(_.first)
}
