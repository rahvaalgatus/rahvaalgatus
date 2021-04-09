var _ = require("root/lib/underscore")
var Url = require("url")
var DateFns = require("date-fns")
var Asic = require("undersign/lib/asic")
var Config = require("root/config")
var ValidInitiative = require("root/test/valid_db_initiative")
var ValidSignature = require("root/test/valid_signature")
var ValidCitizenosSignature = require("root/test/valid_citizenos_signature")
var ValidUser = require("root/test/valid_user")
var ValidSession = require("root/test/valid_session")
var ValidText = require("root/test/valid_initiative_text")
var ValidTextSignature = require("root/test/valid_initiative_text_signature")
var Certificate = require("undersign/lib/certificate")
var Initiative = require("root/lib/initiative")
var X509Asn = require("undersign/lib/x509_asn")
var Ocsp = require("undersign/lib/ocsp")
var Http = require("root/lib/http")
var Crypto = require("crypto")
var Zip = require("root/lib/zip")
var respond = require("root/test/fixtures").respond
var sql = require("sqlate")
var t = require("root/lib/i18n").t.bind(null, Config.language)
var newCertificate = require("root/test/fixtures").newCertificate
var newOcspResponse = require("root/test/fixtures").newOcspResponse
var usersDb = require("root/db/users_db")
var sessionsDb = require("root/db/sessions_db")
var initiativesDb = require("root/db/initiatives_db")
var signaturesDb = require("root/db/initiative_signatures_db")
var signablesDb = require("root/db/initiative_signables_db")
var textsDb = require("root/db/initiative_texts_db")
var textSignaturesDb = require("root/db/initiative_text_signatures_db")
var citizenosSignaturesDb =
	require("root/db/initiative_citizenos_signatures_db")
var hades = require("root").hades
var demand = require("must")
var next = require("co-next")
var tsl = require("root").tsl
var ASICE_TYPE = "application/vnd.etsi.asic-e+zip"
var CSV_TYPE = "text/csv; charset=utf-8"
var ZIP_TYPE = "application/zip"
var MOBILE_ID_URL = Url.parse("https://mid.sk.ee/mid-api/")
var SMART_ID_URL = Url.parse("https://rp-api.smart-id.com/v1/")
var TIMEMARK_URL = Url.parse(Config.timemarkUrl)
var CERTIFICATE_TYPE = "application/pkix-cert"
var ERR_TYPE = "application/vnd.rahvaalgatus.error+json"
var SIGNABLE_TYPE = "application/vnd.rahvaalgatus.signable"
var SIGNATURE_TYPE = "application/vnd.rahvaalgatus.signature"
var VALID_ISSUERS = require("root/test/fixtures").VALID_ISSUERS
var JOHN_RSA_KEYS = require("root/test/fixtures").JOHN_RSA_KEYS
var JOHN_ECDSA_KEYS = require("root/test/fixtures").JOHN_ECDSA_KEYS
var SESSION_ID = "7c8bdd56-6772-4264-ba27-bf7a9ef72a11"
var {PHONE_NUMBER_TRANSFORMS} = require("root/test/fixtures")
var TODAY = new Date(2015, 5, 18)
var ADULT_BIRTHDATE = DateFns.addYears(TODAY, -16)
var CHILD_BIRTHDATE = DateFns.addDays(ADULT_BIRTHDATE, 1)
var ADULT_PERSONAL_ID = formatPersonalId(ADULT_BIRTHDATE) + "1337"
var CHILD_PERSONAL_ID = formatPersonalId(CHILD_BIRTHDATE) + "1337"
var SMART_ID = "PNOEE-" + ADULT_PERSONAL_ID + "-R2D2-Q"
var LOCAL_SITE_HOSTNAME = Url.parse(Config.localSiteUrl).hostname
var LOCAL_GOVERNMENTS = require("root/lib/local_governments")

// See https://github.com/maxmind/MaxMind-DB/blob/master/source-data for
// available test IP addresses.
var LONDON_FORWARDED_FOR = "81.2.69.160, 127.0.0.1"

var ID_CARD_CERTIFICATE = new Certificate(newCertificate({
	subject: {
		countryName: "EE",
		organizationName: "ESTEID",
		organizationalUnitName: "digital signature",
		commonName: `SMITH,JOHN,${ADULT_PERSONAL_ID}`,
		surname: "SMITH",
		givenName: "JOHN",
		serialNumber: `PNOEE-${ADULT_PERSONAL_ID}`
	},

	issuer: VALID_ISSUERS[0],
	publicKey: JOHN_RSA_KEYS.publicKey
}))

var MOBILE_ID_CERTIFICATE = new Certificate(newCertificate({
	subject: {
		countryName: "EE",
		organizationName: "ESTEID (MOBIIL-ID)",
		organizationalUnitName: "digital signature",
		commonName: `SMITH,JOHN,${ADULT_PERSONAL_ID}`,
		surname: "SMITH",
		givenName: "JOHN",
		serialNumber: `PNOEE-${ADULT_PERSONAL_ID}`
	},

	issuer: VALID_ISSUERS[0],
	publicKey: JOHN_RSA_KEYS.publicKey
}))

var SMART_ID_CERTIFICATE = new Certificate(newCertificate({
	subject: {
		countryName: "EE",
		organizationalUnitName: "SIGNATURE",
		commonName: `SMITH,JOHN,PNOEE-${ADULT_PERSONAL_ID}`,
		surname: "SMITH",
		givenName: "JOHN",
		serialNumber: `PNOEE-${ADULT_PERSONAL_ID}`
	},

	issuer: VALID_ISSUERS[0],
	publicKey: JOHN_RSA_KEYS.publicKey
}))

var MOBILE_ID_CREATE_ERRORS = {
	NOT_FOUND: [
		422,
		"Not a Mobile-Id User or Personal Id Mismatch",
		"MOBILE_ID_ERROR_NOT_FOUND"
	],

	NOT_ACTIVE: [
		422,
		"Mobile-Id Certificates Not Activated",
		"MOBILE_ID_ERROR_NOT_ACTIVE"
	]
}

var MOBILE_ID_SESSION_ERRORS = {
	TIMEOUT: [
		410,
		"Mobile-Id Timeout",
		"MOBILE_ID_ERROR_TIMEOUT"
	],

	NOT_MID_CLIENT: [
		410,
		"Mobile-Id Certificates Not Activated",
		"MOBILE_ID_ERROR_NOT_ACTIVE"
	],

	USER_CANCELLED: [
		410,
		"Mobile-Id Cancelled",
		"MOBILE_ID_ERROR_USER_CANCELLED"
	],

	SIGNATURE_HASH_MISMATCH: [
		410,
		"Mobile-Id Signature Hash Mismatch",
		"MOBILE_ID_ERROR_SIGNATURE_HASH_MISMATCH"
	],

	PHONE_ABSENT: [
		410,
		"Mobile-Id Phone Absent",
		"MOBILE_ID_ERROR_PHONE_ABSENT"
	],

	DELIVERY_ERROR: [
		410,
		"Mobile-Id Delivery Error",
		"MOBILE_ID_ERROR_DELIVERY_ERROR"
	],

	SIM_ERROR: [
		410,
		"Mobile-Id SIM Application Error",
		"MOBILE_ID_ERROR_SIM_ERROR"
	],
}

var SMART_ID_SESSION_ERRORS = {
	USER_REFUSED: [
		410,
		"Smart-Id Cancelled",
		"SMART_ID_ERROR_USER_REFUSED_SIGN"
	],

	TIMEOUT: [
		410,
		"Smart-Id Timeout",
		"SMART_ID_ERROR_TIMEOUT_SIGN"
	],

	DOCUMENT_UNUSABLE: [
		410,
		"Smart-Id Certificate Unusable",
		"SMART_ID_ERROR_DOCUMENT_UNUSABLE"
	],

	WRONG_VC: [
		410,
		"Wrong Smart-Id Verification Code Chosen",
		"SMART_ID_ERROR_WRONG_VERIFICATION_CODE"
	]
}

var LONDON_GEO = {
	country_code: "GB",
	country_name: "United Kingdom",
	subdivisions: [{code: "ENG", name: "England"}],
	city_name: "London",
	city_geoname_id: 2643743
}

describe("SignaturesController", function() {
	require("root/test/web")()
	require("root/test/mitm")()
	require("root/test/db")()
	require("root/test/email")()
	require("root/test/fixtures").csrf()
	beforeEach(require("root/test/mitm").router)

	function mustRespondWithSignatures(request) {
		it("must respond with 403 Forbidden if no token on initiative",
			function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				phase: "parliament",
				parliament_token: null
			}))

			var path = `/initiatives/${initiative.uuid}/signatures.asice`
			path += "?parliament-token="
			var res = yield request.call(this, path)
			res.statusCode.must.equal(403)
			res.statusMessage.must.equal("Signatures Not Available")
		})

		it("must respond with 403 Forbidden given no token", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				phase: "parliament",
				parliament_token: Crypto.randomBytes(12)
			}))

			var path = `/initiatives/${initiative.uuid}/signatures.asice`
			var res = yield request.call(this, path)
			res.statusCode.must.equal(403)
			res.statusMessage.must.equal("Invalid Token")
		})

		it("must respond with 403 Forbidden given empty token", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				phase: "parliament",
				parliament_token: Crypto.randomBytes(12)
			}))

			var path = `/initiatives/${initiative.uuid}/signatures.asice`
			var res = yield request.call(this, path + "?parliament-token=")
			res.statusCode.must.equal(403)
			res.statusMessage.must.equal("Invalid Token")
		})

		it("must respond with 403 Forbidden given invalid token", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				phase: "parliament",
				parliament_token: Crypto.randomBytes(12)
			}))

			var path = `/initiatives/${initiative.uuid}/signatures.asice`
			var token = Crypto.randomBytes(12).toString("hex")
			var res = yield request.call(this, path + "?parliament-token=" + token)
			res.statusCode.must.equal(403)
			res.statusMessage.must.equal("Invalid Token")

			res.headers["content-type"].must.equal("text/html; charset=utf-8")
			res.body.must.include(t("INITIATIVE_SIGNATURES_INVALID_TOKEN"))
		})

		it("must respond with 403 Forbidden given non-ascii token", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				phase: "parliament",
				parliament_token: Crypto.randomBytes(12)
			}))

			var path = `/initiatives/${initiative.uuid}/signatures.asice`
			var res = yield request.call(this, path + "?parliament-token=foo.bar")
			res.statusCode.must.equal(403)
			res.statusMessage.must.equal("Invalid Token")
		})

		it("must respond with 423 Locked if initiative received by parliament",
			function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				phase: "parliament",
				parliament_token: Crypto.randomBytes(12),
				received_by_parliament_at: new Date
			}))

			var path = `/initiatives/${initiative.uuid}/signatures.asice`
			path += "?parliament-token=" + initiative.parliament_token.toString("hex")
			var res = yield request.call(this, path)
			res.statusCode.must.equal(423)
			res.statusMessage.must.equal("Signatures Already In Parliament")

			res.headers["content-type"].must.equal("text/html; charset=utf-8")
			res.body.must.include(t("INITIATIVE_SIGNATURES_NO_LONGER_AVAILABLE"))
		})
	}

	describe(`GET / for ${ASICE_TYPE}`, function() {
		beforeEach(function*() {
			this.author = yield usersDb.create(new ValidUser)
		})

		mustRespondWithSignatures(function(url) { return this.request(url) })

		it("must respond with signature ASIC-E given parliament token",
			function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				phase: "parliament",
				parliament_token: Crypto.randomBytes(12)
			}))

			var signatures = _.sortBy(yield signaturesDb.create([
				new ValidSignature({initiative_uuid: initiative.uuid}),
				new ValidSignature({initiative_uuid: initiative.uuid})
			]), "personal_id")

			var path = `/initiatives/${initiative.uuid}/signatures.asice`
			path += "?parliament-token=" + initiative.parliament_token.toString("hex")
			var res = yield this.request(path)

			res.statusCode.must.equal(200)
			res.headers["content-type"].must.equal(ASICE_TYPE)
			res.headers["content-disposition"].must.equal(
				"attachment; filename=\"signatures.asice\""
			)

			var zip = yield Zip.parse(Buffer.from(res.body))
			var entries = yield Zip.parseEntries(zip)
			Object.keys(entries).length.must.equal(5)

			var entry = yield Zip.readEntry(zip, entries["initiative.html"])
			String(entry).must.equal(initiative.text)

			;(yield Promise.all([
				Zip.readEntry(zip, entries["META-INF/signatures-1.xml"]),
				Zip.readEntry(zip, entries["META-INF/signatures-2.xml"]),
			])).map(String).must.eql(_.map(signatures, "xades"))
		})

		it("must respond if no signatures", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				phase: "parliament",
				parliament_token: Crypto.randomBytes(12)
			}))

			var path = `/initiatives/${initiative.uuid}/signatures.asice`
			path += "?parliament-token=" + initiative.parliament_token.toString("hex")
			var res = yield this.request(path)

			res.statusCode.must.equal(200)
			res.headers["content-type"].must.equal(ASICE_TYPE)
			var zip = yield Zip.parse(Buffer.from(res.body))
			var entries = yield Zip.parseEntries(zip)
			Object.keys(entries).length.must.equal(3)

			var entry = yield Zip.readEntry(zip, entries["initiative.html"])
			String(entry).must.equal(initiative.text)
		})

		it("must not include signatures from other initiatives", function*() {
			var other = yield initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				phase: "parliament"
			}))

			var initiative = yield initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				phase: "parliament",
				parliament_token: Crypto.randomBytes(12)
			}))

			yield signaturesDb.create(new ValidSignature({
				initiative_uuid: other.uuid
			}))

			var path = `/initiatives/${initiative.uuid}/signatures.asice`
			path += "?parliament-token=" + initiative.parliament_token.toString("hex")
			var res = yield this.request(path)

			res.statusCode.must.equal(200)
			res.headers["content-type"].must.equal(ASICE_TYPE)
			var zip = yield Zip.parse(Buffer.from(res.body))
			var entries = yield Zip.parseEntries(zip)
			Object.keys(entries).length.must.equal(3)
		})

		_.each({
			period: ".",
			exclamation: "!"
		}, function(punctuation, name) {
			it(`must respond with signatures given trailing ${name}`, function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "parliament",
					parliament_token: Crypto.randomBytes(12)
				}))

				var path = `/initiatives/${initiative.uuid}/signatures.asice`
				path += "?parliament-token="
				path += initiative.parliament_token.toString("hex")

				var res = yield this.request(path + punctuation)
				res.statusCode.must.equal(200)
				res.headers["content-type"].must.equal(ASICE_TYPE)
			})
		})

		describe("when destined for local", function() {
			beforeEach(function*() {
				this.user = yield usersDb.create(new ValidUser)

				var session = new ValidSession({user_id: this.user.id})

				this.session = _.assign(yield sessionsDb.create(session), {
					token: session.token
				})

				this.initiative = yield initiativesDb.create(new ValidInitiative({
					destination: "muhu-vald",
					user_id: this.author.id,
					phase: "government",
					parliament_token: Crypto.randomBytes(12)
				}))
			})

			it("must respond with 401 Unauthenticated if not logged in", function*() {
				var path = `/initiatives/${this.initiative.uuid}/signatures.asice`
				var token = this.initiative.parliament_token.toString("hex")
				path += "?parliament-token=" + token

				var res = yield this.request(path, {
					headers: {Host: LOCAL_SITE_HOSTNAME}
				})

				res.statusCode.must.equal(401)
				res.statusMessage.must.equal("Unauthorized")
			})

			it("must respond with 403 Forbidden if no personal ids set", function*() {
				LOCAL_GOVERNMENTS["muhu-vald"].signatureDownloadPersonalIds = []

				var path = `/initiatives/${this.initiative.uuid}/signatures.asice`
				var token = this.initiative.parliament_token.toString("hex")
				path += "?parliament-token=" + token

				var res = yield this.request(path, {
					headers: {Host: LOCAL_SITE_HOSTNAME},
					session: this.session
				})

				res.statusCode.must.equal(403)
				res.statusMessage.must.equal("Not a Permitted Downloader")
			})

			it("must respond with 403 Forbidden if not permitted downloader",
				function*() {
				LOCAL_GOVERNMENTS["muhu-vald"].signatureDownloadPersonalIds = [
					"38706181337"
				]

				var path = `/initiatives/${this.initiative.uuid}/signatures.asice`
				var token = this.initiative.parliament_token.toString("hex")
				path += "?parliament-token=" + token

				var res = yield this.request(path, {
					headers: {Host: LOCAL_SITE_HOSTNAME},
					session: this.session
				})

				res.statusCode.must.equal(403)
				res.statusMessage.must.equal("Not a Permitted Downloader")
				res.headers["content-type"].must.equal("text/html; charset=utf-8")

				res.body.must.include(
					t("INITIATIVE_SIGNATURES_NOT_PERMITTED_DOWNLOADER")
				)
			})

			it("must respond with signatures if permitted downloader", function*() {
				LOCAL_GOVERNMENTS["muhu-vald"].signatureDownloadPersonalIds = [
					"38706181337",
					this.user.personal_id,
					"38706181338"
				]

				var path = `/initiatives/${this.initiative.uuid}/signatures.asice`
				var token = this.initiative.parliament_token.toString("hex")
				path += "?parliament-token=" + token

				var res = yield this.request(path, {
					headers: {Host: LOCAL_SITE_HOSTNAME},
					session: this.session
				})

				res.statusCode.must.equal(200)
				res.headers["content-type"].must.equal(ASICE_TYPE)
			})
		})

		it("must include Estonian translation if signed", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				phase: "parliament",
				parliament_token: Crypto.randomBytes(12),
				language: "en"
			}))

			var estonian = yield textsDb.create(new ValidText({
				initiative_uuid: initiative.uuid,
				user_id: initiative.user_id,
				language: "et"
			}))

			yield textSignaturesDb.create(new ValidTextSignature({
				text_id: estonian.id,
				signed: true,
				timestamped: true
			}))

			var path = `/initiatives/${initiative.uuid}/signatures.asice`
			path += "?parliament-token=" + initiative.parliament_token.toString("hex")
			var res = yield this.request(path)

			res.statusCode.must.equal(200)
			res.headers["content-type"].must.equal(ASICE_TYPE)
			var zip = yield Zip.parse(Buffer.from(res.body))
			var entries = yield Zip.parseEntries(zip)
			Object.keys(entries).length.must.equal(4)

			var translation = yield Zip.readEntry(zip, entries["estonian.html"])
			String(translation).must.equal(Initiative.renderForParliament(estonian))
		})

		it("must not include Estonian translations from other initiatives",
			function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				phase: "parliament",
				parliament_token: Crypto.randomBytes(12),
				language: "en"
			}))

			var estonian = yield textsDb.create(new ValidText({
				initiative_uuid: initiative.uuid,
				user_id: initiative.user_id,
				language: "et"
			}))

			yield textSignaturesDb.create(new ValidTextSignature({
				text_id: estonian.id,
				signed: true,
				timestamped: true
			}))

			// The latest translations is included, so create the decoy later.
			var other = yield initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				phase: "parliament",
				language: "en"
			}))

			var otherEstonian = yield textsDb.create(new ValidText({
				initiative_uuid: other.uuid,
				user_id: other.user_id,
				language: "et"
			}))

			yield textSignaturesDb.create(new ValidTextSignature({
				text_id: otherEstonian.id,
				signed: true,
				timestamped: true
			}))

			var path = `/initiatives/${initiative.uuid}/signatures.asice`
			path += "?parliament-token=" + initiative.parliament_token.toString("hex")
			var res = yield this.request(path)

			res.statusCode.must.equal(200)
			res.headers["content-type"].must.equal(ASICE_TYPE)
			var zip = yield Zip.parse(Buffer.from(res.body))
			var entries = yield Zip.parseEntries(zip)
			Object.keys(entries).length.must.equal(4)

			var translation = yield Zip.readEntry(zip, entries["estonian.html"])
			String(translation).must.equal(Initiative.renderForParliament(estonian))
		})

		it("must not include Estonian if unsigned", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				phase: "parliament",
				parliament_token: Crypto.randomBytes(12),
				language: "en"
			}))

			var estonian = yield textsDb.create(new ValidText({
				initiative_uuid: initiative.uuid,
				user_id: initiative.user_id,
				language: "et"
			}))

			yield textSignaturesDb.create(new ValidTextSignature({
				text_id: estonian.id,
				signed: true,
				timestamped: false
			}))

			var path = `/initiatives/${initiative.uuid}/signatures.asice`
			path += "?parliament-token=" + initiative.parliament_token.toString("hex")
			var res = yield this.request(path)

			res.statusCode.must.equal(200)
			res.headers["content-type"].must.equal(ASICE_TYPE)
			var zip = yield Zip.parse(Buffer.from(res.body))
			var entries = yield Zip.parseEntries(zip)
			Object.keys(entries).length.must.equal(3)
		})

		it("must include latest Estonian translation", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				phase: "parliament",
				parliament_token: Crypto.randomBytes(12),
				language: "en"
			}))

			yield textsDb.create(new ValidText({
				initiative_uuid: initiative.uuid,
				user_id: initiative.user_id,
				language: "et"
			}))

			var a = yield textsDb.create(new ValidText({
				initiative_uuid: initiative.uuid,
				user_id: initiative.user_id,
				language: "et"
			}))

			yield textSignaturesDb.create(new ValidTextSignature({
				text_id: a.id,
				signed: true,
				timestamped: true
			}))

			var b = yield textsDb.create(new ValidText({
				initiative_uuid: initiative.uuid,
				user_id: initiative.user_id,
				language: "et"
			}))

			yield textSignaturesDb.create(new ValidTextSignature({
				text_id: b.id,
				signed: true,
				timestamped: true
			}))

			yield textsDb.create(new ValidText({
				initiative_uuid: initiative.uuid,
				user_id: initiative.user_id,
				language: "et"
			}))

			var path = `/initiatives/${initiative.uuid}/signatures.asice`
			path += "?parliament-token=" + initiative.parliament_token.toString("hex")
			var res = yield this.request(path)

			res.statusCode.must.equal(200)
			res.headers["content-type"].must.equal(ASICE_TYPE)
			var zip = yield Zip.parse(Buffer.from(res.body))
			var entries = yield Zip.parseEntries(zip)
			Object.keys(entries).length.must.equal(4)

			var translation = yield Zip.readEntry(zip, entries["estonian.html"])
			String(translation).must.equal(Initiative.renderForParliament(b))
		})
	})

	describe(`GET / for ${CSV_TYPE}`, function() {
		beforeEach(function*() {
			this.author = yield usersDb.create(new ValidUser)
		})

		mustRespondWithSignatures(function(url) {
			return this.request(url.replace(/\.asice/, ".csv"))
		})

		it("must respond with CSV of signatures given parliament token",
			function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				phase: "parliament",
				parliament_token: Crypto.randomBytes(12)
			}))

			var signatures = _.sortBy(yield signaturesDb.create([
				new ValidSignature({initiative_uuid: initiative.uuid}),
				new ValidSignature({initiative_uuid: initiative.uuid}),
				new ValidSignature({initiative_uuid: initiative.uuid})
			]), "personal_id")

			var path = `/initiatives/${initiative.uuid}/signatures.csv`
			path += "?parliament-token=" + initiative.parliament_token.toString("hex")
			var res = yield this.request(path)

			res.statusCode.must.equal(200)
			res.headers["content-type"].must.equal(CSV_TYPE)
			res.headers["content-disposition"].must.equal(
				"attachment; filename=\"signatures.csv\""
			)

			res.body.must.equal(
				"personal_id\n" +
				signatures.map((sig) => sig.personal_id + "\n").join("")
			)
		})

		it("must respond if no signatures", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				phase: "parliament",
				parliament_token: Crypto.randomBytes(12)
			}))

			var path = `/initiatives/${initiative.uuid}/signatures.csv`
			path += "?parliament-token=" + initiative.parliament_token.toString("hex")
			var res = yield this.request(path)

			res.statusCode.must.equal(200)
			res.headers["content-type"].must.equal(CSV_TYPE)
			res.body.must.equal("personal_id\n")
		})

		it("must not respond with signatures of other initiatives", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				phase: "parliament",
				parliament_token: Crypto.randomBytes(12)
			}))

			var other = yield initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				phase: "parliament"
			}))

			yield signaturesDb.create(new ValidSignature({
				initiative_uuid: other.uuid
			}))

			var path = `/initiatives/${initiative.uuid}/signatures.csv`
			path += "?parliament-token=" + initiative.parliament_token.toString("hex")
			var res = yield this.request(path)

			res.statusCode.must.equal(200)
			res.headers["content-type"].must.equal(CSV_TYPE)
			res.body.must.equal("personal_id\n")
		})
	})

	describe(`GET /?type=citizenos for ${ZIP_TYPE}`, function() {
		beforeEach(function*() {
			this.author = yield usersDb.create(new ValidUser)
		})

		mustRespondWithSignatures(function(url) {
			url += (url.indexOf("?") >= 0 ? "&" : "?") + "type=citizenos"
			return this.request(url)
		})

		it("must respond with signaturez in Zip given parliament token",
			function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				phase: "parliament",
				parliament_token: Crypto.randomBytes(12)
			}))

			var aAsic = new Asic
			aAsic.add("initiative.html", initiative.text)
			aAsic.end()
			aAsic = yield aAsic.toBuffer()

			var bAsic = new Asic
			bAsic.add("initiative.html", initiative.text)
			bAsic.end()
			bAsic = yield bAsic.toBuffer()

			var signatures = _.sortBy(yield citizenosSignaturesDb.create([
				new ValidCitizenosSignature({
					initiative_uuid: initiative.uuid,
					asic: aAsic
				}),

				new ValidCitizenosSignature({
					initiative_uuid: initiative.uuid,
					asic: bAsic
				})
			]), "personal_id")

			var path = `/initiatives/${initiative.uuid}/signatures.zip?type=citizenos`
			path += "&parliament-token=" + initiative.parliament_token.toString("hex")
			var res = yield this.request(path)

			res.statusCode.must.equal(200)
			res.headers["content-type"].must.equal(ZIP_TYPE)
			res.headers["content-disposition"].must.equal(
				"attachment; filename=\"citizenos-signatures.zip\""
			)

			var zip = yield Zip.parse(Buffer.from(res.body))
			var entries = yield Zip.parseEntries(zip)
			Object.keys(entries).length.must.equal(2)

			yield Promise.all([
				Zip.readEntry(zip, entries[nameSignatureFile(signatures[0])]),
				Zip.readEntry(zip, entries[nameSignatureFile(signatures[1])]),
			]).must.then.eql(yield [aAsic, bAsic])

			function nameSignatureFile(signature) {
				return signature.country + signature.personal_id + ".asice"
			}
		})

		it("must respond if no signatures", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				phase: "parliament",
				parliament_token: Crypto.randomBytes(12)
			}))

			var path = `/initiatives/${initiative.uuid}/signatures.zip?type=citizenos`
			path += "&parliament-token=" + initiative.parliament_token.toString("hex")
			var res = yield this.request(path)

			res.statusCode.must.equal(200)
			res.headers["content-type"].must.equal(ZIP_TYPE)
			var zip = yield Zip.parse(Buffer.from(res.body))
			yield Zip.parseEntries(zip).must.then.be.empty()
		})

		it("must not include signatuers from other initiatives", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				phase: "parliament",
				parliament_token: Crypto.randomBytes(12)
			}))

			var other = yield initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				phase: "parliament"
			}))

			var asic = new Asic
			asic.add("initiative.html", other.text)
			asic.end()
			asic = yield asic.toBuffer()

			yield citizenosSignaturesDb.create(new ValidCitizenosSignature({
				initiative_uuid: other.uuid,
				asic: asic
			}))

			var path = `/initiatives/${initiative.uuid}/signatures.zip?type=citizenos`
			path += "&parliament-token=" + initiative.parliament_token.toString("hex")
			var res = yield this.request(path)

			res.statusCode.must.equal(200)
			res.headers["content-type"].must.equal(ZIP_TYPE)
			var zip = yield Zip.parse(Buffer.from(res.body))
			yield Zip.parseEntries(zip).must.then.be.empty()
		})

		it("must not respond with deleted signatures", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				phase: "parliament",
				parliament_token: Crypto.randomBytes(12)
			}))

			_.sortBy(yield citizenosSignaturesDb.create([
				new ValidCitizenosSignature({
					initiative_uuid: initiative.uuid,
					asic: null
				})
			]), "personal_id")

			var path = `/initiatives/${initiative.uuid}/signatures.zip?type=citizenos`
			path += "&parliament-token=" + initiative.parliament_token.toString("hex")
			var res = yield this.request(path)

			res.statusCode.must.equal(200)
			res.headers["content-type"].must.equal(ZIP_TYPE)
			var zip = yield Zip.parse(Buffer.from(res.body))
			yield Zip.parseEntries(zip).must.then.be.empty()
		})
	})

	describe("POST /", function() {
		require("root/test/time")(TODAY)

		beforeEach(function*() {
			this.author = yield usersDb.create(new ValidUser)

			this.initiative = yield initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				phase: "sign",
				signing_ends_at: DateFns.addDays(new Date, 1)
			}))
		})

		function mustSign(sign, certificate) {
			describe("as signable", function() {
				it("must create a signature given a non-ETSI semantic personal id",
					function*() {
					var cert = new Certificate(newCertificate({
						subject: {
							countryName: "EE",
							organizationName: "ESTEID",
							organizationalUnitName: "digital signature",
							commonName: `SMITH,JOHN,${ADULT_PERSONAL_ID}`,
							surname: "SMITH",
							givenName: "JOHN",
							serialNumber: ADULT_PERSONAL_ID
						},

						issuer: VALID_ISSUERS[0],
						publicKey: JOHN_RSA_KEYS.publicKey
					}))

					var res = yield sign(
						this.router,
						this.request,
						this.initiative,
						cert
					)

					res.statusCode.must.equal(204)

					var signature = yield signaturesDb.read(sql`
						SELECT * FROM initiative_signatures
					`)

					signature.country.must.equal("EE")
					signature.personal_id.must.equal(ADULT_PERSONAL_ID)
				})

				VALID_ISSUERS.forEach(function(issuer) {
					var issuerName = _.merge({}, ...issuer.subject).commonName

					it(`must create signature given certificate issued by ${issuerName}`,
						function*() {
						var cert = new Certificate(newCertificate({
							subject: {
								countryName: "EE",
								organizationName: "ESTEID",
								organizationalUnitName: "digital signature",
								commonName: `SMITH,JOHN,${ADULT_PERSONAL_ID}`,
								surname: "SMITH",
								givenName: "JOHN",
								serialNumber: `PNOEE-${ADULT_PERSONAL_ID}`
							},

							issuer: issuer,
							publicKey: JOHN_RSA_KEYS.publicKey
						}))

						var res = yield sign(
							this.router,
							this.request,
							this.initiative,
							cert
						)

						res.statusCode.must.equal(204)

						yield signaturesDb.search(sql`
							SELECT * FROM initiative_signatures
						`).must.then.not.be.empty()
					})
				})

				it("must thank after signing", function*() {
					var signed = yield sign(
						this.router,
						this.request,
						this.initiative,
						certificate
					)

					signed.statusCode.must.equal(204)

					var cookies = Http.parseCookies(signed.headers["set-cookie"])
					var res = yield this.request(signed.headers.location, {
						headers: {Cookie: Http.serializeCookies(cookies)}
					})

					res.statusCode.must.equal(200)
					res.body.must.include(t("THANKS_FOR_SIGNING"))
					res.body.must.not.include(t("THANKS_FOR_SIGNING_AGAIN"))
					res.body.must.include(t("REVOKE_SIGNATURE"))
					res.body.must.include("donate-form")
				})

				it("must create a signature and thank after signing again",
					function*() {
					var oldSignature = yield signaturesDb.create(new ValidSignature({
						initiative_uuid: this.initiative.uuid,
						country: "EE",
						personal_id: ADULT_PERSONAL_ID
					}))

					var signed = yield sign(
						this.router,
						this.request,
						this.initiative,
						certificate
					)

					signed.statusCode.must.equal(204)

					var cookies = Http.parseCookies(signed.headers["set-cookie"])
					var res = yield this.request(signed.headers.location, {
						headers: {Cookie: Http.serializeCookies(cookies)}
					})

					res.statusCode.must.equal(200)
					res.body.must.include(t("THANKS_FOR_SIGNING"))
					res.body.must.include(t("THANKS_FOR_SIGNING_AGAIN"))
					res.body.must.include(t("REVOKE_SIGNATURE"))
					res.body.must.include("donate-form")

					yield signaturesDb.search(sql`
						SELECT * FROM initiative_signatures
					`).must.then.not.eql([oldSignature])
				})

				it("must create a signature and thank after oversigning a CitizenOS signature", function*() {
					yield citizenosSignaturesDb.create(
						new ValidCitizenosSignature({
							initiative_uuid: this.initiative.uuid,
							country: "EE",
							personal_id: ADULT_PERSONAL_ID
						})
					)

					var signed = yield sign(
						this.router,
						this.request,
						this.initiative,
						certificate
					)

					signed.statusCode.must.equal(204)

					var cookies = Http.parseCookies(signed.headers["set-cookie"])
					var res = yield this.request(signed.headers.location, {
						headers: {Cookie: Http.serializeCookies(cookies)}
					})

					res.statusCode.must.equal(200)
					res.body.must.include(t("THANKS_FOR_SIGNING"))
					res.body.must.include(t("THANKS_FOR_SIGNING_AGAIN"))
					res.body.must.include(t("REVOKE_SIGNATURE"))
					res.body.must.include("donate-form")

					yield citizenosSignaturesDb.search(sql`
						SELECT * FROM initiative_citizenos_signatures
					`).must.then.be.empty()

					yield signaturesDb.search(sql`
						SELECT * FROM initiative_signatures
					`).must.then.not.be.empty()
				})

				it("must create a signature and thank after signing if previously hidden", function*() {
					var oldSignature = yield signaturesDb.create(new ValidSignature({
						initiative_uuid: this.initiative.uuid,
						country: "EE",
						personal_id: ADULT_PERSONAL_ID,
						hidden: true,

						xades: hades.new(MOBILE_ID_CERTIFICATE, [{
							path: this.initiative.text,
							type: this.initiative.text_type,
							hash: this.initiative.text_sha256
						}])
					}))

					var signed = yield sign(
						this.router,
						this.request,
						this.initiative,
						certificate
					)

					signed.statusCode.must.equal(204)

					var cookies = Http.parseCookies(signed.headers["set-cookie"])
					var res = yield this.request(signed.headers.location, {
						headers: {Cookie: Http.serializeCookies(cookies)}
					})

					res.statusCode.must.equal(200)
					res.body.must.include(t("THANKS_FOR_SIGNING"))
					res.body.must.not.include(t("THANKS_FOR_SIGNING_AGAIN"))
					res.body.must.include(t("REVOKE_SIGNATURE"))
					res.body.must.include("donate-form")

					var signatures = yield signaturesDb.search(sql`
						SELECT * FROM initiative_signatures
					`)

					signatures.length.must.equal(1)
					signatures[0].must.not.eql([oldSignature])
					signatures[0].hidden.must.be.false()
				})

				it("must not affect signature on another initiative", function*() {
					var otherInitiative = yield initiativesDb.create(
						new ValidInitiative({user_id: this.author.id, phase: "sign"})
					)

					var signature = yield signaturesDb.create(new ValidSignature({
						initiative_uuid: otherInitiative.uuid,
						country: "EE",
						personal_id: ADULT_PERSONAL_ID
					}))

					var signed = yield sign(
						this.router,
						this.request,
						this.initiative,
						certificate
					)

					signed.statusCode.must.equal(204)

					var cookies = Http.parseCookies(signed.headers["set-cookie"])
					var res = yield this.request(signed.headers.location, {
						headers: {Cookie: Http.serializeCookies(cookies)}
					})

					res.statusCode.must.equal(200)
					res.body.must.include(t("THANKS_FOR_SIGNING"))
					res.body.must.not.include(t("THANKS_FOR_SIGNING_AGAIN"))

					var signatures = yield signaturesDb.search(sql`
						SELECT * FROM initiative_signatures
						ORDER BY updated_at
					`)

					signatures.length.must.equal(2)
					signatures[0].must.eql(signature)
				})

				it("must not affect CitizenOS signature on another initiative",
					function*() {
					var otherInitiative = yield initiativesDb.create(
						new ValidInitiative({user_id: this.author.id, phase: "sign"})
					)

					var signature = yield citizenosSignaturesDb.create(
						new ValidCitizenosSignature({
							initiative_uuid: otherInitiative.uuid,
							country: "EE",
							personal_id: ADULT_PERSONAL_ID
						})
					)

					var signed = yield sign(
						this.router,
						this.request,
						this.initiative,
						certificate
					)

					signed.statusCode.must.equal(204)

					var cookies = Http.parseCookies(signed.headers["set-cookie"])
					var res = yield this.request(signed.headers.location, {
						headers: {Cookie: Http.serializeCookies(cookies)}
					})

					res.statusCode.must.equal(200)
					res.body.must.include(t("THANKS_FOR_SIGNING"))
					res.body.must.not.include(t("THANKS_FOR_SIGNING_AGAIN"))

					yield citizenosSignaturesDb.search(sql`
						SELECT * FROM initiative_citizenos_signatures
					`).must.then.eql([signature])

					yield signaturesDb.search(sql`
						SELECT * FROM initiative_signatures
						ORDER BY created_at
					`).must.then.not.be.empty()
				})

				it("must not affect signature of another user", function*() {
					var signature = yield signaturesDb.create(new ValidSignature({
						initiative_uuid: this.initiative.uuid,
						country: "EE",
						personal_id: "70001019906"
					}))

					var signed = yield sign(
						this.router,
						this.request,
						this.initiative,
						certificate
					)

					signed.statusCode.must.equal(204)

					var cookies = Http.parseCookies(signed.headers["set-cookie"])
					var res = yield this.request(signed.headers.location, {
						headers: {Cookie: Http.serializeCookies(cookies)}
					})

					res.statusCode.must.equal(200)
					res.body.must.include(t("THANKS_FOR_SIGNING"))
					res.body.must.not.include(t("THANKS_FOR_SIGNING_AGAIN"))

					var signatures = yield signaturesDb.search(sql`
						SELECT * FROM initiative_signatures
						ORDER BY created_at
					`)

					signatures.length.must.equal(2)
					signatures[0].must.eql(signature)
				})

				it("must not affect CitizenOS signature of another user", function*() {
					var signature = yield citizenosSignaturesDb.create(
						new ValidCitizenosSignature({
							initiative_uuid: this.initiative.uuid,
							country: "EE",
							personal_id: "70001019906"
						})
					)

					var signed = yield sign(
						this.router,
						this.request,
						this.initiative,
						certificate
					)

					signed.statusCode.must.equal(204)

					var cookies = Http.parseCookies(signed.headers["set-cookie"])
					var res = yield this.request(signed.headers.location, {
						headers: {Cookie: Http.serializeCookies(cookies)}
					})

					res.statusCode.must.equal(200)
					res.body.must.include(t("THANKS_FOR_SIGNING"))
					res.body.must.not.include(t("THANKS_FOR_SIGNING_AGAIN"))

					yield citizenosSignaturesDb.search(sql`
						SELECT * FROM initiative_citizenos_signatures
					`).must.then.eql([signature])

					yield signaturesDb.search(sql`
						SELECT * FROM initiative_signatures
						ORDER BY created_at
					`).must.then.not.be.empty()
				})

				it("must not affect signature of another country", function*() {
					var signature = yield signaturesDb.create(new ValidSignature({
						initiative_uuid: this.initiative.uuid,
						country: "LT",
						personal_id: ADULT_PERSONAL_ID
					}))

					var signed = yield sign(
						this.router,
						this.request,
						this.initiative,
						certificate
					)

					signed.statusCode.must.equal(204)

					var cookies = Http.parseCookies(signed.headers["set-cookie"])
					var res = yield this.request(signed.headers.location, {
						headers: {Cookie: Http.serializeCookies(cookies)}
					})

					res.statusCode.must.equal(200)
					res.body.must.include(t("THANKS_FOR_SIGNING"))
					res.body.must.not.include(t("THANKS_FOR_SIGNING_AGAIN"))

					var signatures = yield signaturesDb.search(sql`
						SELECT * FROM initiative_signatures
						ORDER BY created_at
					`)

					signatures.length.must.equal(2)
					signatures[0].must.eql(signature)
				})

				it("must not affect CitizenOS signature of another country",
					function*() {
					var signature = yield citizenosSignaturesDb.create(
						new ValidCitizenosSignature({
							initiative_uuid: this.initiative.uuid,
							country: "LT",
							personal_id: ADULT_PERSONAL_ID
						})
					)

					var signed = yield sign(
						this.router,
						this.request,
						this.initiative,
						certificate
					)

					signed.statusCode.must.equal(204)

					var cookies = Http.parseCookies(signed.headers["set-cookie"])
					var res = yield this.request(signed.headers.location, {
						headers: {Cookie: Http.serializeCookies(cookies)}
					})

					res.statusCode.must.equal(200)
					res.body.must.include(t("THANKS_FOR_SIGNING"))
					res.body.must.not.include(t("THANKS_FOR_SIGNING_AGAIN"))

					yield citizenosSignaturesDb.search(sql`
						SELECT * FROM initiative_citizenos_signatures
					`).must.then.eql([signature])

					yield signaturesDb.search(sql`
						SELECT * FROM initiative_signatures
						ORDER BY created_at
					`).must.then.not.be.empty()
				})
			})
		}

		describe("when signing via Id-Card", function() {
			mustSign(signWithIdCard, ID_CARD_CERTIFICATE)

			it("must create a signature", function*() {
				var cert = new Certificate(newCertificate({
					subject: {
						countryName: "EE",
						organizationName: "ESTEID",
						organizationalUnitName: "digital signature",
						commonName: `SMITH,JOHN,${ADULT_PERSONAL_ID}`,
						surname: "SMITH",
						givenName: "JOHN",
						serialNumber: `PNOEE-${ADULT_PERSONAL_ID}`
					},

					issuer: VALID_ISSUERS[0],
					publicKey: JOHN_RSA_KEYS.publicKey
				}))

				var path = `/initiatives/${this.initiative.uuid}`
				var signing = yield this.request(path + "/signatures", {
					method: "POST",

					headers: {
						Accept: SIGNABLE_TYPE,
						"Content-Type": CERTIFICATE_TYPE,
						"X-Forwarded-For": LONDON_FORWARDED_FOR
					},

					body: cert.toBuffer()
				})

				signing.statusCode.must.equal(202)
				signing.headers["content-type"].must.equal(SIGNABLE_TYPE)

				var xades = hades.new(cert, [{
					path: "initiative.html",
					type: "text/html",
					hash: this.initiative.text_sha256
				}], {policy: "bdoc"})

				signing.body.must.eql(xades.signableHash)

				var signables = yield signablesDb.search(sql`
					SELECT * FROM initiative_signables
				`)

				signables.length.must.equal(1)
				signables[0].initiative_uuid.must.equal(this.initiative.uuid)
				signables[0].country.must.equal("EE")
				signables[0].personal_id.must.equal(ADULT_PERSONAL_ID)
				signables[0].method.must.equal("id-card")
				signables[0].xades.toString().must.equal(String(xades))
				signables[0].signed.must.be.false()
				signables[0].timestamped.must.be.false()
				signables[0].created_from.must.eql(LONDON_GEO)
				demand(signables[0].error).be.null()

				yield signaturesDb.search(sql`
					SELECT * FROM initiative_signatures
				`).must.then.be.empty()

				var signatureBytes = signWithRsa(
					JOHN_RSA_KEYS.privateKey,
					xades.signable
				)

				xades.setSignature(signatureBytes)
				var ocspResponse = Ocsp.parse(newOcspResponse(cert))
				xades.setOcspResponse(ocspResponse)

				this.router.post(TIMEMARK_URL.path, function(req, res) {
					req.headers.host.must.equal(TIMEMARK_URL.host)
					res.setHeader("Content-Type", "application/ocsp-response")
					res.end(ocspResponse.toBuffer())
				})

				var signed = yield this.request(signing.headers.location, {
					method: "PUT",

					headers: {
						Accept: `application/x-empty, ${ERR_TYPE}`,
						"Content-Type": SIGNATURE_TYPE
					},

					body: signatureBytes
				})

				signed.statusCode.must.equal(204)
				signed.headers.location.must.equal(path)

				yield signaturesDb.search(sql`
					SELECT * FROM initiative_signatures
				`).must.then.eql([new ValidSignature({
					initiative_uuid: this.initiative.uuid,
					token: signables[0].token,
					country: "EE",
					personal_id: ADULT_PERSONAL_ID,
					method: "id-card",
					xades: String(xades),
					created_from: LONDON_GEO
				})])
			})

			it("must respond with 422 given certificate from untrusted issuer",
				function*() {
				var issuer = tsl.getBySubjectName([
					"C=EE",
					"O=AS Sertifitseerimiskeskus",
					"OU=Sertifitseerimisteenused",
					"CN=EID-SK 2007",
				].join(","))

				var cert = new Certificate(newCertificate({
					subject: {
						countryName: "EE",
						organizationName: "ESTEID",
						organizationalUnitName: "digital signature",
						commonName: `SMITH,JOHN,${ADULT_PERSONAL_ID}`,
						surname: "SMITH",
						givenName: "JOHN",
						serialNumber: `PNOEE-${ADULT_PERSONAL_ID}`
					},

					issuer: issuer,
					publicKey: JOHN_RSA_KEYS.publicKey
				}))

				var initiativePath = `/initiatives/${this.initiative.uuid}`
				var res = yield this.request(`${initiativePath}/signatures`, {
					method: "POST",

					headers: {
						Accept: `${SIGNABLE_TYPE}, ${ERR_TYPE}`,
						"Content-Type": CERTIFICATE_TYPE
					},

					body: cert.toBuffer()
				})

				res.statusCode.must.equal(422)
				res.statusMessage.must.equal("Invalid Issuer")
				res.headers["content-type"].must.equal(ERR_TYPE)

				res.body.must.eql({
					code: 422,
					message: "Invalid Issuer",
					name: "HttpError",
					description: t("INVALID_CERTIFICATE_ISSUER")
				})
			})

			it("must respond with 422 given future certificate", function*() {
				var cert = new Certificate(newCertificate({
					subject: {
						countryName: "EE",
						organizationName: "ESTEID",
						organizationalUnitName: "digital signature",
						commonName: `SMITH,JOHN,${ADULT_PERSONAL_ID}`,
						surname: "SMITH",
						givenName: "JOHN",
						serialNumber: `PNOEE-${ADULT_PERSONAL_ID}`
					},

					validFrom: DateFns.addSeconds(new Date, 1),
					issuer: VALID_ISSUERS[0],
					publicKey: JOHN_RSA_KEYS.publicKey
				}))

				var initiativePath = `/initiatives/${this.initiative.uuid}`
				var res = yield this.request(`${initiativePath}/signatures`, {
					method: "POST",

					headers: {
						Accept: `${SIGNABLE_TYPE}, ${ERR_TYPE}`,
						"Content-Type": CERTIFICATE_TYPE
					},

					body: cert.toBuffer()
				})

				res.statusCode.must.equal(422)
				res.statusMessage.must.equal("Certificate Not Yet Valid")
				res.headers["content-type"].must.equal(ERR_TYPE)

				res.body.must.eql({
					code: 422,
					message: "Certificate Not Yet Valid",
					name: "HttpError",
					description: t("CERTIFICATE_NOT_YET_VALID")
				})
			})

			it("must respond with 422 given past certificate", function*() {
				var cert = new Certificate(newCertificate({
					subject: {
						countryName: "EE",
						organizationName: "ESTEID",
						organizationalUnitName: "digital signature",
						commonName: `SMITH,JOHN,${ADULT_PERSONAL_ID}`,
						surname: "SMITH",
						givenName: "JOHN",
						serialNumber: `PNOEE-${ADULT_PERSONAL_ID}`
					},

					validUntil: new Date,
					issuer: VALID_ISSUERS[0],
					publicKey: JOHN_RSA_KEYS.publicKey
				}))

				var initiativePath = `/initiatives/${this.initiative.uuid}`
				var res = yield this.request(`${initiativePath}/signatures`, {
					method: "POST",

					headers: {
						Accept: `${SIGNABLE_TYPE}, ${ERR_TYPE}`,
						"Content-Type": CERTIFICATE_TYPE
					},

					body: cert.toBuffer()
				})

				res.statusCode.must.equal(422)
				res.statusMessage.must.equal("Certificate Expired")
				res.headers["content-type"].must.equal(ERR_TYPE)

				res.body.must.eql({
					code: 422,
					message: "Certificate Expired",
					name: "HttpError",
					description: t("CERTIFICATE_EXPIRED")
				})
			})

			it("must respond with 422 given underage signer", function*() {
				var cert = new Certificate(newCertificate({
					subject: {
						countryName: "EE",
						organizationName: "ESTEID",
						organizationalUnitName: "digital signature",
						commonName: `SMITH,JOHN,${CHILD_PERSONAL_ID}`,
						surname: "SMITH",
						givenName: "JOHN",
						serialNumber: `PNOEE-${CHILD_PERSONAL_ID}`
					},

					issuer: VALID_ISSUERS[0],
					publicKey: JOHN_RSA_KEYS.publicKey
				}))

				var initiativePath = `/initiatives/${this.initiative.uuid}`
				var res = yield this.request(`${initiativePath}/signatures`, {
					method: "POST",

					headers: {
						Accept: `${SIGNABLE_TYPE}, ${ERR_TYPE}`,
						"Content-Type": CERTIFICATE_TYPE
					},

					body: cert.toBuffer()
				})

				res.statusCode.must.equal(422)
				res.statusMessage.must.equal("Too Young")
				res.headers["content-type"].must.equal(ERR_TYPE)

				res.body.must.eql({
					code: 422,
					message: "Too Young",
					name: "HttpError",
					description: t("SIGN_ERROR_TOO_YOUNG")
				})
			})

			_.each({
				RSA: [JOHN_RSA_KEYS, signWithRsa],
				ECDSA: [JOHN_ECDSA_KEYS, signWithEcdsa]
			}, function([keys, sign], algo) {
				it(`must create a signature given an ${algo} signature`, function*() {
					var cert = new Certificate(newCertificate({
						subject: {
							countryName: "EE",
							organizationName: "ESTEID",
							organizationalUnitName: "digital signature",
							commonName: `SMITH,JOHN,${ADULT_PERSONAL_ID}`,
							surname: "SMITH",
							givenName: "JOHN",
							serialNumber: `PNOEE-${ADULT_PERSONAL_ID}`
						},

						issuer: VALID_ISSUERS[0],
						publicKey: keys.publicKey
					}))

					var initiativePath = `/initiatives/${this.initiative.uuid}`
					var signing = yield this.request(`${initiativePath}/signatures`, {
						method: "POST",

						headers: {
							Accept: SIGNABLE_TYPE,
							"Content-Type": CERTIFICATE_TYPE
						},

						body: cert.toBuffer()
					})

					signing.statusCode.must.equal(202)

					var xades = yield signablesDb.read(sql`
						SELECT * FROM initiative_signables
						ORDER BY created_at DESC
						LIMIT 1
					`).then((row) => row.xades)

					this.router.post(TIMEMARK_URL.path, function(req, res) {
						req.headers.host.must.equal(TIMEMARK_URL.host)
						res.setHeader("Content-Type", "application/ocsp-response")
						res.end(Ocsp.parse(newOcspResponse(cert)).toBuffer())
					})

					var signed = yield this.request(signing.headers.location, {
						method: "PUT",

						headers: {
							Accept: `application/x-empty, ${ERR_TYPE}`,
							"Content-Type": SIGNATURE_TYPE
						},

						body: sign(keys.privateKey, xades.signable)
					})

					signed.statusCode.must.equal(204)
				})

				it(`must respond with 409 given an invalid ${algo} signature`,
					function*() {
					var cert = new Certificate(newCertificate({
						subject: {
							countryName: "EE",
							organizationName: "ESTEID",
							organizationalUnitName: "digital signature",
							commonName: `SMITH,JOHN,${ADULT_PERSONAL_ID}`,
							surname: "SMITH",
							givenName: "JOHN",
							serialNumber: `PNOEE-${ADULT_PERSONAL_ID}`
						},

						issuer: VALID_ISSUERS[0],
						publicKey: keys.publicKey
					}))

					var initiativePath = `/initiatives/${this.initiative.uuid}`
					var signing = yield this.request(`${initiativePath}/signatures`, {
						method: "POST",

						headers: {
							Accept: SIGNABLE_TYPE,
							"Content-Type": CERTIFICATE_TYPE
						},

						body: cert.toBuffer()
					})

					signing.statusCode.must.equal(202)

					var res = yield this.request(signing.headers.location, {
						method: "PUT",

						headers: {
							Accept: `application/x-empty, ${ERR_TYPE}`,
							"Content-Type": SIGNATURE_TYPE
						},

						body: Crypto.randomBytes(64)
					})

					res.statusCode.must.equal(409)
					res.statusMessage.must.equal("Invalid Signature")
					res.headers["content-type"].must.equal(ERR_TYPE)

					res.body.must.eql({
						code: 409,
						message: "Invalid Signature",
						name: "HttpError"
					})

					yield signaturesDb.search(sql`
						SELECT * FROM initiative_signatures
					`).must.then.be.empty()
				})
			})
		})

		describe("when signing via Mobile-Id", function() {
			mustSign(signWithMobileId, MOBILE_ID_CERTIFICATE)

			it("must create a signature", function*() {
				var cert = new Certificate(newCertificate({
					subject: {
						countryName: "EE",
						organizationName: "ESTEID (MOBIIL-ID)",
						organizationalUnitName: "digital signature",
						commonName: `SMITH,JOHN,${ADULT_PERSONAL_ID}`,
						surname: "SMITH",
						givenName: "JOHN",
						serialNumber: `PNOEE-${ADULT_PERSONAL_ID}`
					},

					issuer: VALID_ISSUERS[0],
					publicKey: JOHN_RSA_KEYS.publicKey
				}))

				var [xades, ocspResponse] = newXades(this.initiative, cert)

				this.router.post(`${MOBILE_ID_URL.path}certificate`,
					function(req, res) {
					req.headers.host.must.equal(MOBILE_ID_URL.host)

					req.body.relyingPartyName.must.equal(Config.mobileIdUser)
					req.body.relyingPartyUUID.must.equal(Config.mobileIdPassword)
					req.body.phoneNumber.must.equal("+37200000766")
					req.body.nationalIdentityNumber.must.equal(ADULT_PERSONAL_ID)

					respond({result: "OK", cert: cert.toString("base64")}, req, res)
				})

				this.router.post(`${MOBILE_ID_URL.path}signature`,
					function(req, res) {
					req.headers.host.must.equal(MOBILE_ID_URL.host)

					req.body.relyingPartyName.must.equal(Config.mobileIdUser)
					req.body.relyingPartyUUID.must.equal(Config.mobileIdPassword)
					req.body.phoneNumber.must.equal("+37200000766")
					req.body.nationalIdentityNumber.must.equal(ADULT_PERSONAL_ID)
					req.body.hashType.must.equal("SHA256")
					req.body.hash.must.equal(xades.signableHash.toString("base64"))
					req.body.language.must.equal("EST")

					respond({sessionID: SESSION_ID}, req, res)
				})

				this.router.get(`${MOBILE_ID_URL.path}signature/session/:token`,
					function(req, res) {
					req.headers.host.must.equal(MOBILE_ID_URL.host)
					req.params.token.must.equal(SESSION_ID)

					respond({
						state: "COMPLETE",
						result: "OK",

						signature: {
							algorithm: "sha256WithRSAEncryption",
							value: xades.signature.toString("base64")
						}
					}, req, res)
				})

				this.router.post(TIMEMARK_URL.path, function(req, res) {
					req.headers.host.must.equal(TIMEMARK_URL.host)
					res.setHeader("Content-Type", "application/ocsp-response")
					res.flushHeaders()

					// NOTE: Respond with a little delay to ensure signature
					// polling later works as expected.
					setTimeout(() => res.end(ocspResponse.toBuffer()), 100)
				})

				var initiativePath = `/initiatives/${this.initiative.uuid}`
				var signing = yield this.request(initiativePath + "/signatures", {
					method: "POST",
					headers: {"X-Forwarded-For": LONDON_FORWARDED_FOR},

					form: {
						method: "mobile-id",
						personalId: ADULT_PERSONAL_ID,
						phoneNumber: "+37200000766"
					}
				})

				signing.statusCode.must.equal(202)

				var signed = yield this.request(signing.headers.location, {
					headers: {Accept: `application/x-empty, ${ERR_TYPE}`}
				})

				signed.statusCode.must.equal(204)
				signed.headers.location.must.equal(initiativePath)

				var signables = yield signablesDb.search(sql`
					SELECT * FROM initiative_signables
				`)

				signables.length.must.equal(1)
				signables[0].initiative_uuid.must.equal(this.initiative.uuid)
				signables[0].country.must.equal("EE")
				signables[0].personal_id.must.equal(ADULT_PERSONAL_ID)
				signables[0].method.must.equal("mobile-id")
				signables[0].xades.toString().must.equal(String(xades))
				signables[0].signed.must.be.true()
				signables[0].timestamped.must.be.true()
				signables[0].created_from.must.eql(LONDON_GEO)
				demand(signables[0].error).be.null()

				yield signaturesDb.search(sql`
					SELECT * FROM initiative_signatures
				`).must.then.eql([new ValidSignature({
					initiative_uuid: this.initiative.uuid,
					token: signables[0].token,
					country: "EE",
					personal_id: ADULT_PERSONAL_ID,
					method: "mobile-id",
					xades: String(xades),
					created_from: LONDON_GEO
				})])
			})

			it("must respond with 422 given certificate from untrusted issuer",
				function*() {
				var issuer = tsl.getBySubjectName([
					"C=EE",
					"O=AS Sertifitseerimiskeskus",
					"OU=Sertifitseerimisteenused",
					"CN=EID-SK 2007",
				].join(","))

				var cert = new Certificate(newCertificate({
					subject: {
						countryName: "EE",
						organizationName: "ESTEID (MOBIIL-ID)",
						organizationalUnitName: "digital signature",
						commonName: `SMITH,JOHN,${ADULT_PERSONAL_ID}`,
						surname: "SMITH",
						givenName: "JOHN",
						serialNumber: `PNOEE-${ADULT_PERSONAL_ID}`
					},

					issuer: issuer,
					publicKey: JOHN_RSA_KEYS.publicKey
				}))

				this.router.post(
					`${MOBILE_ID_URL.path}certificate`,
					respond.bind(null, {result: "OK", cert: cert.toString("base64")})
				)

				var initiativePath = `/initiatives/${this.initiative.uuid}`
				var res = yield this.request(initiativePath + "/signatures", {
					method: "POST",
					form: {
						method: "mobile-id",
						personalId: ADULT_PERSONAL_ID,
						phoneNumber: "+37200000766"
					}
				})

				res.statusCode.must.equal(422)
				res.statusMessage.must.equal("Invalid Issuer")
				res.headers["content-type"].must.equal("text/html; charset=utf-8")
				res.body.must.include(t("INVALID_CERTIFICATE_ISSUER"))
			})

			it("must respond with 422 given future certificate", function*() {
				var cert = new Certificate(newCertificate({
					subject: {
						countryName: "EE",
						organizationName: "ESTEID (MOBIIL-ID)",
						organizationalUnitName: "digital signature",
						commonName: `SMITH,JOHN,${ADULT_PERSONAL_ID}`,
						surname: "SMITH",
						givenName: "JOHN",
						serialNumber: `PNOEE-${ADULT_PERSONAL_ID}`
					},

					validFrom: DateFns.addSeconds(new Date, 1),
					issuer: VALID_ISSUERS[0],
					publicKey: JOHN_RSA_KEYS.publicKey
				}))

				this.router.post(
					`${MOBILE_ID_URL.path}certificate`,
					respond.bind(null, {result: "OK", cert: cert.toString("base64")})
				)

				var initiativePath = `/initiatives/${this.initiative.uuid}`
				var res = yield this.request(initiativePath + "/signatures", {
					method: "POST",
					form: {
						method: "mobile-id",
						personalId: ADULT_PERSONAL_ID,
						phoneNumber: "+37200000766"
					}
				})

				res.statusCode.must.equal(422)
				res.statusMessage.must.equal("Certificate Not Yet Valid")
				res.headers["content-type"].must.equal("text/html; charset=utf-8")
				res.body.must.include(t("CERTIFICATE_NOT_YET_VALID"))
			})

			it("must respond with 422 given past certificate", function*() {
				var cert = new Certificate(newCertificate({
					subject: {
						countryName: "EE",
						organizationName: "ESTEID (MOBIIL-ID)",
						organizationalUnitName: "digital signature",
						commonName: `SMITH,JOHN,${ADULT_PERSONAL_ID}`,
						surname: "SMITH",
						givenName: "JOHN",
						serialNumber: `PNOEE-${ADULT_PERSONAL_ID}`
					},

					validUntil: new Date,
					issuer: VALID_ISSUERS[0],
					publicKey: JOHN_RSA_KEYS.publicKey
				}))

				this.router.post(
					`${MOBILE_ID_URL.path}certificate`,
					respond.bind(null, {result: "OK", cert: cert.toString("base64")})
				)

				var initiativePath = `/initiatives/${this.initiative.uuid}`
				var res = yield this.request(initiativePath + "/signatures", {
					method: "POST",
					form: {
						method: "mobile-id",
						personalId: ADULT_PERSONAL_ID,
						phoneNumber: "+37200000766"
					}
				})

				res.statusCode.must.equal(422)
				res.statusMessage.must.equal("Certificate Expired")
				res.headers["content-type"].must.equal("text/html; charset=utf-8")
				res.body.must.include(t("CERTIFICATE_EXPIRED"))
			})

			it("must respond with 422 given underage signer", function*() {
				var initiativePath = `/initiatives/${this.initiative.uuid}`
				var res = yield this.request(initiativePath + "/signatures", {
					method: "POST",
					form: {
						method: "mobile-id",
						personalId: CHILD_PERSONAL_ID,
						phoneNumber: "+37200000766"
					}
				})

				res.statusCode.must.equal(422)
				res.statusMessage.must.equal("Too Young")
				res.headers["content-type"].must.equal("text/html; charset=utf-8")
				res.body.must.include(t("SIGN_ERROR_TOO_YOUNG"))
			})

			it("must create signature if Mobile-Id session running", function*() {
				var waited = 0
				var signed = yield signWithMobileId(
					this.router,
					this.request,
					this.initiative,
					MOBILE_ID_CERTIFICATE,
					next(function*(req, res) {
						if (waited++ < 2)
							return void respond({state: "RUNNING"}, req, res)

						res.writeHead(200)

						var xades = yield signablesDb.read(sql`
							SELECT * FROM initiative_signables
							ORDER BY created_at DESC
							LIMIT 1
						`).then((row) => row.xades)

						respond({
							state: "COMPLETE",
							result: "OK",

							signature: {
								algorithm: "sha256WithRSAEncryption",
								value: signWithRsa(
									JOHN_RSA_KEYS.privateKey,
									xades.signable
								).toString("base64")
							}
						}, req, res)
					})
				)

				signed.statusCode.must.equal(204)

				yield signaturesDb.search(sql`
					SELECT * FROM initiative_signatures
				`).must.then.not.be.empty()

				var cookies = Http.parseCookies(signed.headers["set-cookie"])
				var res = yield this.request(signed.headers.location, {
					headers: {Cookie: Http.serializeCookies(cookies)}
				})

				res.statusCode.must.equal(200)
				res.body.must.include(t("THANKS_FOR_SIGNING"))
			})

			_.each({
				RSA: [JOHN_RSA_KEYS, signWithRsa],
				ECDSA: [JOHN_ECDSA_KEYS, signWithEcdsa]
			}, function([keys, sign], algo) {
				it(`must create a signature given an ${algo} signature`, function*() {
					var cert = new Certificate(newCertificate({
						subject: {
							countryName: "EE",
							organizationName: "ESTEID (MOBIIL-ID)",
							organizationalUnitName: "digital signature",
							commonName: `SMITH,JOHN,${ADULT_PERSONAL_ID}`,
							surname: "SMITH",
							givenName: "JOHN",
							serialNumber: `PNOEE-${ADULT_PERSONAL_ID}`
						},

						issuer: VALID_ISSUERS[0],
						publicKey: keys.publicKey
					}))

					var signed = yield signWithMobileId(
						this.router,
						this.request,
						this.initiative,
						cert,
						next(function*(req, res) {
							res.writeHead(200)

							var xades = yield signablesDb.read(sql`
								SELECT * FROM initiative_signables
								ORDER BY created_at DESC
								LIMIT 1
							`).then((row) => row.xades)

							respond({
								state: "COMPLETE",
								result: "OK",

								signature: {
									algorithm: "sha256WithRSAEncryption",
									value: sign(
										keys.privateKey,
										xades.signable
									).toString("base64")
								}
							}, req, res)
						})
					)

					signed.statusCode.must.equal(204)

					yield signaturesDb.search(sql`
						SELECT * FROM initiative_signatures
					`).must.then.not.be.empty()
				})

				it(`must respond with error given an invalid ${algo} signature`,
					function*() {
					var cert = new Certificate(newCertificate({
						subject: {
							countryName: "EE",
							organizationName: "ESTEID (MOBIIL-ID)",
							organizationalUnitName: "digital signature",
							commonName: `SMITH,JOHN,${ADULT_PERSONAL_ID}`,
							surname: "SMITH",
							givenName: "JOHN",
							serialNumber: `PNOEE-${ADULT_PERSONAL_ID}`
						},

						issuer: VALID_ISSUERS[0],
						publicKey: keys.publicKey
					}))

					var errored = yield signWithMobileId(
						this.router,
						this.request,
						this.initiative,
						cert,
						respond.bind(null, {
							state: "COMPLETE",
							result: "OK",

							signature: {
								algorithm: "sha256WithRSAEncryption",
								value: Crypto.randomBytes(64).toString("base64")
							}
						})
					)

					errored.statusCode.must.equal(410)
					errored.statusMessage.must.equal("Invalid Mobile-Id Signature")
					var initiativePath = `/initiatives/${this.initiative.uuid}`
					errored.headers.location.must.equal(initiativePath)

					var cookies = Http.parseCookies(errored.headers["set-cookie"])
					var res = yield this.request(errored.headers.location, {
						headers: {Cookie: Http.serializeCookies(cookies)}
					})

					res.statusCode.must.equal(200)
					res.body.must.not.include(t("THANKS_FOR_SIGNING"))
					res.body.must.not.include(t("THANKS_FOR_SIGNING_AGAIN"))
					res.body.must.include(t("MOBILE_ID_ERROR_INVALID_SIGNATURE"))

					yield signaturesDb.search(sql`
						SELECT * FROM initiative_signatures
					`).must.then.be.empty()
				})
			})

			_.each(PHONE_NUMBER_TRANSFORMS, function(long, short) {
				it(`must transform mobile-id number ${short} to ${long}`,
					function*() {
					var created = 0
					this.router.post(`${MOBILE_ID_URL.path}certificate`, (req, res) => {
						++created
						req.body.phoneNumber.must.equal(long)
						req.body.nationalIdentityNumber.must.equal(ADULT_PERSONAL_ID)
						respond({result: "NOT_FOUND"}, req, res)
					})

					var path = `/initiatives/${this.initiative.uuid}`
					var res = yield this.request(path + "/signatures", {
						method: "POST",
						form: {
							method: "mobile-id",
							personalId: ADULT_PERSONAL_ID,
							phoneNumber: short
						}
					})

					created.must.equal(1)
					res.statusCode.must.equal(422)

					res.statusMessage.must.equal(
						"Not a Mobile-Id User or Personal Id Mismatch"
					)

					res.body.must.include(t("MOBILE_ID_ERROR_NOT_FOUND"))

					yield signablesDb.search(sql`
						SELECT * FROM initiative_signables
					`).must.then.be.empty()
				})
			})

			_.each(MOBILE_ID_CREATE_ERRORS,
				function([statusCode, statusMessage, error], code) {
				it(`must respond with error given ${code}`, function*() {
					this.router.post(
						`${MOBILE_ID_URL.path}certificate`,
						respond.bind(null, {result: code})
					)

					var path = `/initiatives/${this.initiative.uuid}`
					var res = yield this.request(path + "/signatures", {
						method: "POST",
						form: {
							method: "mobile-id",
							personalId: ADULT_PERSONAL_ID,
							phoneNumber: "+37200000766"
						}
					})

					res.statusCode.must.equal(statusCode)
					res.statusMessage.must.equal(statusMessage)
					res.body.must.include(t(error))

					yield signablesDb.search(sql`
						SELECT * FROM initiative_signables
					`).must.then.be.empty()
				})
			})

			it("must respond with 422 given invalid personal id", function*() {
				var path = `/initiatives/${this.initiative.uuid}`
				var res = yield this.request(path + "/signatures", {
					method: "POST",
					form: {
						method: "mobile-id",
						personalId: "60001010",
						phoneNumber: "+37200000766"
					}
				})

				res.statusCode.must.equal(422)
				res.statusMessage.must.equal("Invalid Personal Id")
				res.body.must.include(t("SIGN_ERROR_PERSONAL_ID_INVALID"))
			})

			it("must respond with 422 given invalid personal id error", function*() {
				this.router.post(`${MOBILE_ID_URL.path}certificate`,
					function(req, res) {
					res.statusCode = 400

					respond({
						error: "nationalIdentityNumber must contain of 11 digits"
					}, req, res)
				})

				var path = `/initiatives/${this.initiative.uuid}`
				var res = yield this.request(path + "/signatures", {
					method: "POST",
					form: {
						method: "mobile-id",
						personalId: ADULT_PERSONAL_ID,
						phoneNumber: "+37200000766"
					}
				})

				res.statusCode.must.equal(422)
				res.statusMessage.must.equal(
					"Not a Mobile-Id User or Personal Id Mismatch"
				)

				res.body.must.include(t("MOBILE_ID_ERROR_NOT_FOUND"))

				yield signablesDb.search(sql`
					SELECT * FROM initiative_signables
				`).must.then.be.empty()
			})

			it("must respond with 422 given invalid phone number error", function*() {
				this.router.post(`${MOBILE_ID_URL.path}certificate`,
					function(req, res) {
					res.statusCode = 400

					respond({
						error: "phoneNumber must contain of + and numbers(8-30)"
					}, req, res)
				})

				var path = `/initiatives/${this.initiative.uuid}`
				var res = yield this.request(path + "/signatures", {
					method: "POST",
					form: {
						method: "mobile-id",
						personalId: ADULT_PERSONAL_ID,
						phoneNumber: "+37200000766"
					}
				})

				res.statusCode.must.equal(422)
				res.statusMessage.must.equal(
					"Not a Mobile-Id User or Personal Id Mismatch"
				)

				res.body.must.include(t("MOBILE_ID_ERROR_NOT_FOUND"))

				yield signablesDb.search(sql`
					SELECT * FROM initiative_signables
				`).must.then.be.empty()
			})

			it("must respond with 500 given Bad Request", function*() {
				this.router.post(`${MOBILE_ID_URL.path}certificate`,
					function(req, res) {
					res.statusCode = 400
					respond({error: "Unknown language 'FOOLANG"}, req, res)
				})

				var path = `/initiatives/${this.initiative.uuid}`
				var res = yield this.request(path + "/signatures", {
					method: "POST",
					form: {
						method: "mobile-id",
						personalId: ADULT_PERSONAL_ID,
						phoneNumber: "+37200000766"
					}
				})

				res.statusCode.must.equal(500)
				res.statusMessage.must.equal("Unknown Mobile-Id Error")
				res.body.must.not.include("FOOLANG")

				yield signablesDb.search(sql`
					SELECT * FROM initiative_signables
				`).must.then.be.empty()
			})

			_.each(MOBILE_ID_SESSION_ERRORS,
				function([statusCode, statusMessage, error], code) {
				it(`must respond with error given ${code} while signing`,
					function*() {
					var errored = yield signWithMobileId(
						this.router,
						this.request,
						this.initiative,
						MOBILE_ID_CERTIFICATE,
						respond.bind(null, {state: "COMPLETE", result: code})
					)

					errored.statusCode.must.equal(statusCode)
					errored.statusMessage.must.equal(statusMessage)
					var initiativePath = `/initiatives/${this.initiative.uuid}`
					errored.headers.location.must.equal(initiativePath)

					yield signaturesDb.search(sql`
						SELECT * FROM initiative_signatures
					`).must.then.be.empty()

					var cookies = Http.parseCookies(errored.headers["set-cookie"])
					var res = yield this.request(errored.headers.location, {
						headers: {Cookie: Http.serializeCookies(cookies)}
					})

					res.statusCode.must.equal(200)
					res.body.must.not.include(t("THANKS_FOR_SIGNING"))
					res.body.must.not.include(t("THANKS_FOR_SIGNING_AGAIN"))
					res.body.must.include(t(error))
				})
			})

			it("must time out after 2 minutes", function*() {
				var waited = 0
				var errored = yield signWithMobileId(
					this.router,
					this.request,
					this.initiative,
					MOBILE_ID_CERTIFICATE,
					(req, res) => {
						var timeoutMs = Url.parse(req.url, true).query.timeoutMs
						timeoutMs.must.equal(waited == 0 ? "120000" : "1000")
						if (waited++ == 0) this.time.tick(119 * 1000)
						else this.time.tick(1000)
						respond({state: "RUNNING"}, req, res)
					}
				)

				errored.statusCode.must.equal(410)
				errored.statusMessage.must.equal("Mobile-Id Timeout")
				var initiativePath = `/initiatives/${this.initiative.uuid}`
				errored.headers.location.must.equal(initiativePath)
				waited.must.equal(2)

				yield signaturesDb.search(sql`
					SELECT * FROM initiative_signatures
				`).must.then.be.empty()

				var cookies = Http.parseCookies(errored.headers["set-cookie"])
				var res = yield this.request(errored.headers.location, {
					headers: {Cookie: Http.serializeCookies(cookies)}
				})

				res.statusCode.must.equal(200)
				res.body.must.not.include(t("THANKS_FOR_SIGNING"))
				res.body.must.not.include(t("THANKS_FOR_SIGNING_AGAIN"))
				res.body.must.include(t("MOBILE_ID_ERROR_TIMEOUT"))
			})
		})

		describe("when signing via Smart-Id", function() {
			mustSign(signWithSmartId, SMART_ID_CERTIFICATE)

			it("must create a signature", function*() {
				var cert = new Certificate(newCertificate({
					subject: {
						countryName: "EE",
						organizationalUnitName: "SIGNATURE",
						commonName: `SMITH,JOHN,PNOEE-${ADULT_PERSONAL_ID}`,
						surname: "SMITH",
						givenName: "JOHN",
						serialNumber: `PNOEE-${ADULT_PERSONAL_ID}`
					},

					issuer: VALID_ISSUERS[0],
					publicKey: JOHN_RSA_KEYS.publicKey
				}))

				var [xades, ocspResponse] = newXades(this.initiative, cert)
				var certSession = "3befb011-37bf-4e57-b041-e4cba1496766"
				var signSession = "21e55f06-d6cb-40b7-9638-75dc0b131851"

				this.router.post(
					`${SMART_ID_URL.path}certificatechoice/etsi/PNOEE-${ADULT_PERSONAL_ID}`,
					function(req, res) {
					req.headers.host.must.equal(SMART_ID_URL.host)

					req.body.relyingPartyName.must.equal(Config.smartIdUser)
					req.body.relyingPartyUUID.must.equal(Config.smartIdPassword)

					respond({sessionID: certSession}, req, res)
				})

				this.router.get(
					`${SMART_ID_URL.path}session/${certSession}`,
					function(req, res) {
					res.writeHead(200)
					req.headers.host.must.equal(SMART_ID_URL.host)

					respond({
						state: "COMPLETE",
						result: {endResult: "OK", documentNumber: SMART_ID},

						cert: {
							certificateLevel: "QUALIFIED",
							value: cert.toString("base64"),
						}
					}, req, res)
				})

				this.router.post(
					`${SMART_ID_URL.path}signature/document/${SMART_ID}`,
					function(req, res) {
					res.writeHead(200)
					req.headers.host.must.equal(SMART_ID_URL.host)

					req.body.relyingPartyName.must.equal(Config.smartIdUser)
					req.body.relyingPartyUUID.must.equal(Config.smartIdPassword)
					req.body.hashType.must.equal("SHA256")
					req.body.hash.must.equal(xades.signableHash.toString("base64"))

					respond({sessionID: signSession}, req, res)
				})

				this.router.get(`${SMART_ID_URL.path}session/${signSession}`,
					function(req, res) {
					res.writeHead(200)
					req.headers.host.must.equal(SMART_ID_URL.host)

					respond({
						state: "COMPLETE",
						result: {endResult: "OK"},

						cert: {
							certificateLevel: "QUALIFIED",
							value: cert.toString("base64"),
						},

						signature: {
							algorithm: "sha256WithRSAEncryption",
							value: xades.signature.toString("base64")
						}
					}, req, res)
				})

				this.router.post(TIMEMARK_URL.path, function(req, res) {
					req.headers.host.must.equal(TIMEMARK_URL.host)
					res.setHeader("Content-Type", "application/ocsp-response")
					res.flushHeaders()

					// NOTE: Respond with a little delay to ensure signature
					// polling later works as expected.
					setTimeout(() => res.end(ocspResponse.toBuffer()), 100)
				})

				var initiativePath = `/initiatives/${this.initiative.uuid}`
				var signing = yield this.request(initiativePath + "/signatures", {
					method: "POST",
					headers: {"X-Forwarded-For": LONDON_FORWARDED_FOR},
					form: {method: "smart-id", personalId: ADULT_PERSONAL_ID}
				})

				signing.statusCode.must.equal(202)

				var signed = yield this.request(signing.headers.location, {
					headers: {Accept: `application/x-empty, ${ERR_TYPE}`}
				})

				signed.statusCode.must.equal(204)
				signed.headers.location.must.equal(initiativePath)

				var signables = yield signablesDb.search(sql`
					SELECT * FROM initiative_signables
				`)

				signables.length.must.equal(1)
				signables[0].initiative_uuid.must.equal(this.initiative.uuid)
				signables[0].country.must.equal("EE")
				signables[0].personal_id.must.equal(ADULT_PERSONAL_ID)
				signables[0].method.must.equal("smart-id")
				signables[0].xades.toString().must.equal(String(xades))
				signables[0].signed.must.be.true()
				signables[0].timestamped.must.be.true()
				signables[0].created_from.must.eql(LONDON_GEO)
				demand(signables[0].error).be.null()

				yield signaturesDb.search(sql`
					SELECT * FROM initiative_signatures
				`).must.then.eql([new ValidSignature({
					initiative_uuid: this.initiative.uuid,
					token: signables[0].token,
					country: "EE",
					personal_id: ADULT_PERSONAL_ID,
					method: "smart-id",
					xades: String(xades),
					created_from: LONDON_GEO
				})])
			})

			it("must respond with 422 given certificate from untrusted issuer",
				function*() {
				var issuer = tsl.getBySubjectName([
					"C=EE",
					"O=AS Sertifitseerimiskeskus",
					"OU=Sertifitseerimisteenused",
					"CN=EID-SK 2007",
				].join(","))

				var cert = new Certificate(newCertificate({
					subject: {
						countryName: "EE",
						organizationalUnitName: "SIGNATURE",
						commonName: `SMITH,JOHN,PNOEE-${ADULT_PERSONAL_ID}`,
						surname: "SMITH",
						givenName: "JOHN",
						serialNumber: `PNOEE-${ADULT_PERSONAL_ID}`
					},

					issuer: issuer,
					publicKey: JOHN_RSA_KEYS.publicKey
				}))

				var res = yield certWithSmartId(
					this.router,
					this.request,
					this.initiative,
					cert
				)

				res.statusCode.must.equal(422)
				res.statusMessage.must.equal("Invalid Issuer")
				res.headers["content-type"].must.equal("text/html; charset=utf-8")
				res.body.must.include(t("INVALID_CERTIFICATE_ISSUER"))
			})

			it("must respond with 422 given future certificate", function*() {
				var cert = new Certificate(newCertificate({
					subject: {
						countryName: "EE",
						organizationalUnitName: "SIGNATURE",
						commonName: `SMITH,JOHN,PNOEE-${ADULT_PERSONAL_ID}`,
						surname: "SMITH",
						givenName: "JOHN",
						serialNumber: `PNOEE-${ADULT_PERSONAL_ID}`
					},

					validFrom: DateFns.addSeconds(new Date, 1),
					issuer: VALID_ISSUERS[0],
					publicKey: JOHN_RSA_KEYS.publicKey
				}))

				var res = yield certWithSmartId(
					this.router,
					this.request,
					this.initiative,
					cert
				)

				res.statusCode.must.equal(422)
				res.statusMessage.must.equal("Certificate Not Yet Valid")
				res.headers["content-type"].must.equal("text/html; charset=utf-8")
				res.body.must.include(t("CERTIFICATE_NOT_YET_VALID"))
			})

			it("must respond with 422 given past certificate", function*() {
				var cert = new Certificate(newCertificate({
					subject: {
						countryName: "EE",
						organizationalUnitName: "SIGNATURE",
						commonName: `SMITH,JOHN,PNOEE-${ADULT_PERSONAL_ID}`,
						surname: "SMITH",
						givenName: "JOHN",
						serialNumber: `PNOEE-${ADULT_PERSONAL_ID}`
					},

					validUntil: new Date,
					issuer: VALID_ISSUERS[0],
					publicKey: JOHN_RSA_KEYS.publicKey
				}))

				var res = yield certWithSmartId(
					this.router,
					this.request,
					this.initiative,
					cert
				)

				res.statusCode.must.equal(422)
				res.statusMessage.must.equal("Certificate Expired")
				res.headers["content-type"].must.equal("text/html; charset=utf-8")
				res.body.must.include(t("CERTIFICATE_EXPIRED"))
			})

			it("must respond with 422 given underage signer", function*() {
				var path = `/initiatives/${this.initiative.uuid}/signatures`
				var res = yield this.request(path, {
					method: "POST",
					form: {method: "smart-id", personalId: CHILD_PERSONAL_ID}
				})

				res.statusCode.must.equal(422)
				res.statusMessage.must.equal("Too Young")
				res.headers["content-type"].must.equal("text/html; charset=utf-8")
				res.body.must.include(t("SIGN_ERROR_TOO_YOUNG"))
			})

			it("must get certificate if request running", function*() {
				var cert = new Certificate(newCertificate({
					subject: {
						countryName: "EE",
						organizationalUnitName: "SIGNATURE",
						commonName: `SMITH,JOHN,PNOEE-${ADULT_PERSONAL_ID}`,
						surname: "SMITH",
						givenName: "JOHN",
						serialNumber: `PNOEE-${ADULT_PERSONAL_ID}`
					},

					validUntil: new Date,
					issuer: VALID_ISSUERS[0],
					publicKey: JOHN_RSA_KEYS.publicKey
				}))

				var certSession = "3befb011-37bf-4e57-b041-e4cba1496766"

				this.router.post(
					`${SMART_ID_URL.path}certificatechoice/etsi/:id`,
					respond.bind(null, {sessionID: certSession})
				)

				var waited = 0
				this.router.get(
					`${SMART_ID_URL.path}session/${certSession}`,
					function(req, res) {
						if (waited++ < 2) return void respond({state: "RUNNING"}, req, res)

						respond({
							state: "COMPLETE",
							result: {endResult: "OK", documentNumber: SMART_ID},
							cert: {
								certificateLevel: "QUALIFIED",
								value: cert.toString("base64")
							}
						}, req, res)
					}
				)

				var path = `/initiatives/${this.initiative.uuid}/signatures`
				var res = yield this.request(path, {
					method: "POST",
					form: {method: "smart-id", personalId: ADULT_PERSONAL_ID}
				})

				res.statusCode.must.equal(422)
				res.statusMessage.must.equal("Certificate Expired")
				res.headers["content-type"].must.equal("text/html; charset=utf-8")
				res.body.must.include(t("CERTIFICATE_EXPIRED"))
			})

			it("must time out after 90s of waiting for certificate", function*() {
				var certSession = "3befb011-37bf-4e57-b041-e4cba1496766"

				this.router.post(
					`${SMART_ID_URL.path}certificatechoice/etsi/:id`,
					respond.bind(null, {sessionID: certSession})
				)

				var waited = 0
				this.router.get(
					`${SMART_ID_URL.path}session/${certSession}`,
					(req, res) => {
						var timeoutMs = Url.parse(req.url, true).query.timeoutMs
						timeoutMs.must.equal(waited == 0 ? "90000" : "1000")
						if (waited++ == 0) this.time.tick(89 * 1000)
						else this.time.tick(1000)
						respond({state: "RUNNING"}, req, res)
					}
				)

				var path = `/initiatives/${this.initiative.uuid}/signatures`
				var res = yield this.request(path, {
					method: "POST",
					form: {method: "smart-id", personalId: ADULT_PERSONAL_ID}
				})

				res.statusCode.must.equal(410)
				res.statusMessage.must.equal("Smart-Id Timeout")
				res.headers["content-type"].must.equal("text/html; charset=utf-8")
				res.body.must.include(t("SMART_ID_ERROR_TIMEOUT_SIGN"))
			})

			it("must create signature if Smart-Id session running", function*() {
				var waited = 0
				var signed = yield signWithSmartId(
					this.router,
					this.request,
					this.initiative,
					SMART_ID_CERTIFICATE,
					next(function*(req, res) {
						if (waited++ < 2)
							return void respond({state: "RUNNING"}, req, res)

						res.writeHead(200)

						var xades = yield signablesDb.read(sql`
							SELECT * FROM initiative_signables
							ORDER BY created_at DESC
							LIMIT 1
						`).then((row) => row.xades)

						respond({
							state: "COMPLETE",
							result: {endResult: "OK"},

							cert: {
								certificateLevel: "QUALIFIED",
								value: SMART_ID_CERTIFICATE.toString("base64")
							},

							signature: {
								algorithm: "sha256WithRSAEncryption",
								value: signWithRsa(
									JOHN_RSA_KEYS.privateKey,
									xades.signable
								).toString("base64")
							}
						}, req, res)
					})
				)

				signed.statusCode.must.equal(204)

				yield signaturesDb.search(sql`
					SELECT * FROM initiative_signatures
				`).must.then.not.be.empty()

				var cookies = Http.parseCookies(signed.headers["set-cookie"])
				var res = yield this.request(signed.headers.location, {
					headers: {Cookie: Http.serializeCookies(cookies)}
				})

				res.statusCode.must.equal(200)
				res.body.must.include(t("THANKS_FOR_SIGNING"))
			})

			_.each({
				RSA: [JOHN_RSA_KEYS, signWithRsa],
				ECDSA: [JOHN_ECDSA_KEYS, signWithEcdsa]
			}, function([keys, sign], algo) {
				it(`must create a signature given an ${algo} signature`, function*() {
					var cert = new Certificate(newCertificate({
						subject: {
							countryName: "EE",
							organizationalUnitName: "SIGNATURE",
							commonName: `SMITH,JOHN,PNOEE-${ADULT_PERSONAL_ID}`,
							surname: "SMITH",
							givenName: "JOHN",
							serialNumber: `PNOEE-${ADULT_PERSONAL_ID}`
						},

						issuer: VALID_ISSUERS[0],
						publicKey: keys.publicKey
					}))

					var signed = yield signWithSmartId(
						this.router,
						this.request,
						this.initiative,
						cert,
						next(function*(req, res) {
							res.writeHead(200)

							var xades = yield signablesDb.read(sql`
								SELECT * FROM initiative_signables
								ORDER BY created_at DESC
								LIMIT 1
							`).then((row) => row.xades)

							respond({
								state: "COMPLETE",
								result: {endResult: "OK"},

								cert: {
									certificateLevel: "QUALIFIED",
									value: SMART_ID_CERTIFICATE.toString("base64")
								},

								signature: {
									algorithm: "sha256WithRSAEncryption",
									value: sign(
										keys.privateKey,
										xades.signable
									).toString("base64")
								}
							}, req, res)
						})
					)

					signed.statusCode.must.equal(204)

					yield signaturesDb.search(sql`
						SELECT * FROM initiative_signatures
					`).must.then.not.be.empty()
				})

				it(`must respond with error given an invalid ${algo} signature`,
					function*() {
					var cert = new Certificate(newCertificate({
						subject: {
							countryName: "EE",
							organizationalUnitName: "SIGNATURE",
							commonName: `SMITH,JOHN,PNOEE-${ADULT_PERSONAL_ID}`,
							surname: "SMITH",
							givenName: "JOHN",
							serialNumber: `PNOEE-${ADULT_PERSONAL_ID}`
						},

						issuer: VALID_ISSUERS[0],
						publicKey: keys.publicKey
					}))

					var errored = yield signWithSmartId(
						this.router,
						this.request,
						this.initiative,
						cert,
						respond.bind(null, {
							state: "COMPLETE",
							result: {endResult: "OK"},

							cert: {
								certificateLevel: "QUALIFIED",
								value: SMART_ID_CERTIFICATE.toString("base64")
							},

							signature: {
								algorithm: "sha256WithRSAEncryption",
								value: Crypto.randomBytes(64).toString("base64")
							}
						})
					)

					errored.statusCode.must.equal(410)
					errored.statusMessage.must.equal("Invalid Smart-Id Signature")
					var initiativePath = `/initiatives/${this.initiative.uuid}`
					errored.headers.location.must.equal(initiativePath)

					var cookies = Http.parseCookies(errored.headers["set-cookie"])
					var res = yield this.request(errored.headers.location, {
						headers: {Cookie: Http.serializeCookies(cookies)}
					})

					res.statusCode.must.equal(200)
					res.body.must.not.include(t("THANKS_FOR_SIGNING"))
					res.body.must.not.include(t("THANKS_FOR_SIGNING_AGAIN"))
					res.body.must.include(t("SMART_ID_ERROR_INVALID_SIGNATURE"))

					yield signaturesDb.search(sql`
						SELECT * FROM initiative_signatures
					`).must.then.be.empty()
				})
			})

			it("must respond with 422 given invalid personal id", function*() {
				this.router.post(`${SMART_ID_URL.path}certificatechoice/etsi/:id`,
					function(req, res) {
					res.statusCode = 404
					respond({code: 404, message: "Not Found"}, req, res)
				})

				var initiativePath = `/initiatives/${this.initiative.uuid}`
				var res = yield this.request(initiativePath + "/signatures", {
					method: "POST",
					form: {method: "smart-id", personalId: "60001010"}
				})

				res.statusCode.must.equal(422)
				res.statusMessage.must.equal("Invalid Personal Id")
				res.body.must.include(t("SIGN_ERROR_PERSONAL_ID_INVALID"))
			})

			it("must respond with 422 given invalid personal id error", function*() {
				this.router.post(`${SMART_ID_URL.path}certificatechoice/etsi/:id`,
					function(req, res) {
					res.statusCode = 404
					respond({code: 404, message: "Not Found"}, req, res)
				})

				var initiativePath = `/initiatives/${this.initiative.uuid}`
				var res = yield this.request(initiativePath + "/signatures", {
					method: "POST",
					form: {method: "smart-id", personalId: ADULT_PERSONAL_ID}
				})

				res.statusCode.must.equal(422)
				res.statusMessage.must.equal("Not a Smart-Id User")
				res.body.must.include(t("SMART_ID_ERROR_NOT_FOUND"))

				yield signablesDb.search(sql`
					SELECT * FROM initiative_signables
				`).must.then.be.empty()
			})

			it("must respond with 500 given Bad Request", function*() {
				this.router.post(`${SMART_ID_URL.path}certificatechoice/etsi/:id`,
					function(req, res) {
					res.statusCode = 400
					respond({code: 400, message: "Bad Request"}, req, res)
				})

				var initiativePath = `/initiatives/${this.initiative.uuid}`
				var res = yield this.request(initiativePath + "/signatures", {
					method: "POST",
					form: {method: "smart-id", personalId: ADULT_PERSONAL_ID}
				})

				res.statusCode.must.equal(500)
				res.statusMessage.must.equal("Unknown Smart-Id Error")
				res.body.must.not.include("FOOLANG")

				yield signablesDb.search(sql`
					SELECT * FROM initiative_signables
				`).must.then.be.empty()
			})

			_.each(SMART_ID_SESSION_ERRORS,
				function([statusCode, statusMessage, error], code) {
				it(`must respond with error given ${code} while fetching certificate`,
					function*() {
					var errored = yield certWithSmartId(
						this.router,
						this.request,
						this.initiative,
						respond.bind(null, {state: "COMPLETE", result: {endResult: code}})
					)

					errored.statusCode.must.equal(statusCode)
					errored.statusMessage.must.equal(statusMessage)
					errored.body.must.include(t(error))

					yield signaturesDb.search(sql`
						SELECT * FROM initiative_signatures
					`).must.then.be.empty()
				})

				it(`must respond with error given ${code} while signing`,
					function*() {
					var errored = yield signWithSmartId(
						this.router,
						this.request,
						this.initiative,
						SMART_ID_CERTIFICATE,
						respond.bind(null, {state: "COMPLETE", result: {endResult: code}})
					)

					errored.statusCode.must.equal(statusCode)
					errored.statusMessage.must.equal(statusMessage)
					var initiativePath = `/initiatives/${this.initiative.uuid}`
					errored.headers.location.must.equal(initiativePath)

					yield signaturesDb.search(sql`
						SELECT * FROM initiative_signatures
					`).must.then.be.empty()

					var cookies = Http.parseCookies(errored.headers["set-cookie"])
					var res = yield this.request(errored.headers.location, {
						headers: {Cookie: Http.serializeCookies(cookies)}
					})

					res.statusCode.must.equal(200)
					res.body.must.not.include(t("THANKS_FOR_SIGNING"))
					res.body.must.not.include(t("THANKS_FOR_SIGNING_AGAIN"))
					res.body.must.include(t(error))
				})
			})

			it("must time out after 2 minutes", function*() {
				var waited = 0
				var errored = yield signWithSmartId(
					this.router,
					this.request,
					this.initiative,
					SMART_ID_CERTIFICATE,
					(req, res) => {
						var timeoutMs = Url.parse(req.url, true).query.timeoutMs
						timeoutMs.must.equal(waited == 0 ? "120000" : "1000")
						if (waited++ == 0) this.time.tick(119 * 1000)
						else this.time.tick(1000)
						respond({state: "RUNNING"}, req, res)
					}
				)

				errored.statusCode.must.equal(410)
				errored.statusMessage.must.equal("Smart-Id Timeout")
				var initiativePath = `/initiatives/${this.initiative.uuid}`
				errored.headers.location.must.equal(initiativePath)
				waited.must.equal(2)

				yield signaturesDb.search(sql`
					SELECT * FROM initiative_signatures
				`).must.then.be.empty()

				var cookies = Http.parseCookies(errored.headers["set-cookie"])
				var res = yield this.request(errored.headers.location, {
					headers: {Cookie: Http.serializeCookies(cookies)}
				})

				res.statusCode.must.equal(200)
				res.body.must.not.include(t("THANKS_FOR_SIGNING"))
				res.body.must.not.include(t("THANKS_FOR_SIGNING_AGAIN"))
				res.body.must.include(t("SMART_ID_ERROR_TIMEOUT_SIGN"))
			})
		})
	})

	describe(`GET /:personalid for ${ASICE_TYPE}`, function() {
		beforeEach(function*() {
			this.author = yield usersDb.create(new ValidUser)

			this.initiative = yield initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				phase: "sign",
				signing_ends_at: DateFns.addDays(new Date, 1)
			}))
		})

		it("must respond with signature ASIC-E", function*() {
			var signature = yield signaturesDb.create(new ValidSignature({
				initiative_uuid: this.initiative.uuid,
				country: "EE",
				personal_id: "38706181337"
			}))

			var initiativePath = `/initiatives/${this.initiative.uuid}`
			var path = initiativePath + "/signatures/EE38706181337.asice"
			path += "?token=" + signature.token.toString("hex")
			var res = yield this.request(path)
			res.headers["content-type"].must.equal(ASICE_TYPE)

			var zip = yield Zip.parse(Buffer.from(res.body))
			var entries = yield Zip.parseEntries(zip)
			Object.keys(entries).length.must.equal(4)

			var xades = yield Zip.readEntry(zip, entries["META-INF/signatures-1.xml"])
			String(xades).must.equal(String(signature.xades))

			var text = yield Zip.readEntry(zip, entries["initiative.html"])
			String(text).must.equal(this.initiative.text)
		})

		it("must respond with 404 if no signature", function*() {
			var initiativePath = `/initiatives/${this.initiative.uuid}`
			var path = initiativePath + "/signatures/EE38706181337.asice"
			path += "?token=aabbccddee"
			var res = yield this.request(path)
			res.statusCode.must.equal(404)
		})

		it("must respond with 404 if invalid token", function*() {
			yield signaturesDb.create(new ValidSignature({
				initiative_uuid: this.initiative.uuid,
				country: "EE",
				personal_id: "38706181337"
			}))

			var initiativePath = `/initiatives/${this.initiative.uuid}`
			var path = initiativePath + "/signatures/EE38706181337.asice"
			path += "?token=aabbccddee"
			var res = yield this.request(path)
			res.statusCode.must.equal(404)
		})
	})

	describe("PUT /:personalId", function() {
		require("root/test/time")()

		beforeEach(function*() {
			this.author = yield usersDb.create(new ValidUser)

			this.initiative = yield initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				phase: "sign",
				signing_ends_at: DateFns.addDays(new Date, 1)
			}))
		})

		it("must hide signature and redirect", function*() {
			var signature = yield signaturesDb.create(new ValidSignature({
				initiative_uuid: this.initiative.uuid,
				country: "EE",
				personal_id: "38706181337"
			}))

			var initiativePath = `/initiatives/${this.initiative.uuid}`
			var path = initiativePath + "/signatures/EE38706181337"
			path += "?token=" + signature.token.toString("hex")
			var updated = yield this.request(path, {
				method: "PUT",
				form: {hidden: true}
			})

			updated.statusCode.must.equal(303)
			updated.headers.location.must.equal(initiativePath)

			yield signaturesDb.search(sql`
				SELECT * FROM initiative_signatures
			`).must.then.eql([{
				__proto__: signature,
				hidden: true,
				updated_at: new Date
			}])

			var cookies = Http.parseCookies(updated.headers["set-cookie"])
			var res = yield this.request(updated.headers.location, {
				headers: {Cookie: Http.serializeCookies(cookies)}
			})

			res.statusCode.must.equal(200)
			res.body.must.include(t("SIGNATURE_HIDDEN"))
		})

		it("must respond with 404 if no signature", function*() {
			var initiativePath = `/initiatives/${this.initiative.uuid}`
			var path = initiativePath + "/signatures/EE38706181337?token=aabbccddee"
			var res = yield this.request(path, {
				method: "PUT",
				form: {hidden: true}
			})

			res.statusCode.must.equal(404)
		})

		it("must respond with 404 if invalid token", function*() {
			var signature = yield signaturesDb.create(new ValidSignature({
				initiative_uuid: this.initiative.uuid,
				country: "EE",
				personal_id: "38706181337"
			}))

			var initiativePath = `/initiatives/${this.initiative.uuid}`
			var path = initiativePath + "/signatures/EE38706181337?token=aabbccddee"
			var res = yield this.request(path, {
				method: "PUT",
				form: {hidden: true}
			})

			res.statusCode.must.equal(404)
			yield signaturesDb.read(signature).must.then.eql(signature)
		})

		it("must respond with 409 if setting signature once signed", function*() {
			var signature = yield signaturesDb.create(new ValidSignature({
				initiative_uuid: this.initiative.uuid,
				country: "EE",
				personal_id: "38706181337"
			}))

			var initiativePath = `/initiatives/${this.initiative.uuid}`
			var path = initiativePath + "/signatures/EE38706181337"
			path += "?token=" + signature.token.toString("hex")
			var updated = yield this.request(path, {
				method: "PUT",
				headers: {"Content-Type": SIGNATURE_TYPE}
			})

			updated.statusCode.must.equal(409)
			updated.statusMessage.must.equal("Already Signed")
		})
	})

	describe("DELETE /:personalId", function() {
		beforeEach(function*() {
			this.author = yield usersDb.create(new ValidUser)

			this.initiative = yield initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				phase: "sign",
				signing_ends_at: DateFns.addDays(new Date, 1)
			}))
		})

		it("must delete signature and redirect", function*() {
			var signature = yield signaturesDb.create(new ValidSignature({
				initiative_uuid: this.initiative.uuid,
				country: "EE",
				personal_id: "38706181337"
			}))

			var initiativePath = `/initiatives/${this.initiative.uuid}`
			var path = initiativePath + "/signatures/EE38706181337"
			path += "?token=" + signature.token.toString("hex")
			var deleted = yield this.request(path, {method: "DELETE"})
			deleted.statusCode.must.equal(303)
			deleted.headers.location.must.equal(initiativePath)

			yield signaturesDb.search(sql`
				SELECT * FROM initiative_signatures
			`).must.then.be.empty()

			var cookies = Http.parseCookies(deleted.headers["set-cookie"])
			var res = yield this.request(deleted.headers.location, {
				headers: {Cookie: Http.serializeCookies(cookies)}
			})

			res.statusCode.must.equal(200)
			res.body.must.include(t("SIGNATURE_REVOKED"))
			res.body.must.not.include(t("THANKS_FOR_SIGNING"))
			res.body.must.not.include("donate-form")
		})

		it("must respond with 404 if no signature", function*() {
			var initiativePath = `/initiatives/${this.initiative.uuid}`
			var path = initiativePath + "/signatures/EE38706181337?token=aabbccddee"
			var res = yield this.request(path, {method: "DELETE"})
			res.statusCode.must.equal(404)
		})

		it("must respond with 404 if invalid token", function*() {
			var signature = yield signaturesDb.create(new ValidSignature({
				initiative_uuid: this.initiative.uuid,
				country: "EE",
				personal_id: "38706181337"
			}))

			var initiativePath = `/initiatives/${this.initiative.uuid}`
			var path = initiativePath + "/signatures/EE38706181337?token=aabbccddee"
			var res = yield this.request(path, {method: "DELETE"})

			res.statusCode.must.equal(404)
			yield signaturesDb.read(signature).must.then.eql(signature)
		})

		it("must not delete signature on another initiative", function*() {
			var signature = yield signaturesDb.create(new ValidSignature({
				initiative_uuid: this.initiative.uuid,
				country: "EE",
				personal_id: "38706181337"
			}))

			var otherInitiative = yield initiativesDb.create(new ValidInitiative({
				user_id: this.author.id
			}))

			var otherSignature = yield signaturesDb.create(new ValidSignature({
				initiative_uuid: otherInitiative.uuid,
				country: "EE",
				personal_id: "38706181337"
			}))

			var initiativePath = `/initiatives/${this.initiative.uuid}`
			var path = initiativePath + "/signatures/EE38706181337"
			path += "?token=" + signature.token.toString("hex")
			var res = yield this.request(path, {method: "DELETE"})
			res.statusCode.must.equal(303)

			yield signaturesDb.search(sql`
				SELECT * FROM initiative_signatures
			`).must.then.eql([otherSignature])
		})

		it("must not delete signature of another person", function*() {
			var signature = yield signaturesDb.create(new ValidSignature({
				initiative_uuid: this.initiative.uuid,
				country: "EE",
				personal_id: "38706181337"
			}))

			var otherSignature = yield signaturesDb.create(new ValidSignature({
				initiative_uuid: this.initiative.uuid,
				country: "EE",
				personal_id: "60001019907"
			}))

			var initiativePath = `/initiatives/${this.initiative.uuid}`
			var path = initiativePath + "/signatures/EE38706181337"
			path += "?token=" + signature.token.toString("hex")
			var res = yield this.request(path, {method: "DELETE"})
			res.statusCode.must.equal(303)

			yield signaturesDb.search(sql`
				SELECT * FROM initiative_signatures
			`).must.then.eql([otherSignature])
		})
	})
})

function* signWithIdCard(router, request, initiative, cert) {
	var signing = yield request(`/initiatives/${initiative.uuid}/signatures`, {
		method: "POST",
		headers: {Accept: SIGNABLE_TYPE, "Content-Type": CERTIFICATE_TYPE},
		body: cert.toBuffer()
	})

	signing.statusCode.must.equal(202)

	var xades = yield signablesDb.read(sql`
		SELECT * FROM initiative_signables ORDER BY created_at DESC LIMIT 1
	`).then((row) => row.xades)

	router.post(TIMEMARK_URL.path, function(req, res) {
		req.headers.host.must.equal(TIMEMARK_URL.host)
		res.setHeader("Content-Type", "application/ocsp-response")
		res.end(Ocsp.parse(newOcspResponse(cert)).toBuffer())
	})

	return request(signing.headers.location, {
		method: "PUT",
		headers: {
			Accept: `application/x-empty, ${ERR_TYPE}`,
			"Content-Type": SIGNATURE_TYPE
		},

		body: signWithRsa(JOHN_RSA_KEYS.privateKey, xades.signable)
	})
}

function* signWithMobileId(router, request, initiative, cert, res) {
	router.post(`${MOBILE_ID_URL.path}certificate`, function(req, res) {
		respond({result: "OK", cert: cert.toString("base64")}, req, res)
	})

	router.post(`${MOBILE_ID_URL.path}signature`, function(req, res) {
		respond({sessionID: "7c8bdd56-6772-4264-ba27-bf7a9ef72a11"}, req, res)
	})

	router.get(
		`${MOBILE_ID_URL.path}signature/session/:token`,
		typeof res == "function" ? res : next(function*(req, res) {
			res.writeHead(200)

			var xades = yield signablesDb.read(sql`
				SELECT xades FROM initiative_signables ORDER BY created_at DESC LIMIT 1
			`).then((row) => row.xades)

			respond({
				state: "COMPLETE",
				result: "OK",

				signature: {
					algorithm: "sha256WithRSAEncryption",
					value: signWithRsa(
						JOHN_RSA_KEYS.privateKey,
						xades.signable
					).toString("base64")
				}
			}, req, res)
		})
	)

	router.post(TIMEMARK_URL.path, function(req, res) {
		req.headers.host.must.equal(TIMEMARK_URL.host)
		res.setHeader("Content-Type", "application/ocsp-response")
		res.end(Ocsp.parse(newOcspResponse(cert)).toBuffer())
	})

	var signing = yield request(`/initiatives/${initiative.uuid}/signatures`, {
		method: "POST",
		form: {
			method: "mobile-id",
			personalId: ADULT_PERSONAL_ID,
			phoneNumber: "+37200000766"
		}
	})

	signing.statusCode.must.equal(202)

	return request(signing.headers.location, {
		headers: {Accept: `application/x-empty, ${ERR_TYPE}`}
	})
}

function certWithSmartId(router, request, initiative, cert) {
	var certSession = "3befb011-37bf-4e57-b041-e4cba1496766"

	router.post(
		`${SMART_ID_URL.path}certificatechoice/etsi/:id`,
		respond.bind(null, {sessionID: certSession})
	)

	router.get(
		`${SMART_ID_URL.path}session/${certSession}`,
		typeof cert == "function" ? cert : respond.bind(null, {
			state: "COMPLETE",
			result: {endResult: "OK", documentNumber: SMART_ID},
			cert: {certificateLevel: "QUALIFIED", value: cert.toString("base64")}
		})
	)

	return request(`/initiatives/${initiative.uuid}/signatures`, {
		method: "POST",
		form: {method: "smart-id", personalId: ADULT_PERSONAL_ID}
	})
}

function* signWithSmartId(router, request, initiative, cert, res) {
	var signSession = "21e55f06-d6cb-40b7-9638-75dc0b131851"

	router.post(
		`${SMART_ID_URL.path}signature/document/${SMART_ID}`,
		respond.bind(null, {sessionID: signSession})
	)

	router.get(
		`${SMART_ID_URL.path}session/${signSession}`,
		typeof res == "function" ? res : next(function*(req, res) {
			res.writeHead(200)

			var xades = yield signablesDb.read(sql`
				SELECT xades FROM initiative_signables ORDER BY created_at DESC LIMIT 1
			`).then((row) => row.xades)

			respond({
				state: "COMPLETE",
				result: {endResult: "OK"},
				cert: {certificateLevel: "QUALIFIED", value: cert.toString("base64")},

				signature: {
					algorithm: "sha256WithRSAEncryption",
					value: signWithRsa(
						JOHN_RSA_KEYS.privateKey,
						xades.signable
					).toString("base64")
				}
			}, req, res)
		})
	)

	router.post(TIMEMARK_URL.path, function(req, res) {
		req.headers.host.must.equal(TIMEMARK_URL.host)
		res.setHeader("Content-Type", "application/ocsp-response")
		res.end(Ocsp.parse(newOcspResponse(cert)).toBuffer())
	})

	var signing = yield certWithSmartId(router, request, initiative, cert)
	signing.statusCode.must.equal(202)

	return request(signing.headers.location, {
		headers: {Accept: `application/x-empty, ${ERR_TYPE}`}
	})
}

function newXades(initiative, cert) {
	var xades = hades.new(cert, [{
		path: "initiative.html",
		type: "text/html",
		hash: initiative.text_sha256
	}], {policy: "bdoc"})

	var signatureBytes = signWithRsa(
		JOHN_RSA_KEYS.privateKey,
		xades.signable
	)

	xades.setSignature(signatureBytes)
	var ocspResponse = Ocsp.parse(newOcspResponse(cert))
	xades.setOcspResponse(ocspResponse)
	return [xades, ocspResponse]
}

function signWithRsa(key, signable) {
	return Crypto.createSign("sha256").update(signable).sign(key)
}

function signWithEcdsa(key, signable) {
	var signatureDer = Crypto.createSign("sha256").update(signable).sign(key)
	var signatureAsn = X509Asn.EcSignature.decode(signatureDer)

	return Buffer.concat([
		signatureAsn.r.toBuffer("be", 32),
		signatureAsn.s.toBuffer("be", 32)
	])
}

function formatPersonalId(date) {
	var sexCentury = date.getFullYear() < 2000 ? "3" : "5"
	var year = String(date.getFullYear()).slice(-2)
	var month = _.padLeft(String(date.getMonth() + 1), 2, "0")
	var day = _.padLeft(String(date.getDate()), 2, "0")
	return sexCentury + year + month + day
}
