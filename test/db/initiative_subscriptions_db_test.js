var ValidSubscription = require("root/test/valid_subscription")
var ValidInitiative = require("root/test/valid_db_initiative")
var initiativeDb = require("root/db/initiatives_db")
var db = require("root/db/initiative_subscriptions_db")
var sql = require("sqlate")

describe("InitiativeSubscriptionsDb", function() {
	require("root/test/db")()

	beforeEach(function*() {
		this.initiative = yield initiativeDb.create(new ValidInitiative)
	})

	describe(".prototype.create", function() {
		it("must create different subscriptions for different emails", function*() {
			var a = new ValidSubscription({initiative_uuid: this.initiative.uuid})
			var b = new ValidSubscription({initiative_uuid: this.initiative.uuid})
			a = yield db.create(a)
			b = yield db.create(b)

			var subs = yield db.search(sql`SELECT * FROM initiative_subscriptions`)
			subs.must.eql([a, b])
		})

		it("must have a unique constraint on case-insensitive email", function*() {
			var subscription = yield db.create(new ValidSubscription({
				initiative_uuid: this.initiative.uuid,
				email: "user@example.com"
			}))

			var other = new ValidSubscription({
				initiative_uuid: subscription.initiative_uuid,
				email: subscription.email.toUpperCase()
			})

			var err
			try { yield db.create(other) } catch (ex) { err = ex }
			err.must.be.an.error(/UNIQUE.*initiative_uuid_and_email/)
			err.code.must.equal("constraint")
			err.type.must.equal("unique")
		})

		it("must have a unique constraint on initiative_uuid", function*() {
			var subscription = yield db.create(new ValidSubscription({
				initiative_uuid: this.initiative.uuid
			}))

			var other = new ValidSubscription({
				initiative_uuid: subscription.initiative_uuid,
				email: subscription.email
			})

			var err
			try { yield db.create(other) } catch (ex) { err = ex }
			err.must.be.an.error(/UNIQUE.*initiative_uuid_and_email/)
			err.code.must.equal("constraint")
			err.type.must.equal("unique")
		})

		it("must have a unique constraint on NULL initiative_uuid", function*() {
			var subscription = yield db.create(new ValidSubscription({
				initiative_uuid: null
			}))

			var other = new ValidSubscription({
				initiative_uuid: null,
				email: subscription.email
			})

			var err
			try { yield db.create(other) } catch (ex) { err = ex }
			err.must.be.an.error(/UNIQUE.*initiative_uuid_and_email/)
			err.code.must.equal("constraint")
			err.type.must.equal("unique")
		})
	})
})
