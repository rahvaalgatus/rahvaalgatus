var _ = require("root/lib/underscore")
var Crypto = require("crypto")
var SqliteError = require("root/lib/sqlite_error")
var ValidUser = require("root/test/valid_user")
var ValidInitiative = require("root/test/valid_db_initiative")
var ValidSignature = require("root/test/valid_signature")
var initiativesDb = require("root/db/initiatives_db")
var usersDb = require("root/db/users_db")
var signersDb = require("root/db/signers_db")
var db = require("root/db/initiative_signatures_db")
var sql = require("sqlate")
var concat = Array.prototype.concat.bind(Array.prototype)

describe("InitiativeSignaturesDb", function() {
	require("root/test/db")()

	beforeEach(function*() {
		this.initiative = yield initiativesDb.create(new ValidInitiative({
			user_id: (yield usersDb.create(new ValidUser)).id
		}))
	})

	describe(".create", function() {
		it("must throw given duplicate country and personal ids", function*() {
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

		it("must create signer and update signature", function*() {
			var signature = yield db.create(new ValidSignature({
				initiative_uuid: this.initiative.uuid
			}))

			yield signersDb.search(sql`SELECT * FROM signers`).must.then.eql([{
				id: 1,
				country: signature.country,
				personal_id: signature.personal_id,
				first_signed_at: signature.created_at,
				last_signed_at: signature.created_at
			}])

			signature.signer_id.must.equal(1)
		})

		it("must update signer and update signature", function*() {
			var a = yield db.create(new ValidSignature({
				initiative_uuid: this.initiative.uuid,
				created_at: new Date(2015, 5, 18, 13, 37, 42, 666)
			}))

			var signer = yield signersDb.read(sql`SELECT * FROM signers`)

			var initiative = yield initiativesDb.create(new ValidInitiative({
				user_id: this.initiative.user_id
			}))

			var b = yield db.create(new ValidSignature({
				initiative_uuid: initiative.uuid,
				country: a.country,
				personal_id: a.personal_id
			}))

			b.signer_id.must.equal(1)

			yield signersDb.read(sql`SELECT * FROM signers`).must.then.eql({
				__proto__: signer,
				last_signed_at: b.created_at
			})
		})

		// Ensures the trigger selects the correct signer and updates the correct
		// initiative.
		it("must create signer and update signatures given multiple signatures ",
			function*() {
			var signatures = yield db.create(_.times(3, () => new ValidSignature({
				initiative_uuid: this.initiative.uuid
			})))

			var initiative = yield initiativesDb.create(new ValidInitiative({
				user_id: this.initiative.user_id
			}))

			var signature = yield db.create(new ValidSignature({
				initiative_uuid: initiative.uuid,
				country: signatures[1].country,
				personal_id: signatures[1].personal_id
			}))

			signature.signer_id.must.equal(2)

			var signers = yield signersDb.search(sql`SELECT * FROM signers`)
			signers.must.eql(signatures.map((sig, i) => ({
				id: i + 1,
				country: sig.country,
				personal_id: sig.personal_id,
				first_signed_at: sig.created_at,
				last_signed_at: i == 1 ? signature.created_at : sig.created_at
			})))

			yield db.search(sql`SELECT * FROM initiative_signatures`).must.then.eql(
				concat(signatures, signature)
			)
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

			yield db.read(yield db.create(signature)).must.then.eql({
				__proto__: signature,
				signer_id: 1
			})
		})
	})
})
