var _ = require("root/lib/underscore")
var Crypto = require("crypto")
var SqliteError = require("root/lib/sqlite_error")
var ValidInitiative = require("root/test/valid_db_initiative")
var ValidSignature = require("root/test/valid_signature")
var initiativesDb = require("root/db/initiatives_db")
var db = require("root/db/initiative_signatures_db")

describe("InitiativeSignaturesDb", function() {
	require("root/test/db")()

	beforeEach(function*() {
		this.initiative = yield initiativesDb.create(new ValidInitiative)
	})
	
	describe(".create", function() {
		it("must throw given duplicate country and personal ids", function*() {
			var attrs = new ValidSignature({initiative_uuid: this.initiative.uuid})
			yield db.create(attrs)

			var err
			try { yield db.create(attrs) } catch (ex) { err = ex }
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
