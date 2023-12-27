var Config = require("root").config
var Initiative = require("root/lib/initiative")
var ValidUser = require("root/test/valid_user")
var ValidInitiative = require("root/test/valid_initiative")
var ValidEvent = require("root/test/valid_initiative_event")
var ValidSubscription = require("root/test/valid_subscription")
var sql = require("sqlate")
var usersDb = require("root/db/users_db")
var initiativesDb = require("root/db/initiatives_db")
var eventsDb = require("root/db/initiative_events_db")
var renderEmail = require("root/lib/i18n").email.bind(null, "et")
var subscriptionsDb = require("root/db/initiative_subscriptions_db")
var t = require("root/lib/i18n").t.bind(null, "et")

describe("AdminInitiativesController", function() {
	require("root/test/adm")()
	require("root/test/db")()
	require("root/test/time")()
	require("root/test/email")()
	require("root/test/fixtures").csrf()

	describe("POST /initiatives/:id/events", function() {
		require("root/test/fixtures").admin()

		beforeEach(function() {
			this.author = usersDb.create(new ValidUser)

			this.initiative = initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				phase: "parliament"
			}))
		})

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

			var events = eventsDb.search(sql`SELECT * FROM initiative_events`)
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
			var subscriptions = subscriptionsDb.create([
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

			var path = `/initiatives/${this.initiative.uuid}/events`
			var res = yield this.request(path, {
				method: "POST",

				form: {
					action: "create-and-notify",
					occurredOn: "2020-01-02",
					occurredAt: "13:37",
					title: "Initiative was handled",
					content: "All good."
				}
			})

			res.statusCode.must.equal(302)

			this.emails.length.must.equal(1)
			var email = this.emails[0]
			var to = subscriptions.slice(2).map((s) => s.email).sort()
			this.emails[0].envelope.to.must.eql(to)

			email.headers.subject.must.equal(
				t("EMAIL_INITIATIVE_TEXT_EVENT_MESSAGE_TITLE", {
					title: "Initiative was handled",
					initiativeTitle: this.initiative.title
				})
			)

			email.body.must.equal(
				renderEmail("EMAIL_INITIATIVE_TEXT_EVENT_MESSAGE_BODY", {
					initiativeTitle: this.initiative.title,
					initiativeUrl: Initiative.slugUrl(this.initiative),
					title: "Initiative was handled",
					text: "> All good.",
					unsubscribeUrl: `${Config.url}%recipient.unsubscribeUrl%`
				})
			)

			var vars = email.headers["x-mailgun-recipient-variables"]
			subscriptions.slice(2).forEach((s) => vars.must.include(s.update_token))
		})
	})
})
