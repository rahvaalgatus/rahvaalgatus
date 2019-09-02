var ValidInitiative = require("root/test/valid_db_initiative")
var ValidEvent = require("root/test/valid_db_initiative_event")
var initiativeDb = require("root/db/initiatives_db")
var db = require("root/db/initiative_events_db")

describe("InitiativeEventsDb", function() {
	beforeEach(function*() {
		this.initiative = yield initiativeDb.create(new ValidInitiative)
	})

	describe(".prototype.create", function() {
		;[
			"parliament-received",
			"parliament-finished",
		].forEach(function(type) {
			it(`must not serialize content for ${type}`, function*() {
				var event = yield db.create(new ValidEvent({
					initiative_uuid: this.initiative.uuid,
					type: type,
					content: "foo"
				}))

				event.must.have.property("content", null)
			})
		})

		it("must serialize text content as text", function*() {
			var event = yield db.create(new ValidEvent({
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
			it(`must serialize ${type} content as JSON`, function*() {
				var event = yield db.create(new ValidEvent({
					initiative_uuid: this.initiative.uuid,
					type: type,
					content: {name: "John"}
				}))

				event.content.must.eql({name: "John"})
			})
		})
	})
})
