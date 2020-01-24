var _ = require("root/lib/underscore")
var Crypto = require("crypto")
var SqliteError = require("root/lib/sqlite_error")
var ValidUser = require("root/test/valid_user")
var ValidInitiative = require("root/test/valid_db_initiative")
var ValidSignature = require("root/test/valid_signature")
var initiativesDb = require("root/db/initiatives_db")
var usersDb = require("root/db/users_db")
var db = require("root/db/initiative_signatures_db")

describe("InitiativeSignaturesDb", function() {
	require("root/test/db")()

	beforeEach(function*() {
		this.initiative = yield initiativesDb.create(new ValidInitiative({
			user_id: (yield usersDb.create(new ValidUser)).id
		}))
	})

	describe(".create", function() {
		it("must throw given duplicate country and personal ids",
			function*() {
			var attrs = {
				initiative_uuid: this.initiative.uuid,
				country: "EE",
				personal_id: "38706181337"
			}

			yield db.create(new ValidSignature(attrs))

			var err
			try { yield db.create(new ValidSignature(attrs)) } catch (ex) { err = ex }
			err.must.be.an.error(SqliteError)
			err.code.must.equal("constraint")
			err.type.must.equal("unique")
			err.columns.must.eql(["initiative_uuid", "country", "personal_id"])
		})

		it("must throw given duplicate tokens", function*() {
			var attrs = new ValidSignature({token: Crypto.randomBytes(12)})

			yield db.create(_.defaults({
				initiative_uuid: this.initiative.uuid
			}, attrs))

			var otherInitiative = yield initiativesDb.create(new ValidInitiative({
				user_id: this.initiative.user_id
			}))

			var err
			try {
				yield db.create(_.defaults({
					initiative_uuid: otherInitiative.uuid
				}, attrs))
			}
			catch (ex) { err = ex }
			err.must.be.an.error(SqliteError)
			err.code.must.equal("constraint")
			err.type.must.equal("unique")
			err.columns.must.eql(["token"])
		})
	})

	describe(".read", function() {
		it("must parse a signature", function*() {
			var signature = new ValidSignature({
				initiative_uuid: this.initiative.uuid,
				token: Crypto.randomBytes(12),
				created_at: new Date(2015, 5, 18, 13, 37, 42, 666),
				updated_at: new Date(2015, 5, 18, 14, 37, 42, 666)
			})

			yield db.read(yield db.create(signature)).must.then.eql(signature)
		})
	})
})
