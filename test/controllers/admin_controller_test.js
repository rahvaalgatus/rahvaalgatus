var _ = require("root/lib/underscore")
var Config = require("root/config")
var respond = require("root/test/fixtures").respond
var concat = Array.prototype.concat.bind(Array.prototype)
var sql = require("sqlate")
var initiativeSubscriptionsDb = require("root/db/initiative_subscriptions_db")
var initiativeMessagesDb = require("root/db/initiative_messages_db")
var UUID = "5f9a82a5-e815-440b-abe9-d17311b0b366"

var INITIATIVE = {
	id: UUID,
	createdAt: new Date(2000, 0, 1),
	status: "voting",
	title: "My thoughts",
	description: "<body><h1>My thoughts</h1></body>",
	creator: {name: "John"},
	visibility: "public",
	permission: {level: "read"},

	vote: {
		id: "396b0e5b-cca7-4255-9238-19b464e60b65",
		endsAt: new Date(3000, 0, 1),
		options: {rows: [{value: "Yes", voteCount: 0}]}
	}
}

describe("AdminController", function() {
	require("root/test/adm")()
	require("root/test/mitm")()
	require("root/test/db")()
	require("root/test/time")()
	require("root/test/email")()
	beforeEach(require("root/test/mitm").router)

	describe("POST /initiatives/:id/messages", function() {
		require("root/test/fixtures").user({id: Config.adminUserIds[0]})

		beforeEach(function() {
			this.router.get(`/api/topics/${UUID}`,
				respond.bind(null, {data: INITIATIVE}))
		})

		describe("with action=send", function() {
			it("must create message and send email", function*() {
				var subscription = yield initiativeSubscriptionsDb.create({
					initiative_uuid: UUID,
					email: "user@example.com",
					confirmed_at: new Date,
					confirmation_token: "deadbeef"
				})

				var res = yield this.request(`/initiatives/${UUID}/messages`, {
					method: "POST",

					form: {
						_csrf_token: this.csrfToken,
						action: "send",
						title: "Initiative was updated",
						text: "Go check it out"
					}
				})

				res.statusCode.must.equal(302)
				res.headers.location.must.equal(`/initiatives/${UUID}`)

				var messages = yield initiativeMessagesDb.search(sql`
					SELECT * FROM initiative_messages
				`)

				messages.must.eql([{
					id: messages[0].id,
					initiative_uuid: UUID,
					created_at: new Date,
					updated_at: new Date,
					title: "Initiative was updated",
					text: "Go check it out",
					sent_at: new Date,
					sent_to: [subscription.email]
				}])

				this.emails.length.must.equal(1)
				this.emails[0].envelope.to.must.eql([subscription.email])
				var body = String(this.emails[0].message)
				body.match(/^Subject: .*/m)[0].must.include("Initiative was updated")
				body.must.include(subscription.update_token)
			})

			it("must batch by 1000 recipients", function*() {
				var attrs = _.times(1337, (i) => ({
					initiative_uuid: UUID,
					email: `${i}@example.com`,
					confirmed_at: new Date,
					confirmation_token: String(i)
				}))

				var subscriptions = yield initiativeSubscriptionsDb.create(attrs) 
				var emails = subscriptions.map((sub) => sub.email).sort()

				var res = yield this.request(`/initiatives/${UUID}/messages`, {
					method: "POST",

					form: {
						_csrf_token: this.csrfToken,
						action: "send",
						title: "Initiative was updated",
						text: "Go check it out"
					}
				})

				res.statusCode.must.equal(302)
				res.headers.location.must.equal(`/initiatives/${UUID}`)

				var messages = yield initiativeMessagesDb.search(sql`
					SELECT * FROM initiative_messages
				`)

				messages.length.must.equal(1)
				messages[0].sent_at.must.eql(new Date)
				messages[0].sent_to.sort().must.eql(emails)

				this.emails.length.must.equal(2)
				var to = concat(this.emails[0].envelope.to, this.emails[1].envelope.to)
				to.sort().must.eql(emails)
			})

			it("must not email subscribers of other initiatives", function*() {
				yield initiativeSubscriptionsDb.create({
					initiative_uuid: "20a431ac-d7fa-4469-af6f-0b914a76c9c7",
					email: "user@example.com",
					confirmed_at: new Date,
					confirmation_token: "deadbeef"
				})

				var res = yield this.request(`/initiatives/${UUID}/messages`, {
					method: "POST",

					form: {
						_csrf_token: this.csrfToken,
						action: "send",
						title: "Initiative was updated",
						text: "Go check it out"
					}
				})

				res.statusCode.must.equal(302)
				res.headers.location.must.equal(`/initiatives/${UUID}`)

				var messages = yield initiativeMessagesDb.search(sql`
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
