var ValidUser = require("root/test/valid_user")
var ValidInitiative = require("root/test/valid_initiative")
var ValidEvent = require("root/test/valid_initiative_event")
var initiativesDb = require("root/db/initiatives_db")
var usersDb = require("root/db/users_db")
var eventsDb = require("root/db/initiative_events_db")

describe("InitiativeEventsDb", function() {
	beforeEach(function() {
		this.initiative = initiativesDb.create(new ValidInitiative({
			user_id: usersDb.create(new ValidUser).id
		}))
	})

	describe(".prototype.create", function() {
		;[
			"parliament-received",
			"parliament-finished",
		].forEach(function(type) {
			it(`must not serialize content for ${type}`, function() {
				var event = eventsDb.create(new ValidEvent({
					initiative_uuid: this.initiative.uuid,
					type: type,
					content: "foo"
				}))

				event.must.have.property("content", null)
			})
		})

		it("must serialize text content as text", function() {
			var event = eventsDb.create(new ValidEvent({
				initiative_uuid: this.initiative.uuid,
				type: "text",
				content: "All good."
			}))

			event.content.must.equal("All good.")
		})

		;[
			"parliament-accepted",
			"parliament-letter",
			"parliament-decision",
			"parliament-committee-meeting"
		].forEach(function(type) {
			it(`must serialize ${type} content as JSON`, function() {
				var event = eventsDb.create(new ValidEvent({
					initiative_uuid: this.initiative.uuid,
					type: type,
					content: {name: "John"}
				}))

				event.content.must.eql({name: "John"})
			})
		})
	})
})
