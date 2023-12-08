var SqliteError = require("root/lib/sqlite_error")
var ValidUser = require("root/test/valid_user")
var ValidSubscription = require("root/test/valid_subscription")
var ValidInitiative = require("root/test/valid_initiative")
var initiativesDb = require("root/db/initiatives_db")
var subscriptionsDb = require("root/db/initiative_subscriptions_db")
var usersDb = require("root/db/users_db")
var sql = require("sqlate")

describe("InitiativeSubscriptionsDb", function() {
	require("root/test/db")()

	beforeEach(function() {
		this.initiative = initiativesDb.create(new ValidInitiative({
			user_id: usersDb.create(new ValidUser).id
		}))
	})

	describe(".prototype.create", function() {
		it("must create different subscriptions for different emails", function() {
			var a = new ValidSubscription({initiative_uuid: this.initiative.uuid})
			var b = new ValidSubscription({initiative_uuid: this.initiative.uuid})
			a = subscriptionsDb.create(a)
			b = subscriptionsDb.create(b)

			var subs = subscriptionsDb.search(sql`
				SELECT * FROM initiative_subscriptions
			`)

			subs.must.eql([a, b])
		})

		it("must have a unique constraint on case-insensitive email", function() {
			var subscription = subscriptionsDb.create(new ValidSubscription({
				initiative_uuid: this.initiative.uuid,
				email: "user@example.com"
			}))

			var other = new ValidSubscription({
				initiative_uuid: subscription.initiative_uuid,
				email: subscription.email.toUpperCase()
			})

			var err
			try { subscriptionsDb.create(other) } catch (ex) { err = ex }
			err.must.be.an.error(SqliteError)
			err.code.must.equal("constraint")
			err.type.must.equal("unique")
			err.index.must.equal(
				"index_initiative_subscriptions_initiative_uuid_destination_and_email"
			)
		})

		it("must prevent subscription for both initiative and destination",
			function() {
			var err
			try {
				subscriptionsDb.create(new ValidSubscription({
					initiative_uuid: this.initiative.uuid,
					initiative_destination: "tallinn"
				}))
			}
			catch (ex) { err = ex }

			err.must.be.an.error(SqliteError)
			err.code.must.equal("constraint")
			err.type.must.equal("check")
			err.constraint.must.equal("initiative_uuid_nand_destination")
		})

		it("must have a unique constraint on initiative_uuid", function() {
			var subscription = subscriptionsDb.create(new ValidSubscription({
				initiative_uuid: this.initiative.uuid
			}))

			var other = new ValidSubscription({
				initiative_uuid: subscription.initiative_uuid,
				email: subscription.email
			})

			var err
			try { subscriptionsDb.create(other) } catch (ex) { err = ex }
			err.must.be.an.error(SqliteError)
			err.code.must.equal("constraint")
			err.type.must.equal("unique")
			err.index.must.equal(
				"index_initiative_subscriptions_initiative_uuid_destination_and_email"
			)
		})

		it("must have a unique constraint on NULL initiative_uuid", function() {
			var subscription = subscriptionsDb.create(new ValidSubscription({
				initiative_uuid: null
			}))

			var other = new ValidSubscription({
				initiative_uuid: null,
				email: subscription.email
			})

			var err
			try { subscriptionsDb.create(other) } catch (ex) { err = ex }
			err.must.be.an.error(SqliteError)
			err.code.must.equal("constraint")
			err.index.must.equal(
				"index_initiative_subscriptions_initiative_uuid_destination_and_email"
			)
		})

		it("must permit different initiative destinations", function() {
			var subscriptions = subscriptionsDb.create([
				new ValidSubscription({
					initiative_destination: "parliament",
					email: "user@example.com"
				}),

				new ValidSubscription({
					initiative_destination: "tallinn",
					email: "user@example.com"
				})
			])

			subscriptionsDb.search(sql`
				SELECT * FROM initiative_subscriptions
			`).must.eql(subscriptions)
		})

		it("must have a unique constraint on initiative destination", function() {
			var subscription = subscriptionsDb.create(new ValidSubscription({
				initiative_destination: "tallinn"
			}))

			var other = new ValidSubscription({
				initiative_destination: "tallinn",
				email: subscription.email
			})

			var err
			try { subscriptionsDb.create(other) } catch (ex) { err = ex }
			err.must.be.an.error(SqliteError)
			err.code.must.equal("constraint")
			err.index.must.equal(
				"index_initiative_subscriptions_initiative_uuid_destination_and_email"
			)
		})
	})
})
