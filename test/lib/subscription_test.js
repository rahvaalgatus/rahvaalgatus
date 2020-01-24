var _ = require("root/lib/underscore")
var Subscription = require("root/lib/subscription")
var ValidUser = require("root/test/valid_user")
var ValidInitiative = require("root/test/valid_db_initiative")
var ValidSubscription = require("root/test/valid_subscription")
var concat = Array.prototype.concat.bind(Array.prototype)
var sql = require("sqlate")
var usersDb = require("root/db/users_db")
var initiativesDb = require("root/db/initiatives_db")
var messagesDb = require("root/db/initiative_messages_db")

describe("Subscription", function() {
	require("root/test/db")()
	require("root/test/time")()
	require("root/test/email")()

	beforeEach(function*() { this.user = yield usersDb.create(new ValidUser) })

	describe(".send", function() {
		it("must batch by 1000 recipients", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				user_id: this.user.id
			}))

			var message = yield messagesDb.create({
				initiative_uuid: initiative.uuid,
				origin: "message",
				title: "Initiative was updated",
				text: "That's good.",
				created_at: new Date,
				updated_at: new Date,
			})

			var subscriptions = _.times(1337, (i) => new ValidSubscription({
				initiative_uuid: initiative.uuid,
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
