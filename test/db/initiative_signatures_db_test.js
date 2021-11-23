var _ = require("root/lib/underscore")
var Crypto = require("crypto")
var SqliteError = require("root/lib/sqlite_error")
var ValidUser = require("root/test/valid_user")
var ValidInitiative = require("root/test/valid_initiative")
var ValidSignature = require("root/test/valid_signature")
var usersDb = require("root/db/users_db")
var initiativesDb = require("root/db/initiatives_db")
var signaturesDb = require("root/db/initiative_signatures_db")
var sql = require("sqlate")

describe("InitiativeSignaturesDb", function() {
	require("root/test/db")()

	beforeEach(function*() {
		this.initiative = yield initiativesDb.create(new ValidInitiative({
			user_id: (yield usersDb.create(new ValidUser)).id
		}))
	})

	describe(".create", function() {
		it("must create signature", function*() {
			var signature = new ValidSignature({
				initiative_uuid: this.initiative.uuid
			})

			yield signaturesDb.read(
				yield signaturesDb.create(signature)
			).must.then.eql(_.create(signature, {id: 1}))
		})

		it("must create anonymized signature", function*() {
			var signature = new ValidSignature({
				initiative_uuid: this.initiative.uuid,
				country: "EE",
				personal_id: "387",
				token: null,
				xades: null,
				anonymized: true
			})

			yield signaturesDb.create(signature)

			yield signaturesDb.search(sql`
				SELECT * FROM initiative_signatures
			`).must.then.eql([_.create(signature, {id: 1})])
		})

		// Ensures there's no UNIQUE constraint on the country and personal_id
		// pair for anonymized signatures.
		it("must create multiple anonymized signatures", function*() {
			var signatures = yield _.times(3, () => new ValidSignature({
				initiative_uuid: this.initiative.uuid,
				country: "EE",
				personal_id: "387",
				token: null,
				xades: null,
				anonymized: true
			}))

			yield signaturesDb.create(signatures)

			yield signaturesDb.search(sql`
				SELECT * FROM initiative_signatures
			`).must.then.eql(signatures.map((sig, i) => _.create(sig, {id: i + 1})))
		})

		it("must throw given invalid personal id for signature", function*() {
			var err
			try {
				yield signaturesDb.create(new ValidSignature({
					initiative_uuid: this.initiative.uuid,
					country: "EE",
					personal_id: "387061813378"
				}))
			}
			catch (ex) { err = ex }
			err.must.be.an.error(SqliteError)
			err.code.must.equal("constraint")
			err.type.must.equal("check")
			err.constraint.must.equal("personal_id_format")
		})

		it("must throw given invalid personal id for anonymized signature",
			function*() {
			var err
			try {
				yield signaturesDb.create(new ValidSignature({
					initiative_uuid: this.initiative.uuid,
					country: "EE",
					personal_id: "38706",
					anonymized: true
				}))
			}
			catch (ex) { err = ex }
			err.must.be.an.error(SqliteError)
			err.code.must.equal("constraint")
			err.type.must.equal("check")
			err.constraint.must.equal("personal_id_format")
		})

		it("must throw given duplicate country and personal ids", function*() {
			var attrs = {
				initiative_uuid: this.initiative.uuid,
				country: "EE",
				personal_id: "38706181337"
			}

			yield signaturesDb.create(new ValidSignature(attrs))

			var err
			try { yield signaturesDb.create(new ValidSignature(attrs)) }
			catch (ex) { err = ex }
			err.must.be.an.error(SqliteError)
			err.code.must.equal("constraint")
			err.type.must.equal("unique")
			err.columns.must.eql(["initiative_uuid", "country", "personal_id"])
		})

		it("must throw given duplicate tokens", function*() {
			var attrs = new ValidSignature({token: Crypto.randomBytes(12)})

			yield signaturesDb.create(_.defaults({
				initiative_uuid: this.initiative.uuid
			}, attrs))

			var otherInitiative = yield initiativesDb.create(new ValidInitiative({
				user_id: this.initiative.user_id
			}))

			var err
			try {
				yield signaturesDb.create(_.defaults({
					initiative_uuid: otherInitiative.uuid
				}, attrs))
			}
			catch (ex) { err = ex }
			err.must.be.an.error(SqliteError)
			err.code.must.equal("constraint")
			err.type.must.equal("unique")
			err.columns.must.eql(["token"])
		})

		it("must create signature for different initiatives from same person",
			function*() {
			var attrs = {
				country: "EE",
				personal_id: "38706181337"
			}

			var a = yield signaturesDb.create(new ValidSignature({
				__proto__: attrs,
				initiative_uuid: this.initiative.uuid
			}))

			var otherInitiative = yield initiativesDb.create(new ValidInitiative({
				user_id: this.initiative.user_id
			}))

			var b = yield signaturesDb.create(new ValidSignature({
				__proto__: attrs,
				initiative_uuid: otherInitiative.uuid
			}))

			yield signaturesDb.search(sql`
				SELECT * FROM initiative_signatures
			`).must.then.eql([a, b].map((sig, i) => _.create(sig, {id: i + 1})))
		})

		it("must err given token for anonymized signature", function*() {
			var err
			try {
				yield signaturesDb.create(new ValidSignature({
					initiative_uuid: this.initiative.uuid,
					country: "EE",
					personal_id: "387",
					token: Crypto.randomBytes(12),
					xades: null,
					anonymized: true
				}))
			}
			catch (ex) { err = ex }
			err.must.be.an.error(SqliteError)
			err.code.must.equal("constraint")
			err.type.must.equal("check")
			err.constraint.must.equal("token_null")
		})

		it("must err given XAdES for anonymized signature", function*() {
			var err
			try {
				yield signaturesDb.create(new ValidSignature({
					initiative_uuid: this.initiative.uuid,
					country: "EE",
					personal_id: "387",
					token: null,
					xades: "<XAdESSignatures>EE38706181337</XAdESSignatures>",
					anonymized: true
				}))
			}
			catch (ex) { err = ex }
			err.must.be.an.error(SqliteError)
			err.code.must.equal("constraint")
			err.type.must.equal("check")
			err.constraint.must.equal("xades_null")
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

			yield signaturesDb.read(
				yield signaturesDb.create(signature)
			).must.then.eql(_.create(signature, {id: 1}))
		})
	})
})
