var _ = require("root/lib/underscore")
var Subscription = require("root/lib/subscription")
var ValidSubscription = require("root/test/valid_subscription")
var concat = Array.prototype.concat.bind(Array.prototype)
var sql = require("sqlate")
var messagesDb = require("root/db/initiative_messages_db")
var UUID = "50943870-0bee-44ea-a65f-4e5024381ee6"

describe("Subscription", function() {
	require("root/test/db")()
	require("root/test/time")()
	require("root/test/email")()

	describe(".send", function() {
		it("must batch by 1000 recipients", function*() {
			var message = yield messagesDb.create({
				initiative_uuid: UUID,
				origin: "message",
				title: "Initiative was updated",
				text: "That's good.",
				created_at: new Date,
				updated_at: new Date,
			})

			var subscriptions = _.times(1337, (i) => new ValidSubscription({
				initiative_uuid: message.initiative_uuid,
				email: `${i}@example.com`,
				confirmed_at: new Date,
				confirmation_token: String(i)
			}))

			yield Subscription.send(message, subscriptions)

			var messages = yield messagesDb.search(sql`
				SELECT * FROM initiative_messages
			`)

			messages.length.must.equal(1)
			messages[0].sent_at.must.eql(new Date)
			var emails = subscriptions.map((sub) => sub.email).sort()
			messages[0].sent_to.sort().must.eql(emails)

			this.emails.length.must.equal(2)
			var to = concat(this.emails[0].envelope.to, this.emails[1].envelope.to)
			to.sort().must.eql(emails)
		})
	})
})
