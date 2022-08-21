var _ = require("root/lib/underscore")
var DateFns = require("date-fns")
var ValidUser = require("root/test/valid_user")
var ValidInitiative = require("root/test/valid_initiative")
var ValidSignature = require("root/test/valid_signature")
var ValidCitizenosSignature = require("root/test/valid_citizenos_signature")
var cli = require("root/cli/initiative_signatures_cli")
var usersDb = require("root/db/users_db")
var initiativesDb = require("root/db/initiatives_db")
var signaturesDb = require("root/db/initiative_signatures_db")
var cosSignaturesDb = require("root/db/initiative_citizenos_signatures_db")
var sql = require("sqlate")
var {PHASES} = require("root/lib/initiative")
var {anonymizeSignaturesReceivedAfterDays} = require("root").config

describe("InitiativeSignaturesCli", function() {
	require("root/test/db")()
	require("root/test/email")()
	require("root/test/time")(new Date(2015, 5, 18, 13, 37, 42))

	beforeEach(function() { this.user = usersDb.create(new ValidUser) })

	function mustAnonymize(initiative) {
		var signatures = signaturesDb.create(_.times(3, () => (
			new ValidSignature({initiative_uuid: initiative.uuid})
		)))

		signatures.forEach((sig) => sig.anonymized.must.be.false())

		var cosSignatures = cosSignaturesDb.create(_.times(3, () => (
			new ValidCitizenosSignature({initiative_uuid: initiative.uuid})
		)))

		cosSignatures.forEach((sig) => sig.anonymized.must.be.false())

		cli(["initiative-signatures", "anonymize", "--yes"])

		initiativesDb.read(initiative).must.eql(
			_.assign({}, initiative, {signatures_anonymized_at: new Date})
		)

		signaturesDb.search(sql`
			SELECT * FROM initiative_signatures
		`).must.eql(signatures.map((sig) => _.assign(sig, {
			personal_id: sig.personal_id.slice(0, 3),
			token: null,
			xades: null,
			anonymized: true
		})))

		cosSignaturesDb.search(sql`
			SELECT * FROM initiative_citizenos_signatures
		`).must.eql(cosSignatures.map((sig) => _.assign(sig, {
			personal_id: sig.personal_id.slice(0, 3),
			asic: null,
			anonymized: true
		})))
	}

	function mustNotAnonymize(initiative) {
		var signature = signaturesDb.create(new ValidSignature({
			initiative_uuid: initiative.uuid
		}))

		signature.anonymized.must.be.false()

		var cosSignature = cosSignaturesDb.create(
			new ValidCitizenosSignature({initiative_uuid: initiative.uuid})
		)

		cosSignature.anonymized.must.be.false()

		cli(["initiative-signatures", "anonymize", "--yes"])
		initiativesDb.read(initiative).must.eql(initiative)
		signaturesDb.read(signature).must.eql(signature)
		cosSignaturesDb.read(cosSignature).must.eql(cosSignature)
	}

	it("must not anonymize other initiatives' signatures", function() {
		var initiative = initiativesDb.create(new ValidInitiative({
			user_id: this.user.id,
			destination: "parliament",
			phase: "parliament",

			received_by_parliament_at:
				DateFns.addDays(new Date, -anonymizeSignaturesReceivedAfterDays)
		}))

		var otherInitiative = initiativesDb.create(new ValidInitiative({
			user_id: this.user.id,
			phase: "sign"
		}))

		var signature = signaturesDb.create(new ValidSignature({
			initiative_uuid: otherInitiative.uuid
		}))

		var cosSignature = cosSignaturesDb.create(
			new ValidCitizenosSignature({initiative_uuid: otherInitiative.uuid})
		)

		cli(["initiative-signatures", "anonymize", "--yes"])

		initiativesDb.read(initiative).must.eql(
			_.assign({}, initiative, {signatures_anonymized_at: new Date})
		)

		initiativesDb.read(otherInitiative).must.eql(otherInitiative)
		signaturesDb.read(signature).must.eql(signature)
		cosSignaturesDb.read(cosSignature).must.eql(cosSignature)
	})

	it("must not anonymize external initiative", function() {
		var initiative = initiativesDb.create(new ValidInitiative({
			destination: "parliament",
			phase: "parliament",
			external: true,

			received_by_parliament_at:
				DateFns.addDays(new Date, -anonymizeSignaturesReceivedAfterDays)
		}))

		mustNotAnonymize(initiative)
	})

	describe("when destined for parliament", function() {
		;["edit", "sign"].forEach(function(phase) {
			it(`must not anonymize initiative in ${phase} phase received by the parliament`, function() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.user.id,
					destination: "parliament",
					phase: phase,

					received_by_parliament_at:
						DateFns.addDays(new Date, -anonymizeSignaturesReceivedAfterDays)
				}))

				mustNotAnonymize(initiative)
			})
		})

		_.without(PHASES, "edit", "sign").forEach(function(phase) {
			it(`must anonymize initiative in ${phase} phase received by the parliament`,
				function() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.user.id,
					destination: "parliament",
					phase: phase,

					received_by_parliament_at:
						DateFns.addDays(new Date, -anonymizeSignaturesReceivedAfterDays)
				}))

				mustAnonymize(initiative)
			})
		})

		it(`must not anonymize initiative received recently`, function() {
			var receivedAt = DateFns.addMilliseconds(DateFns.addDays(
				new Date,
				-anonymizeSignaturesReceivedAfterDays
			), 1)

			var initiative = initiativesDb.create(new ValidInitiative({
				user_id: this.user.id,
				destination: "parliament",
				phase: "parliament",
				received_by_parliament_at: receivedAt
			}))

			mustNotAnonymize(initiative)
		})

		it(`must not anonymize initiative not received`, function() {
			var initiative = initiativesDb.create(new ValidInitiative({
				user_id: this.user.id,
				destination: "parliament",
				phase: "parliament"
			}))

			mustNotAnonymize(initiative)
		})

		it("must not anonymize initiative received only by the government",
			function() {
			var initiative = initiativesDb.create(new ValidInitiative({
				user_id: this.user.id,
				destination: "parliament",
				phase: "government",

				received_by_government_at:
					DateFns.addDays(new Date, -anonymizeSignaturesReceivedAfterDays)
			}))

			mustNotAnonymize(initiative)
		})
	})

	describe("when destined for local government", function() {
		// Local initiative isn't permitted to be in the parliament phase.
		;["edit", "sign"].forEach(function(phase) {
			it(`must not anonymize initiative in ${phase} phase received by the parliament`, function() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.user.id,
					destination: "parliament",
					phase: phase,

					received_by_government_at:
						DateFns.addDays(new Date, -anonymizeSignaturesReceivedAfterDays)
				}))

				mustNotAnonymize(initiative)
			})
		})

		_.without(PHASES, "edit", "sign", "parliament").forEach(function(phase) {
			it(`must anonymize initiative in ${phase} phase received`,
				function() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.user.id,
					destination: "muhu-vald",
					phase: phase,

					received_by_government_at:
						DateFns.addDays(new Date, -anonymizeSignaturesReceivedAfterDays)
				}))

				mustAnonymize(initiative)
			})
		})

		it(`must not anonymize initiative not received`, function() {
			var initiative = initiativesDb.create(new ValidInitiative({
				user_id: this.user.id,
				destination: "muhu-vald",
				phase: "government"
			}))

			mustNotAnonymize(initiative)
		})

		it(`must not anonymize initiative received recently`, function() {
			var receivedAt = DateFns.addMilliseconds(DateFns.addDays(
				new Date,
				-anonymizeSignaturesReceivedAfterDays
			), 1)

			var initiative = initiativesDb.create(new ValidInitiative({
				user_id: this.user.id,
				destination: "muhu-vald",
				phase: "government",
				received_by_government_at: receivedAt
			}))

			mustNotAnonymize(initiative)
		})
	})
})
