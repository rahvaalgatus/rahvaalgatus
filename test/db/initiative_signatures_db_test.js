var _ = require("root/lib/underscore")
var Crypto = require("crypto")
var SqliteError = require("root/lib/sqlite_error")
var ValidInitiative = require("root/test/valid_db_initiative")
var initiativesDb = require("root/db/initiatives_db")
var db = require("root/db/initiative_signatures_db")

describe("InitiativeSignaturesDb", function() {
	require("root/test/db")()

	beforeEach(function*() {
		this.initiative = yield initiativesDb.create(new ValidInitiative)
	})
	
	describe(".create", function() {
		it("must throw given duplicate country and personal ids", function*() {
			var attrs = {
				initiative_uuid: this.initiative.uuid,
				country: "EE",
				personal_id: "60001019906",
				xades: "<XAdESSignatures />"
			}

			yield db.create(attrs)

			var err
			try { yield db.create(attrs) } catch (ex) { err = ex }
			err.must.be.an.error(SqliteError)
			err.code.must.equal("constraint")
			err.type.must.equal("unique")
			err.columns.must.eql(["initiative_uuid", "country", "personal_id"])
		})

		it("must throw given duplicate tokens", function*() {
			var attrs = {
				country: "EE",
				personal_id: "60001019906",
				token: Crypto.randomBytes(12),
				xades: "<XAdESSignatures />"
			}

			yield db.create(_.defaults({
				initiative_uuid: this.initiative.uuid
			}, attrs))

			var err
			try { yield db.create(_.defaults({
				initiative_uuid: (yield initiativesDb.create(new ValidInitiative)).uuid
			}, attrs)) }
			catch (ex) { err = ex }
			err.must.be.an.error(SqliteError)
			err.code.must.equal("constraint")
			err.type.must.equal("unique")
			err.columns.must.eql(["token"])
		})
	})
})
