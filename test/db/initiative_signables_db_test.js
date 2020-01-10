var Crypto = require("crypto")
var ValidInitiative = require("root/test/valid_db_initiative")
var Xades = require("undersign/xades")
var Certificate = require("undersign/lib/certificate")
var initiativesDb = require("root/db/initiatives_db")
var newCertificate = require("root/test/fixtures").newCertificate
var db = require("root/db/initiative_signables_db")

var xades = Xades.parse(String(new Xades(new Certificate(newCertificate({
	subject: {countryName: "EE"},
	issuer: {countryName: "EE"}
})), [])))

xades.setSignature(Buffer.from("foo"))

describe("InitiativeSignablesDb", function() {
	require("root/test/db")()

	beforeEach(function*() {
		this.initiative = yield initiativesDb.create(new ValidInitiative)
	})

	describe(".read", function() {
		it("must parse a signable", function*() {
			var signable = {
				initiative_uuid: this.initiative.uuid,
				token: Crypto.randomBytes(12),
				country: "EE",
				personal_id: "38706181337",
				xades: xades,
				method: "mobile-id",
				signed: false,
				timestamped: false,
				created_at: new Date(2015, 5, 18, 13, 37, 42, 666),
				updated_at: new Date(2015, 5, 18, 14, 37, 42, 666),
				error: null
			}

			yield db.read(yield db.create(signable)).must.then.eql(signable)
		})
	})
})
