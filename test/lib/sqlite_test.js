var _ = require("root/lib/underscore")
var ValidDbInitiativeSubscription =
	require("root/test/valid_db_initiative_subscription")
var sqlite = require("root").sqlite
var jsonify = _.compose(JSON.parse, JSON.stringify)

describe("Sqlite", function() {
	require("root/test/db")()
	
	describe(".prototype.create", function() {
		describe("given an array", function() {
			// This was a bug noticed on Apr 10 caused by use of last_insert_row that
			// in interleaved cases didn't run immediately after.
			it("must create and return an array of models", function*() {
				var a = jsonify(new ValidDbInitiativeSubscription)
				var b = jsonify(new ValidDbInitiativeSubscription)
				var create = sqlite.create.bind(sqlite, "initiative_subscriptions")
				;(yield [a, b].map(create)).must.eql([a, b])
			})

			it("must throw error on constraint violation", function*() {
				var uuid = "257dd54c-2806-4d23-85de-daca431645bd"
				var attrs = {initiative_uuid: uuid, update_token: "deadbeef"}
				var a = jsonify(new ValidDbInitiativeSubscription(attrs))
				var b = jsonify(new ValidDbInitiativeSubscription(attrs))

				var err
				var create = sqlite.create.bind(sqlite, "initiative_subscriptions")
				try { yield [a, b].map(create) } catch (ex) { err = ex }
				err.must.be.an.error(/UNIQUE/)
			})
		})
	})
})
