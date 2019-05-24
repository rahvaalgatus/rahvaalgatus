var _ = require("root/lib/underscore")
var Config = require("root/config")
var ValidSubscription = require("root/test/valid_db_initiative_subscription")
var sql = require("sqlate")
var newUuid = require("uuid/v4")
var pseudoHex = require("root/lib/crypto").pseudoHex
var pseudoInt = require("root/lib/crypto").pseudoInt
var messagesDb = require("root/db/initiative_messages_db")
var subscriptionsDb = require("root/db/initiative_subscriptions_db")
var cosDb = require("root").cosDb
var t = require("root/lib/i18n").t.bind(null, "et")

describe("AdminController", function() {
	require("root/test/adm")()
	require("root/test/mitm")()
	require("root/test/db")()
	require("root/test/time")()
	require("root/test/email")()
	beforeEach(require("root/test/mitm").router)

	beforeEach(function*() {
		this.user = yield cosDb("Users").insert({
			id: Config.adminUserIds[0],
			email: "user@example.com",
			emailIsVerified: true,
			emailVerificationCode: newUuid(),
			createdAt: new Date,
			updatedAt: new Date,
			source: "citizenos"
		}).returning("*").then(_.first)
	})

	describe("POST /initiatives/:id/events", function() {
		require("root/test/fixtures").user({id: Config.adminUserIds[0]})

		beforeEach(function*() {
			this.topic = yield createTopic({creatorId: this.user.id})
		})
		
		describe("with action=create", function() {
			it("must create event", function*() {
				var res = yield this.request(`/initiatives/${this.topic.id}/events`, {
					method: "POST",

					form: {
						_csrf_token: this.csrfToken,
						action: "create",
						createdOn: "2020-01-02",
						title: "Initiative was handled",
						text: "All good."
					}
				})

				res.statusCode.must.equal(302)
				res.headers.location.must.equal(`/initiatives/${this.topic.id}`)

				var events = yield cosDb.query(sql`SELECT * FROM "TopicEvents"`)
				events.length.must.equal(1)

				_.clone(events[0]).must.eql({
					id: events[0].id,
					topicId: this.topic.id,
					createdAt: new Date,
					updatedAt: new Date,
					deletedAt: null,
					subject: "2020-01-02 Initiative was handled",
					text: "All good."
				})
			})

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

				var res = yield this.request(`/initiatives/${this.topic.id}/events`, {
					method: "POST",

					form: {
						_csrf_token: this.csrfToken,
						action: "create",
						createdOn: "2020-01-02",
						title: "Initiative was handled",
						text: "All good."
					}
				})

				res.statusCode.must.equal(302)

				var messages = yield messagesDb.search(sql`
					SELECT * FROM initiative_messages
				`)

				var emails = subscriptions.map((s) => s.email).sort()

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

					text: t("DEFAULT_INITIATIVE_EVENT_MESSAGE_BODY", {
						initiativeTitle: this.topic.title,
						initiativeUrl: `${Config.url}/initiatives/${this.topic.id}`,
						title: "Initiative was handled",
						text: "All good.",
						siteUrl: Config.url,
						unsubscribeUrl: "{{unsubscribeUrl}}"
					}),

					sent_at: new Date,
					sent_to: emails
				}])

				this.emails.length.must.equal(1)
				this.emails[0].envelope.to.must.eql(emails)
				var msg = String(this.emails[0].message)
				msg.match(/^Subject: .*/m)[0].must.include("Initiative was handled")
				subscriptions.forEach((s) => msg.must.include(s.update_token))
			})
		})
	})

	describe("POST /initiatives/:id/messages", function() {
		require("root/test/fixtures").user({id: Config.adminUserIds[0]})

		beforeEach(function*() {
			this.topic = yield createTopic({creatorId: this.user.id})
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
					confirmed_at: new Date,
					confirmation_token: "deadbeef"
				})

				var specific = yield subscriptionsDb.create({
					initiative_uuid: this.topic.id,
					email: "user@example.com",
					confirmed_at: new Date,
					confirmation_token: "deadfeed"
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
					confirmed_at: new Date,
					confirmation_token: "deadbeef"
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
