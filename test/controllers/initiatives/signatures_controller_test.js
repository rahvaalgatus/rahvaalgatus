var _ = require("root/lib/underscore")
var Url = require("url")
var DateFns = require("date-fns")
var Asic = require("undersign/lib/asic")
var Config = require("root").config
var MobileId = require("undersign/lib/mobile_id")
var SmartId = require("undersign/lib/smart_id")
var ValidInitiative = require("root/test/valid_initiative")
var ValidSignable = require("root/test/valid_signable")
var ValidSignature = require("root/test/valid_signature")
var ValidCitizenosSignature = require("root/test/valid_citizenos_signature")
var ValidSignatureTrustee =
	require("root/test/valid_initiative_signature_trustee")
var ValidUser = require("root/test/valid_user")
var ValidSession = require("root/test/valid_session")
var ValidAuthentication = require("root/test/valid_authentication")
var ValidText = require("root/test/valid_initiative_text")
var Certificate = require("undersign/lib/certificate")
var X509Asn = require("undersign/lib/x509_asn")
var Timestamp = require("undersign/lib/timestamp")
var Ocsp = require("undersign/lib/ocsp")
var Crypto = require("crypto")
var Zip = require("root/lib/zip")
var {respond} = require("root/test/fixtures")
var sql = require("sqlate")
var t = require("root/lib/i18n").t.bind(null, Config.language)
var {newCertificate} = require("root/test/fixtures")
var {newTimestampResponse} = require("root/test/fixtures")
var {newOcspResponse} = require("root/test/fixtures")
var {parseCookies} = require("root/test/web")
var {serializeCookies} = require("root/test/web")
var {parseRefreshHeader} = require("root/lib/http")
var parseHtml = require("root/test/html").parse
var usersDb = require("root/db/users_db")
var authenticationsDb = require("root/db/authentications_db")
var sessionsDb = require("root/db/sessions_db")
var initiativesDb = require("root/db/initiatives_db")
var signaturesDb = require("root/db/initiative_signatures_db")
var signatureTrusteesDb = require("root/db/initiative_signature_trustees_db")
var signablesDb = require("root/db/initiative_signables_db")
var textsDb = require("root/db/initiative_texts_db")
var citizenosSignaturesDb =
	require("root/db/initiative_citizenos_signatures_db")
var {hades} = require("root")
var demand = require("must")
var {tsl} = require("root")
var MOBILE_ID_URL = Url.parse("https://mid.sk.ee/mid-api/")
var SMART_ID_URL = Url.parse("https://rp-api.smart-id.com/v1/")
var TIMESTAMP_URL = Url.parse(Config.timestampUrl)
var OCSP_URL = Url.parse("http://example.com/ocsp")
var OCSP_URL_OID = require("undersign/lib/x509_asn").OCSP_URL
var ASICE_TYPE = "application/vnd.etsi.asic-e+zip"
var CERTIFICATE_TYPE = "application/pkix-cert"
var CSV_TYPE = "text/csv; charset=utf-8"
var ERROR_TYPE = "application/vnd.rahvaalgatus.error+json"
var HTML_TYPE = "text/html; charset=utf-8"
var JSON_TYPE = "application/json; charset=utf-8"
var SIGNABLE_TYPE = "application/vnd.rahvaalgatus.signable"
var SIGNATURE_TYPE = "application/vnd.rahvaalgatus.signature"
var EMPTY_TYPE = "application/x-empty"
var ZIP_TYPE = "application/zip"
var {VALID_ISSUERS} = require("root/test/fixtures")
var {JOHN_RSA_KEYS} = require("root/test/fixtures")
var {JOHN_ECDSA_KEYS} = require("root/test/fixtures")
var SESSION_ID = "7c8bdd56-6772-4264-ba27-bf7a9ef72a11"
var {PERSONAL_ID_TRANSFORMS} = require("root/test/fixtures")
var {PHONE_NUMBER_TRANSFORMS} = require("root/test/fixtures")
var TODAY = new Date(2015, 5, 18)
var ADULT_BIRTHDATE = DateFns.addYears(TODAY, -16)
var CHILD_BIRTHDATE = DateFns.addDays(ADULT_BIRTHDATE, 1)
var ADULT_PERSONAL_ID = formatPersonalId(ADULT_BIRTHDATE) + "1337"
var CHILD_PERSONAL_ID = formatPersonalId(CHILD_BIRTHDATE) + "1337"
var SMART_ID = "PNOEE-" + ADULT_PERSONAL_ID + "-R2D2-Q"
var KEY_USAGE_NONREPUDIATION = 64
var KEY_USAGE_DIGITAL_SIGNATURE = 128
var SIGN_RATE = 5
var SIGN_RATE_IN_MINUTES = 30
var ASICE_FILES = ["mimetype", "META-INF/manifest.xml"]

// See https://github.com/maxmind/MaxMind-DB/blob/master/source-data for
// available test IP addresses.
var LONDON_FORWARDED_FOR = "81.2.69.160, 127.0.0.1"

var SIGN_CERTIFICATE_EXTENSIONS = [{
	extnID: "keyUsage",
	critical: true,
	extnValue: {data: Buffer.from([KEY_USAGE_NONREPUDIATION])}
}, {
	extnID: "authorityInformationAccess",
	extnValue: [{
		accessMethod: OCSP_URL_OID,
		accessLocation: {
			type: "uniformResourceIdentifier",
			value: Url.format(OCSP_URL)
		}
	}]
}]

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

	extensions: SIGN_CERTIFICATE_EXTENSIONS,
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

	extensions: SIGN_CERTIFICATE_EXTENSIONS,
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

	extensions: SIGN_CERTIFICATE_EXTENSIONS,
	issuer: VALID_ISSUERS[0],
	publicKey: JOHN_RSA_KEYS.publicKey
}))

var MOBILE_ID_CERT_ERRORS = {
	NOT_FOUND: [
		422,
		"Not a Mobile-ID User",
		"eid_view.mobile_id_errors.not_found"
	]
}

var MOBILE_ID_SIGN_ERRORS = {
	TIMEOUT: [
		410,
		"Mobile-ID Timeout",
		"eid_view.mobile_id_errors.sign_timeout"
	],

	NOT_MID_CLIENT: [
		410,
		"Mobile-ID Certificates Not Activated",
		"eid_view.mobile_id_errors.not_active"
	],

	USER_CANCELLED: [
		410,
		"Mobile-ID Cancelled",
		"eid_view.mobile_id_errors.sign_cancelled"
	],

	SIGNATURE_HASH_MISMATCH: [
		410,
		"Mobile-ID Signature Hash Mismatch",
		"eid_view.mobile_id_errors.sign_hash_mismatch"
	],

	PHONE_ABSENT: [
		410,
		"Mobile-ID Phone Absent",
		"eid_view.mobile_id_errors.sign_phone_absent"
	],

	DELIVERY_ERROR: [
		410,
		"Mobile-ID Delivery Error",
		"eid_view.mobile_id_errors.sign_delivery_error"
	],

	SIM_ERROR: [
		410,
		"Mobile-ID SIM Application Error",
		"eid_view.mobile_id_errors.sim_error"
	],
}

var SMART_ID_SESSION_ERRORS = {
	USER_REFUSED: [
		410,
		"Smart-ID Cancelled",
		"eid_view.smart_id_errors.sign_cancelled"
	],

	TIMEOUT: [
		410,
		"Smart-ID Timeout",
		"eid_view.smart_id_errors.sign_timeout"
	],

	NO_SUITABLE_CERTIFICATE: [
		410,
		"No Smart-ID Certificate",
		"eid_view.smart_id_errors.sign_no_suitable_certificate"
	],

	DOCUMENT_UNUSABLE: [
		410,
		"Smart-ID Certificate Unusable",
		"eid_view.smart_id_errors.document_unusable"
	],

	WRONG_VC: [
		410,
		"Wrong Smart-ID Verification Code Chosen",
		"eid_view.smart_id_errors.wrong_vc"
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
			var initiative = initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				phase: "parliament",
				parliament_token: null
			}))

			var path = `/initiatives/${initiative.id}/signatures.asice`
			path += "?parliament-token="
			var res = yield request.call(this, path)
			res.statusCode.must.equal(403)
			res.statusMessage.must.equal("Signatures Not Available")
		})

		it("must respond with 403 Forbidden given no token", function*() {
			var initiative = initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				phase: "parliament",
				parliament_token: Crypto.randomBytes(12)
			}))

			var path = `/initiatives/${initiative.id}/signatures.asice`
			var res = yield request.call(this, path)
			res.statusCode.must.equal(403)
			res.statusMessage.must.equal("Invalid Token")
		})

		it("must respond with 403 Forbidden given empty token", function*() {
			var initiative = initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				phase: "parliament",
				parliament_token: Crypto.randomBytes(12)
			}))

			var path = `/initiatives/${initiative.id}/signatures.asice`
			var res = yield request.call(this, path + "?parliament-token=")
			res.statusCode.must.equal(403)
			res.statusMessage.must.equal("Invalid Token")
		})

		it("must respond with 403 Forbidden given invalid token", function*() {
			var initiative = initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				phase: "parliament",
				parliament_token: Crypto.randomBytes(12)
			}))

			var path = `/initiatives/${initiative.id}/signatures.asice`
			var token = Crypto.randomBytes(12).toString("hex")
			var res = yield request.call(this, path + "?parliament-token=" + token)
			res.statusCode.must.equal(403)
			res.statusMessage.must.equal("Invalid Token")

			res.headers["content-type"].must.equal("text/html; charset=utf-8")
			res.body.must.include(t("INITIATIVE_SIGNATURES_INVALID_TOKEN"))
		})

		it("must respond with 403 Forbidden given non-ascii token", function*() {
			var initiative = initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				phase: "parliament",
				parliament_token: Crypto.randomBytes(12)
			}))

			var path = `/initiatives/${initiative.id}/signatures.asice`
			var res = yield request.call(this, path + "?parliament-token=foo.bar")
			res.statusCode.must.equal(403)
			res.statusMessage.must.equal("Invalid Token")
		})

		it("must respond with 423 Locked if initiative received by parliament",
			function*() {
			var initiative = initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				phase: "parliament",
				parliament_token: Crypto.randomBytes(12),
				received_by_parliament_at: new Date
			}))

			var path = `/initiatives/${initiative.id}/signatures.asice`
			path += "?parliament-token=" + initiative.parliament_token.toString("hex")
			var res = yield request.call(this, path)
			res.statusCode.must.equal(423)
			res.statusMessage.must.equal("Signatures Already In Parliament")

			res.headers["content-type"].must.equal("text/html; charset=utf-8")
			res.body.must.include(t("INITIATIVE_SIGNATURES_NO_LONGER_AVAILABLE"))
		})

		it("must respond with 423 Locked if initiative received by government",
			function*() {
			var initiative = initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				phase: "government",
				destination: "muhu-vald",
				parliament_token: Crypto.randomBytes(12),
				received_by_government_at: new Date
			}))

			var path = `/initiatives/${initiative.id}/signatures.asice`
			path += "?parliament-token=" + initiative.parliament_token.toString("hex")

			var res = yield request.call(this, path)
			res.statusCode.must.equal(423)
			res.statusMessage.must.equal("Signatures Already In Government")

			res.headers["content-type"].must.equal("text/html; charset=utf-8")
			res.body.must.include(t("INITIATIVE_SIGNATURES_NO_LONGER_AVAILABLE"))
		})
	}

	describe(`GET / for ${ASICE_TYPE}`, function() {
		beforeEach(function() { this.author = usersDb.create(new ValidUser) })

		mustRespondWithSignatures(function(url, opts) {
			return this.request(url, opts)
		})

		it("must respond with signature ASIC-E given parliament token",
			function*() {
			var initiative = initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				phase: "parliament",
				parliament_token: Crypto.randomBytes(12)
			}))

			var signatures = _.sortBy(signaturesDb.create([
				new ValidSignature({initiative_uuid: initiative.uuid}),
				new ValidSignature({initiative_uuid: initiative.uuid})
			]), "personal_id")

			var path = `/initiatives/${initiative.id}/signatures.asice`
			path += "?parliament-token=" + initiative.parliament_token.toString("hex")
			var res = yield this.request(path)

			res.statusCode.must.equal(200)
			res.headers["content-type"].must.equal(ASICE_TYPE)
			res.headers["content-disposition"].must.equal(
				"attachment; filename=\"signatures.asice\""
			)

			var zip = yield Zip.parse(Buffer.from(res.body))
			var entries = yield Zip.parseEntries(zip)

			entries.must.have.keys(_.concat(
				ASICE_FILES,
				"initiative.html",
				"META-INF/signatures-1.xml",
				"META-INF/signatures-2.xml"
			))

			var entry = yield Zip.readEntry(zip, entries["initiative.html"])
			String(entry).must.equal(initiative.text)

			;(yield Promise.all([
				Zip.readEntry(zip, entries["META-INF/signatures-1.xml"]),
				Zip.readEntry(zip, entries["META-INF/signatures-2.xml"]),
			])).map(String).must.eql(_.map(signatures, "xades"))
		})

		it("must ignore anonymized signatures", function*() {
			var initiative = initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				phase: "parliament",
				parliament_token: Crypto.randomBytes(12)
			}))

			signaturesDb.create(new ValidSignature({
				initiative_uuid: initiative.uuid,
				personal_id: "387",
				xades: null,
				token: null,
				anonymized: true
			}))

			var path = `/initiatives/${initiative.id}/signatures.asice`
			path += "?parliament-token=" + initiative.parliament_token.toString("hex")
			var res = yield this.request(path)

			res.statusCode.must.equal(200)
			res.headers["content-type"].must.equal(ASICE_TYPE)
			var zip = yield Zip.parse(Buffer.from(res.body))
			var entries = yield Zip.parseEntries(zip)
			entries.must.have.keys(_.concat(ASICE_FILES, "initiative.html"))

			var entry = yield Zip.readEntry(zip, entries["initiative.html"])
			String(entry).must.equal(initiative.text)
		})

		it("must respond if no signatures", function*() {
			var initiative = initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				phase: "parliament",
				parliament_token: Crypto.randomBytes(12)
			}))

			var path = `/initiatives/${initiative.id}/signatures.asice`
			path += "?parliament-token=" + initiative.parliament_token.toString("hex")
			var res = yield this.request(path)

			res.statusCode.must.equal(200)
			res.headers["content-type"].must.equal(ASICE_TYPE)
			var zip = yield Zip.parse(Buffer.from(res.body))
			var entries = yield Zip.parseEntries(zip)
			entries.must.have.keys(_.concat(ASICE_FILES, "initiative.html"))

			var entry = yield Zip.readEntry(zip, entries["initiative.html"])
			String(entry).must.equal(initiative.text)
		})

		it("must not include signatures from other initiatives", function*() {
			var other = initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				phase: "parliament"
			}))

			var initiative = initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				phase: "parliament",
				parliament_token: Crypto.randomBytes(12)
			}))

			signaturesDb.create(new ValidSignature({
				initiative_uuid: other.uuid
			}))

			var path = `/initiatives/${initiative.id}/signatures.asice`
			path += "?parliament-token=" + initiative.parliament_token.toString("hex")
			var res = yield this.request(path)

			res.statusCode.must.equal(200)
			res.headers["content-type"].must.equal(ASICE_TYPE)
			var zip = yield Zip.parse(Buffer.from(res.body))
			var entries = yield Zip.parseEntries(zip)
			entries.must.have.keys(_.concat(ASICE_FILES, "initiative.html"))
		})

		_.each({
			period: ".",
			exclamation: "!"
		}, function(punctuation, name) {
			it(`must respond with signatures given trailing ${name}`, function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "parliament",
					parliament_token: Crypto.randomBytes(12)
				}))

				var path = `/initiatives/${initiative.id}/signatures.asice`
				path += "?parliament-token="
				path += initiative.parliament_token.toString("hex")

				var res = yield this.request(path + punctuation)
				res.statusCode.must.equal(200)
				res.headers["content-type"].must.equal(ASICE_TYPE)
			})
		})

		describe("when destined for local", function() {
			beforeEach(function() {
				this.user = usersDb.create(new ValidUser)

				var auth = authenticationsDb.create(new ValidAuthentication({
					country: this.user.country,
					personal_id: this.user.personal_id
				}))

				var session = new ValidSession({
					user_id: this.user.id,
					authentication_id: auth.id
				})

				this.session = _.assign(sessionsDb.create(session), {
					token: session.token
				})

				this.initiative = initiativesDb.create(new ValidInitiative({
					destination: "muhu-vald",
					user_id: this.author.id,
					phase: "government",
					parliament_token: Crypto.randomBytes(12)
				}))
			})

			it("must respond with 401 Unauthenticated if not logged in", function*() {
				var path = `/initiatives/${this.initiative.id}/signatures.asice`
				var token = this.initiative.parliament_token.toString("hex")
				path += "?parliament-token=" + token

				var res = yield this.request(path)
				res.statusCode.must.equal(401)
				res.statusMessage.must.equal("Unauthorized")
			})

			it("must respond with 403 Forbidden if no signature trustees",
				function*() {
				var path = `/initiatives/${this.initiative.id}/signatures.asice`
				var token = this.initiative.parliament_token.toString("hex")
				path += "?parliament-token=" + token

				var res = yield this.request(path, {session: this.session})
				res.statusCode.must.equal(403)
				res.statusMessage.must.equal("Not a Permitted Downloader")
				res.headers["content-type"].must.equal("text/html; charset=utf-8")

				res.body.must.include(
					t("INITIATIVE_SIGNATURES_NOT_PERMITTED_DOWNLOADER")
				)
			})

			it("must respond with 403 Forbidden if another user in same country trustee", function*() {
				signatureTrusteesDb.create(new ValidSignatureTrustee({
					initiative_destination: "tallinn",
					country: this.user.country,
					created_by_id: this.user.id
				}))

				var path = `/initiatives/${this.initiative.id}/signatures.asice`
				var token = this.initiative.parliament_token.toString("hex")
				path += "?parliament-token=" + token

				var res = yield this.request(path, {session: this.session})
				res.statusCode.must.equal(403)
				res.statusMessage.must.equal("Not a Permitted Downloader")
			})

			it("must respond with 403 Forbidden if another user in another country country trustee", function*() {
				signatureTrusteesDb.create(new ValidSignatureTrustee({
					initiative_destination: "tallinn",
					country: "FI",
					personal_id: this.user.personal_id,
					name: this.user.name,
					created_by_id: this.user.id
				}))

				var path = `/initiatives/${this.initiative.id}/signatures.asice`
				var token = this.initiative.parliament_token.toString("hex")
				path += "?parliament-token=" + token

				var res = yield this.request(path, {session: this.session})
				res.statusCode.must.equal(403)
				res.statusMessage.must.equal("Not a Permitted Downloader")
			})

			it("must respond with 403 Forbidden if a signature trustee of another destination", function*() {
				signatureTrusteesDb.create(new ValidSignatureTrustee({
					initiative_destination: "tallinn",
					country: this.user.country,
					personal_id: this.user.personal_id,
					created_by_id: this.user.id
				}))

				var path = `/initiatives/${this.initiative.id}/signatures.asice`
				var token = this.initiative.parliament_token.toString("hex")
				path += "?parliament-token=" + token

				var res = yield this.request(path, {session: this.session})
				res.statusCode.must.equal(403)
				res.statusMessage.must.equal("Not a Permitted Downloader")
			})

			it("must respond with 403 Forbidden if trustee deleted", function*() {
				signatureTrusteesDb.create(new ValidSignatureTrustee({
					initiative_destination: this.initiative.destination,
					country: this.user.country,
					personal_id: this.user.personal_id,
					created_by_id: this.user.id,
					deleted_at: new Date,
					deleted_by_id: this.user.id
				}))

				var path = `/initiatives/${this.initiative.id}/signatures.asice`
				var token = this.initiative.parliament_token.toString("hex")
				path += "?parliament-token=" + token

				var res = yield this.request(path, {session: this.session})
				res.statusCode.must.equal(403)
				res.statusMessage.must.equal("Not a Permitted Downloader")
			})

			it("must respond with signatures if a signature trustee", function*() {
				signatureTrusteesDb.create([new ValidSignatureTrustee({
					initiative_destination: this.initiative.destination,
					country: this.user.country,
					created_by_id: this.user.id
				}), new ValidSignatureTrustee({
					initiative_destination: this.initiative.destination,
					country: this.user.country,
					personal_id: this.user.personal_id,
					created_by_id: this.user.id
				}), new ValidSignatureTrustee({
					initiative_destination: this.initiative.destination,
					country: this.user.country,
					created_by_id: this.user.id
				})])

				var path = `/initiatives/${this.initiative.id}/signatures.asice`
				var token = this.initiative.parliament_token.toString("hex")
				path += "?parliament-token=" + token

				var res = yield this.request(path, {session: this.session})
				res.statusCode.must.equal(200)
				res.headers["content-type"].must.equal(ASICE_TYPE)
			})
		})

		it("must not include the Estonian translation", function*() {
			var initiative = initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				phase: "parliament",
				parliament_token: Crypto.randomBytes(12),
				language: "en"
			}))

			textsDb.create(new ValidText({
				initiative_uuid: initiative.uuid,
				user_id: initiative.user_id,
				language: "et"
			}))

			var path = `/initiatives/${initiative.id}/signatures.asice`
			path += "?parliament-token=" + initiative.parliament_token.toString("hex")
			var res = yield this.request(path)

			res.statusCode.must.equal(200)
			res.headers["content-type"].must.equal(ASICE_TYPE)
			var zip = yield Zip.parse(Buffer.from(res.body))
			var entries = yield Zip.parseEntries(zip)
			entries.must.have.keys(_.concat(ASICE_FILES, "initiative.html"))
			var entry = yield Zip.readEntry(zip, entries["initiative.html"])
			String(entry).must.equal(initiative.text)
		})
	})

	describe(`GET / for ${CSV_TYPE}`, function() {
		beforeEach(function() { this.author = usersDb.create(new ValidUser) })

		mustRespondWithSignatures(function(url, opts) {
			return this.request(url.replace(/\.asice/, ".csv"), opts)
		})

		it("must respond with CSV of signatures given parliament token",
			function*() {
			var initiative = initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				phase: "parliament",
				parliament_token: Crypto.randomBytes(12)
			}))

			var citizenosSignatures = _.sortBy(citizenosSignaturesDb.create([
				new ValidCitizenosSignature({initiative_uuid: initiative.uuid}),
				new ValidCitizenosSignature({initiative_uuid: initiative.uuid}),
				new ValidCitizenosSignature({initiative_uuid: initiative.uuid})
			]), "personal_id")

			var undersignedSignatures = _.sortBy(signaturesDb.create([
				new ValidSignature({initiative_uuid: initiative.uuid}),
				new ValidSignature({initiative_uuid: initiative.uuid}),
				new ValidSignature({initiative_uuid: initiative.uuid})
			]), "personal_id")

			var path = `/initiatives/${initiative.id}/signatures.csv`
			path += "?parliament-token=" + initiative.parliament_token.toString("hex")
			var res = yield this.request(path)

			res.statusCode.must.equal(200)
			res.headers["content-type"].must.equal(CSV_TYPE)
			res.headers["content-disposition"].must.equal(
				"attachment; filename=\"signatures.csv\""
			)

			res.body.must.equal("personal_id,created_at\n" + _.concat(
				citizenosSignatures,
				undersignedSignatures
			).map((sig) => [
				sig.personal_id,
				sig.created_at.toISOString()
			].join(",") + "\n").join(""))
		})

		it("must ignore anonymized signatures", function*() {
			var initiative = initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				phase: "parliament",
				parliament_token: Crypto.randomBytes(12)
			}))

			citizenosSignaturesDb.create(new ValidCitizenosSignature({
				initiative_uuid: initiative.uuid,
				personal_id: "387",
				asic: null,
				anonymized: true
			}))

			signaturesDb.create(new ValidSignature({
				initiative_uuid: initiative.uuid,
				personal_id: "387",
				token: null,
				xades: null,
				anonymized: true
			}))

			var path = `/initiatives/${initiative.id}/signatures.csv`
			path += "?parliament-token=" + initiative.parliament_token.toString("hex")
			var res = yield this.request(path)

			res.statusCode.must.equal(200)
			res.headers["content-type"].must.equal(CSV_TYPE)
			res.body.must.equal("personal_id,created_at\n")
		})

		it("must respond if no signatures", function*() {
			var initiative = initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				phase: "parliament",
				parliament_token: Crypto.randomBytes(12)
			}))

			var path = `/initiatives/${initiative.id}/signatures.csv`
			path += "?parliament-token=" + initiative.parliament_token.toString("hex")
			var res = yield this.request(path)

			res.statusCode.must.equal(200)
			res.headers["content-type"].must.equal(CSV_TYPE)
			res.body.must.equal("personal_id,created_at\n")
		})

		it("must not respond with signatures of other initiatives", function*() {
			var initiative = initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				phase: "parliament",
				parliament_token: Crypto.randomBytes(12)
			}))

			var other = initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				phase: "parliament"
			}))

			signaturesDb.create(new ValidSignature({
				initiative_uuid: other.uuid
			}))

			var path = `/initiatives/${initiative.id}/signatures.csv`
			path += "?parliament-token=" + initiative.parliament_token.toString("hex")
			var res = yield this.request(path)

			res.statusCode.must.equal(200)
			res.headers["content-type"].must.equal(CSV_TYPE)
			res.body.must.equal("personal_id,created_at\n")
		})
	})

	describe(`GET /?type=citizenos for ${ZIP_TYPE}`, function() {
		beforeEach(function() { this.author = usersDb.create(new ValidUser) })

		mustRespondWithSignatures(function(url, opts) {
			url += (url.indexOf("?") >= 0 ? "&" : "?") + "type=citizenos"
			return this.request(url, opts)
		})

		it("must respond with signaturez in Zip given parliament token",
			function*() {
			var initiative = initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				phase: "parliament",
				parliament_token: Crypto.randomBytes(12)
			}))

			var aAsic = new Asic
			aAsic.add("initiative.html", initiative.text)
			aAsic = yield aAsic.toBuffer()

			var bAsic = new Asic
			bAsic.add("initiative.html", initiative.text)
			bAsic = yield bAsic.toBuffer()

			var signatures = _.sortBy(citizenosSignaturesDb.create([
				new ValidCitizenosSignature({
					initiative_uuid: initiative.uuid,
					asic: aAsic
				}),

				new ValidCitizenosSignature({
					initiative_uuid: initiative.uuid,
					asic: bAsic
				})
			]), "personal_id")

			var path = `/initiatives/${initiative.id}/signatures.zip?type=citizenos`
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
			var initiative = initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				phase: "parliament",
				parliament_token: Crypto.randomBytes(12)
			}))

			var path = `/initiatives/${initiative.id}/signatures.zip?type=citizenos`
			path += "&parliament-token=" + initiative.parliament_token.toString("hex")
			var res = yield this.request(path)

			res.statusCode.must.equal(200)
			res.headers["content-type"].must.equal(ZIP_TYPE)
			var zip = yield Zip.parse(Buffer.from(res.body))
			yield Zip.parseEntries(zip).must.then.be.empty()
		})

		it("must not include signatures from other initiatives", function*() {
			var initiative = initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				phase: "parliament",
				parliament_token: Crypto.randomBytes(12)
			}))

			var other = initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				phase: "parliament"
			}))

			var asic = new Asic
			asic.add("initiative.html", other.text)
			asic = yield asic.toBuffer()

			citizenosSignaturesDb.create(new ValidCitizenosSignature({
				initiative_uuid: other.uuid,
				asic: asic
			}))

			var path = `/initiatives/${initiative.id}/signatures.zip?type=citizenos`
			path += "&parliament-token=" + initiative.parliament_token.toString("hex")
			var res = yield this.request(path)

			res.statusCode.must.equal(200)
			res.headers["content-type"].must.equal(ZIP_TYPE)
			var zip = yield Zip.parse(Buffer.from(res.body))
			yield Zip.parseEntries(zip).must.then.be.empty()
		})

		it("must ignore anonymized signatures", function*() {
			var initiative = initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				phase: "parliament",
				parliament_token: Crypto.randomBytes(12)
			}))

			_.sortBy(citizenosSignaturesDb.create([
				new ValidCitizenosSignature({
					initiative_uuid: initiative.uuid,
					personal_id: "387",
					asic: null,
					anonymized: true
				})
			]), "personal_id")

			var path = `/initiatives/${initiative.id}/signatures.zip?type=citizenos`
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

		beforeEach(function() {
			this.author = usersDb.create(new ValidUser)

			this.initiative = initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				phase: "sign",
				title: "Hello, world!",
				signing_ends_at: DateFns.addDays(new Date, 1)
			}))
		})

		function mustSign(sign, assertError) {
			describe("as signable", function() {
				it("must respond with 405 if initiative not yet in sign phase",
					function*() {
					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: this.author.id,
						phase: "edit",
						published_at: new Date
					}))

					assertError(yield sign(this.router, this.request, initiative), {
						code: 405,
						message: "Signing Not Yet Started",
						description:
							t("creating_initiative_signature_page.errors.not_yet_started")
					})
				})

				it("must respond with 405 if initiative signing finished", function*() {
					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: this.author.id,
						phase: "sign",
						signing_ends_at: new Date
					}))

					assertError(yield sign(this.router, this.request, initiative), {
						code: 405,
						message: "Signing Ended",
						description:
							t("creating_initiative_signature_page.errors.signing_ended")
					})
				})

				it("must respond with 405 if initiative signing expired", function*() {
					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: this.author.id,
						phase: "sign",
						signing_ends_at: DateFns.addDays(new Date, 1),
						signing_expired_at: new Date
					}))

					assertError(yield sign(this.router, this.request, initiative), {
						code: 405,
						message: "Signing Ended",
						description: t("creating_initiative_signature_page.errors.signing_ended")
					})
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

						extensions: SIGN_CERTIFICATE_EXTENSIONS,
						issuer: issuer,
						publicKey: JOHN_RSA_KEYS.publicKey
					}))

					var res = yield sign(this.router, this.request, this.initiative, cert)

					assertError(res, {
						code: 422,
						message: "Invalid Issuer",
						description: t("eid_view.errors.invalid_issuer")
					})
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

						extensions: SIGN_CERTIFICATE_EXTENSIONS,
						validFrom: DateFns.addSeconds(new Date, 1),
						issuer: VALID_ISSUERS[0],
						publicKey: JOHN_RSA_KEYS.publicKey
					}))

					var res = yield sign(this.router, this.request, this.initiative, cert)

					assertError(res, {
						code: 422,
						message: "Certificate Not Yet Valid",
						description: t("eid_view.errors.certificate_not_yet_valid")
					})
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

						extensions: SIGN_CERTIFICATE_EXTENSIONS,
						validUntil: new Date,
						issuer: VALID_ISSUERS[0],
						publicKey: JOHN_RSA_KEYS.publicKey
					}))

					var res = yield sign(this.router, this.request, this.initiative, cert)

					assertError(res, {
						code: 422,
						message: "Certificate Expired",
						description: t("eid_view.errors.certificate_expired")
					})
				})

				it("must respond with 422 given non-sign certificate", function*() {
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

						extensions: [{
							extnID: "keyUsage",
							critical: true,
							extnValue: {data: Buffer.from([KEY_USAGE_DIGITAL_SIGNATURE])}
						}],

						issuer: VALID_ISSUERS[0],
						publicKey: JOHN_RSA_KEYS.publicKey
					}))

					var res = yield sign(this.router, this.request, this.initiative, cert)

					assertError(res, {
						code: 422,
						message: "Not Signing Certificate",
						description: t("eid_view.errors.certificate_not_for_sign")
					})
				})

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

						extensions: SIGN_CERTIFICATE_EXTENSIONS,
						issuer: VALID_ISSUERS[0],
						publicKey: JOHN_RSA_KEYS.publicKey
					}))

					var signed = yield sign(
						this.router,
						this.request,
						this.initiative,
						cert
					)

					signed.statusCode.must.equal(303)
					signed.statusMessage.must.match(/^Signed with /)

					var signature = signaturesDb.read(sql`
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

							extensions: SIGN_CERTIFICATE_EXTENSIONS,
							issuer: issuer,
							publicKey: JOHN_RSA_KEYS.publicKey
						}))

						var res = yield sign(
							this.router,
							this.request,
							this.initiative,
							cert
						)

						res.statusCode.must.equal(303)
						res.statusMessage.must.match(/^Signed with /)

						signaturesDb.search(sql`
							SELECT * FROM initiative_signatures
						`).must.not.be.empty()
					})
				})

				it("must thank after signing", function*() {
					var signed = yield sign(this.router, this.request, this.initiative)
					signed.statusCode.must.equal(303)
					signed.statusMessage.must.match(/^Signed with /)

					var cookies = parseCookies(signed.headers["set-cookie"])
					var res = yield this.request(signed.headers.location, {
						headers: {Cookie: serializeCookies(cookies)}
					})

					res.statusCode.must.equal(200)
					res.body.must.include(t("initiative_page.thanks_section.title"))
					res.body.must.not.include(t("initiative_page.thanks_section.title_when_overwritten"))
					res.body.must.include(t("REVOKE_SIGNATURE"))
					res.body.must.include("donate-form")
				})

				it("must create a signature and thank after signing again",
					function*() {
					var oldSignature = signaturesDb.create(new ValidSignature({
						initiative_uuid: this.initiative.uuid,
						country: "EE",
						personal_id: ADULT_PERSONAL_ID
					}))

					var signed = yield sign(this.router, this.request, this.initiative)
					signed.statusCode.must.equal(303)
					signed.statusMessage.must.match(/^Signed with /)

					var cookies = parseCookies(signed.headers["set-cookie"])
					var res = yield this.request(signed.headers.location, {
						headers: {Cookie: serializeCookies(cookies)}
					})

					res.statusCode.must.equal(200)
					res.body.must.include(t("initiative_page.thanks_section.title_when_overwritten"))
					res.body.must.include(t("REVOKE_SIGNATURE"))
					res.body.must.include("donate-form")

					signaturesDb.search(sql`
						SELECT * FROM initiative_signatures
					`).must.not.eql([oldSignature])
				})

				it("must create a signature and thank after oversigning a CitizenOS signature", function*() {
					citizenosSignaturesDb.create(
						new ValidCitizenosSignature({
							initiative_uuid: this.initiative.uuid,
							country: "EE",
							personal_id: ADULT_PERSONAL_ID
						})
					)

					var signed = yield sign(this.router, this.request, this.initiative)
					signed.statusCode.must.equal(303)
					signed.statusMessage.must.match(/^Signed with /)

					var cookies = parseCookies(signed.headers["set-cookie"])
					var res = yield this.request(signed.headers.location, {
						headers: {Cookie: serializeCookies(cookies)}
					})

					res.statusCode.must.equal(200)
					res.body.must.include(t("initiative_page.thanks_section.title_when_overwritten"))
					res.body.must.include(t("REVOKE_SIGNATURE"))
					res.body.must.include("donate-form")

					citizenosSignaturesDb.search(sql`
						SELECT * FROM initiative_citizenos_signatures
					`).must.be.empty()

					signaturesDb.search(sql`
						SELECT * FROM initiative_signatures
					`).must.not.be.empty()
				})

				it("must create a signature and thank after signing if previously hidden", function*() {
					var oldSignature = signaturesDb.create(new ValidSignature({
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

					var signed = yield sign(this.router, this.request, this.initiative)
					signed.statusCode.must.equal(303)
					signed.statusMessage.must.match(/^Signed with /)

					var cookies = parseCookies(signed.headers["set-cookie"])
					var res = yield this.request(signed.headers.location, {
						headers: {Cookie: serializeCookies(cookies)}
					})

					res.statusCode.must.equal(200)
					res.body.must.include(t("initiative_page.thanks_section.title"))
					res.body.must.not.include(t("initiative_page.thanks_section.title_when_overwritten"))
					res.body.must.include(t("REVOKE_SIGNATURE"))
					res.body.must.include("donate-form")

					var signatures = signaturesDb.search(sql`
						SELECT * FROM initiative_signatures
					`)

					signatures.length.must.equal(1)
					signatures[0].must.not.eql([oldSignature])
					signatures[0].hidden.must.be.false()
				})

				it("must not affect signature on another initiative", function*() {
					var otherInitiative = initiativesDb.create(
						new ValidInitiative({user_id: this.author.id, phase: "sign"})
					)

					var signature = signaturesDb.create(new ValidSignature({
						initiative_uuid: otherInitiative.uuid,
						country: "EE",
						personal_id: ADULT_PERSONAL_ID
					}))

					var signed = yield sign(this.router, this.request, this.initiative)
					signed.statusCode.must.equal(303)
					signed.statusMessage.must.match(/^Signed with /)

					var cookies = parseCookies(signed.headers["set-cookie"])
					var res = yield this.request(signed.headers.location, {
						headers: {Cookie: serializeCookies(cookies)}
					})

					res.statusCode.must.equal(200)
					res.body.must.include(t("initiative_page.thanks_section.title"))
					res.body.must.not.include(t("initiative_page.thanks_section.title_when_overwritten"))

					var signatures = signaturesDb.search(sql`
						SELECT * FROM initiative_signatures
						ORDER BY updated_at
					`)

					signatures.length.must.equal(2)
					signatures[0].must.eql(signature)
				})

				it("must not affect CitizenOS signature on another initiative",
					function*() {
					var otherInitiative = initiativesDb.create(
						new ValidInitiative({user_id: this.author.id, phase: "sign"})
					)

					var signature = citizenosSignaturesDb.create(
						new ValidCitizenosSignature({
							initiative_uuid: otherInitiative.uuid,
							country: "EE",
							personal_id: ADULT_PERSONAL_ID
						})
					)

					var signed = yield sign(this.router, this.request, this.initiative)
					signed.statusCode.must.equal(303)
					signed.statusMessage.must.match(/^Signed with /)

					var cookies = parseCookies(signed.headers["set-cookie"])
					var res = yield this.request(signed.headers.location, {
						headers: {Cookie: serializeCookies(cookies)}
					})

					res.statusCode.must.equal(200)
					res.body.must.include(t("initiative_page.thanks_section.title"))
					res.body.must.not.include(t("initiative_page.thanks_section.title_when_overwritten"))

					citizenosSignaturesDb.search(sql`
						SELECT * FROM initiative_citizenos_signatures
					`).must.eql([signature])

					signaturesDb.search(sql`
						SELECT * FROM initiative_signatures
						ORDER BY created_at
					`).must.not.be.empty()
				})

				it("must not affect signature of another user", function*() {
					var signature = signaturesDb.create(new ValidSignature({
						initiative_uuid: this.initiative.uuid,
						country: "EE",
						personal_id: "70001019906"
					}))

					var signed = yield sign(this.router, this.request, this.initiative)
					signed.statusCode.must.equal(303)
					signed.statusMessage.must.match(/^Signed with /)

					var cookies = parseCookies(signed.headers["set-cookie"])
					var res = yield this.request(signed.headers.location, {
						headers: {Cookie: serializeCookies(cookies)}
					})

					res.statusCode.must.equal(200)
					res.body.must.include(t("initiative_page.thanks_section.title"))
					res.body.must.not.include(t("initiative_page.thanks_section.title_when_overwritten"))

					var signatures = signaturesDb.search(sql`
						SELECT * FROM initiative_signatures
						ORDER BY created_at
					`)

					signatures.length.must.equal(2)
					signatures[0].must.eql(signature)
				})

				it("must not affect CitizenOS signature of another user", function*() {
					var signature = citizenosSignaturesDb.create(
						new ValidCitizenosSignature({
							initiative_uuid: this.initiative.uuid,
							country: "EE",
							personal_id: "70001019906"
						})
					)

					var signed = yield sign(this.router, this.request, this.initiative)
					signed.statusCode.must.equal(303)
					signed.statusMessage.must.match(/^Signed with /)

					var cookies = parseCookies(signed.headers["set-cookie"])
					var res = yield this.request(signed.headers.location, {
						headers: {Cookie: serializeCookies(cookies)}
					})

					res.statusCode.must.equal(200)
					res.body.must.include(t("initiative_page.thanks_section.title"))
					res.body.must.not.include(t("initiative_page.thanks_section.title_when_overwritten"))

					citizenosSignaturesDb.search(sql`
						SELECT * FROM initiative_citizenos_signatures
					`).must.eql([signature])

					signaturesDb.search(sql`
						SELECT * FROM initiative_signatures
						ORDER BY created_at
					`).must.not.be.empty()
				})

				it("must not affect signature of another country", function*() {
					var signature = signaturesDb.create(new ValidSignature({
						initiative_uuid: this.initiative.uuid,
						country: "LT",
						personal_id: ADULT_PERSONAL_ID
					}))

					var signed = yield sign(this.router, this.request, this.initiative)
					signed.statusCode.must.equal(303)
					signed.statusMessage.must.match(/^Signed with /)

					var cookies = parseCookies(signed.headers["set-cookie"])
					var res = yield this.request(signed.headers.location, {
						headers: {Cookie: serializeCookies(cookies)}
					})

					res.statusCode.must.equal(200)
					res.body.must.include(t("initiative_page.thanks_section.title"))
					res.body.must.not.include(t("initiative_page.thanks_section.title_when_overwritten"))

					var signatures = signaturesDb.search(sql`
						SELECT * FROM initiative_signatures
						ORDER BY created_at
					`)

					signatures.length.must.equal(2)
					signatures[0].must.eql(signature)
				})

				it("must not affect CitizenOS signature of another country",
					function*() {
					var signature = citizenosSignaturesDb.create(
						new ValidCitizenosSignature({
							initiative_uuid: this.initiative.uuid,
							country: "LT",
							personal_id: ADULT_PERSONAL_ID
						})
					)

					var signed = yield sign(this.router, this.request, this.initiative)
					signed.statusCode.must.equal(303)
					signed.statusMessage.must.match(/^Signed with /)

					var cookies = parseCookies(signed.headers["set-cookie"])
					var res = yield this.request(signed.headers.location, {
						headers: {Cookie: serializeCookies(cookies)}
					})

					res.statusCode.must.equal(200)
					res.body.must.include(t("initiative_page.thanks_section.title"))
					res.body.must.not.include(t("initiative_page.thanks_section.title_when_overwritten"))

					citizenosSignaturesDb.search(sql`
						SELECT * FROM initiative_citizenos_signatures
					`).must.eql([signature])

					signaturesDb.search(sql`
						SELECT * FROM initiative_signatures
						ORDER BY created_at
					`).must.not.be.empty()
				})
			})
		}

		function mustRateLimit(sign, assertOk, assertError) {
			describe("as a rate limited endpoint", function() {
				it(`must respond with error if created ${SIGN_RATE} signables in the last ${SIGN_RATE_IN_MINUTES}m`, function*() {
					signablesDb.create(_.times(SIGN_RATE, (_i) => new ValidSignable({
						initiative_uuid: this.initiative.uuid,
						country: "EE",
						personal_id: ADULT_PERSONAL_ID,
						method: "mobile-id",
						created_at: DateFns.addSeconds(DateFns.addMinutes(new Date, -SIGN_RATE_IN_MINUTES), 1),
					})))

					assertError(yield sign(
						this.router,
						this.request,
						this.initiative
					), {
						code: 429,
						message: "Too Many Incomplete Signatures",
						description: t("eid_view.errors.sign_rate_limit", {minutes: 1})
					})

					signablesDb.read(sql`
						SELECT COUNT(*) AS count FROM initiative_signables
					`).count.must.equal(SIGN_RATE)
				})

				it(`must not respond with error if created ${SIGN_RATE} signed signables in the last ${SIGN_RATE_IN_MINUTES}m`, function*() {
					signablesDb.create(_.times(SIGN_RATE, (_i) =>
						new ValidSignable({
							initiative_uuid: this.initiative.uuid,
							country: "EE",
							personal_id: ADULT_PERSONAL_ID,
							method: "mobile-id",
							created_at: new Date,
							signed: true
						})
					))

					assertOk(yield sign(this.router, this.request, this.initiative))
				})

				it(`must not respond with error if created <${SIGN_RATE} signables in the last ${SIGN_RATE_IN_MINUTES}m`, function*() {
					signablesDb.create(_.times(SIGN_RATE - 1, (_i) =>
						new ValidSignable({
							initiative_uuid: this.initiative.uuid,
							country: "EE",
							personal_id: ADULT_PERSONAL_ID,
							method: "mobile-id",
							created_at: DateFns.addSeconds(DateFns.addMinutes(new Date, -SIGN_RATE_IN_MINUTES), 1),
						})
					))

					assertOk(yield sign(this.router, this.request, this.initiative))
				})

				it(`must not respond with error if created ${SIGN_RATE} signables earlier than ${SIGN_RATE_IN_MINUTES}m`, function*() {
					signablesDb.create(_.times(SIGN_RATE - 1, (_i) =>
						new ValidSignable({
							initiative_uuid: this.initiative.uuid,
							country: "EE",
							personal_id: ADULT_PERSONAL_ID,
							method: "mobile-id",
							created_at: DateFns.addMinutes(new Date, -SIGN_RATE_IN_MINUTES),
						})
					))

					assertOk(yield sign(this.router, this.request, this.initiative))
				})
			})
		}

		describe("when signing via ID-card", function() {
			function assertOk(res) {
				res.statusCode.must.equal(204)
				res.statusMessage.must.equal("Signed with ID-card")
			}

			function assertError(res, obj) {
				res.statusCode.must.equal(obj.code)
				res.statusMessage.must.equal(obj.message)
				res.headers["content-type"].must.equal(ERROR_TYPE)
				res.body.must.eql(obj)
			}

			mustSign((router, request, initiative, cert) => (
				signWithIdCard(router, request, initiative, cert || ID_CARD_CERTIFICATE)
			), assertError)

			it("must create a signature and update initiative", function*() {
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

					extensions: SIGN_CERTIFICATE_EXTENSIONS,
					issuer: VALID_ISSUERS[0],
					publicKey: JOHN_RSA_KEYS.publicKey
				}))

				var path = `/initiatives/${this.initiative.id}`
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
				signing.statusMessage.must.equal("Signing with ID-card")
				signing.headers["content-type"].must.equal(SIGNABLE_TYPE)

				var xades = hades.new(cert, [{
					path: "initiative.html",
					type: "text/html",
					hash: this.initiative.text_sha256
				}])

				signing.body.must.eql(xades.signableHash)

				var signables = signablesDb.search(sql`
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

				signaturesDb.search(sql`
					SELECT * FROM initiative_signatures
				`).must.be.empty()

				var signatureBytes = hashAndSignWithRsa(
					JOHN_RSA_KEYS.privateKey,
					xades.signable
				)

				xades.setSignature(signatureBytes)
				var timestampResponse = Timestamp.parse(newTimestampResponse())
				xades.setTimestamp(timestampResponse)
				var ocspResponse = Ocsp.parse(newOcspResponse(cert))
				xades.setOcspResponse(ocspResponse)

				this.router.post(TIMESTAMP_URL.path, function(req, res) {
					req.headers.host.must.equal(TIMESTAMP_URL.host)
					res.setHeader("Content-Type", "application/timestamp-reply")
					res.end(timestampResponse.toBuffer())
				})

				this.router.post(OCSP_URL.path, function(req, res) {
					req.headers.host.must.equal(OCSP_URL.host)
					res.setHeader("Content-Type", "application/ocsp-response")
					res.end(ocspResponse.toBuffer())
				})

				var signed = yield this.request(signing.headers.location, {
					method: "PUT",

					headers: {
						Accept: `application/x-empty, ${ERROR_TYPE}`,
						"Content-Type": SIGNATURE_TYPE
					},

					body: signatureBytes
				})

				signed.statusCode.must.equal(204)
				signed.statusMessage.must.equal("Signed with ID-card")
				signed.headers.location.must.equal(path)

				signaturesDb.search(sql`
					SELECT * FROM initiative_signatures
				`).must.eql([new ValidSignature({
					id: 1,
					initiative_uuid: this.initiative.uuid,
					token: signables[0].token,
					country: "EE",
					personal_id: ADULT_PERSONAL_ID,
					method: "id-card",
					xades: String(xades),
					created_from: LONDON_GEO
				})])

				initiativesDb.read(this.initiative).must.eql(_.defaults({
					last_signature_created_at: new Date
				}, this.initiative))
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

					extensions: SIGN_CERTIFICATE_EXTENSIONS,
					issuer: VALID_ISSUERS[0],
					publicKey: JOHN_RSA_KEYS.publicKey
				}))

				var initiativePath = `/initiatives/${this.initiative.id}`
				var res = yield this.request(`${initiativePath}/signatures`, {
					method: "POST",

					headers: {
						Accept: `${SIGNABLE_TYPE}, ${ERROR_TYPE}`,
						"Content-Type": CERTIFICATE_TYPE
					},

					body: cert.toBuffer()
				})

				assertError(res, {
					code: 422,
					message: "Too Young",
					description: t("creating_initiative_signature_page.errors.too_young")
				})
			})

			_.each({
				RSA: [JOHN_RSA_KEYS, hashAndSignWithRsa],
				ECDSA: [JOHN_ECDSA_KEYS, hashAndSignWithEcdsa]
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

						extensions: SIGN_CERTIFICATE_EXTENSIONS,
						issuer: VALID_ISSUERS[0],
						publicKey: keys.publicKey
					}))

					var initiativePath = `/initiatives/${this.initiative.id}`
					var signing = yield this.request(`${initiativePath}/signatures`, {
						method: "POST",
						headers: {Accept: SIGNABLE_TYPE, "Content-Type": CERTIFICATE_TYPE},
						body: cert.toBuffer()
					})

					signing.statusCode.must.equal(202)
					signing.statusMessage.must.equal("Signing with ID-card")

					var {xades} = signablesDb.read(sql`
						SELECT * FROM initiative_signables
					`)

					this.router.post(TIMESTAMP_URL.path, function(req, res) {
						req.headers.host.must.equal(TIMESTAMP_URL.host)
						res.setHeader("Content-Type", "application/timestamp-reply")
						res.end(newTimestampResponse())
					})

					this.router.post(OCSP_URL.path, function(req, res) {
						req.headers.host.must.equal(OCSP_URL.host)
						res.setHeader("Content-Type", "application/ocsp-response")
						res.end(newOcspResponse(cert))
					})

					assertOk(yield this.request(signing.headers.location, {
						method: "PUT",

						headers: {
							Accept: `application/x-empty, ${ERROR_TYPE}`,
							"Content-Type": SIGNATURE_TYPE
						},

						body: sign(keys.privateKey, xades.signable)
					}))
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

						extensions: SIGN_CERTIFICATE_EXTENSIONS,
						issuer: VALID_ISSUERS[0],
						publicKey: keys.publicKey
					}))

					var initiativePath = `/initiatives/${this.initiative.id}`
					var signing = yield this.request(`${initiativePath}/signatures`, {
						method: "POST",
						headers: {Accept: SIGNABLE_TYPE, "Content-Type": CERTIFICATE_TYPE},
						body: cert.toBuffer()
					})

					signing.statusCode.must.equal(202)
					signing.statusMessage.must.equal("Signing with ID-card")

					var res = yield this.request(signing.headers.location, {
						method: "PUT",

						headers: {
							Accept: `application/x-empty, ${ERROR_TYPE}`,
							"Content-Type": SIGNATURE_TYPE
						},

						body: Crypto.randomBytes(64)
					})

					assertError(res, {
						code: 409,
						message: "Invalid Signature",
						description: t("eid_view.id_card_errors.sign_invalid_signature")
					})

					signaturesDb.search(sql`
						SELECT * FROM initiative_signatures
					`).must.be.empty()
				})
			})

			it("must accept signature after deadline passed", function*() {
				var cert = ID_CARD_CERTIFICATE
				var initiativePath = `/initiatives/${this.initiative.id}`
				var signing = yield this.request(`${initiativePath}/signatures`, {
					method: "POST",
					headers: {Accept: SIGNABLE_TYPE, "Content-Type": CERTIFICATE_TYPE},
					body: cert.toBuffer()
				})

				signing.statusCode.must.equal(202)
				signing.statusMessage.must.equal("Signing with ID-card")

				var {xades} = signablesDb.read(sql`SELECT * FROM initiative_signables`)

				this.router.post(TIMESTAMP_URL.path, function(req, res) {
					req.headers.host.must.equal(TIMESTAMP_URL.host)
					res.setHeader("Content-Type", "application/timestamp-reply")
					res.end(newTimestampResponse())
				})

				this.router.post(OCSP_URL.path, function(req, res) {
					req.headers.host.must.equal(OCSP_URL.host)
					res.setHeader("Content-Type", "application/ocsp-response")
					res.end(newOcspResponse(cert))
				})

				initiativesDb.update(this.initiative, {signing_ends_at: new Date})

				var signed = yield this.request(signing.headers.location, {
					method: "PUT",

					headers: {
						Accept: `application/x-empty, ${ERROR_TYPE}`,
						"Content-Type": SIGNATURE_TYPE
					},

					body: hashAndSignWithRsa(JOHN_RSA_KEYS.privateKey, xades.signable)
				})

				assertOk(signed)
			})

			it("must reject signature if initiative not in sign phase", function*() {
				var initiativePath = `/initiatives/${this.initiative.id}`
				var signing = yield this.request(`${initiativePath}/signatures`, {
					method: "POST",
					headers: {Accept: SIGNABLE_TYPE, "Content-Type": CERTIFICATE_TYPE},
					body: ID_CARD_CERTIFICATE.toBuffer()
				})

				signing.statusCode.must.equal(202)
				signing.statusMessage.must.equal("Signing with ID-card")

				initiativesDb.update(this.initiative, {
					phase: "parliament",
					signing_ends_at: new Date
				})

				var signed = yield this.request(signing.headers.location, {
					method: "PUT",

					headers: {
						Accept: `application/x-empty, ${ERROR_TYPE}`,
						"Content-Type": SIGNATURE_TYPE
					}
				})

				assertError(signed, {
					code: 405,
					message: "Signing Ended",

					description:
						t("creating_initiative_signature_page.errors.signing_ended")
				})
			})
		})

		describe("when signing via Mobile-ID", function() {
			describe("when without JavaScript", function() {
				function assertOk(res) {
					res.statusCode.must.equal(303)
					res.statusMessage.must.equal("Signed with Mobile-ID")
				}

				function assertError(res, obj) {
					res.statusCode.must.equal(obj.code)
					res.statusMessage.must.equal(obj.message)
					res.headers["content-type"].must.equal(HTML_TYPE)

					var el = parseHtml(res.body).querySelector("#error .description")
					el.textContent.must.equal(obj.description)
				}

				mustSign((router, request, initiative, cert) => signWithMobileId(
					router,
					request,
					initiative,
					cert || MOBILE_ID_CERTIFICATE
				), assertError)

				mustSignWithMobileId(signWithMobileId, assertOk, assertError)

				mustRateLimit((router, request, initiative) => (
					signWithMobileId(router, request, initiative, MOBILE_ID_CERTIFICATE)
				), assertOk, assertError)

				it("must create a signature and update initiative", function*() {
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

						extensions: SIGN_CERTIFICATE_EXTENSIONS,
						issuer: VALID_ISSUERS[0],
						publicKey: JOHN_RSA_KEYS.publicKey
					}))

					var [
						xades,
						tsResponse,
						ocspResponse
					] = newXades(this.initiative, cert)

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

					this.router.post(TIMESTAMP_URL.path, function(req, res) {
						req.headers.host.must.equal(TIMESTAMP_URL.host)
						res.setHeader("Content-Type", "application/timestamp-reply")
						res.end(tsResponse.toBuffer())
					})

					this.router.post(OCSP_URL.path, function(req, res) {
						req.headers.host.must.equal(OCSP_URL.host)
						res.setHeader("Content-Type", "application/ocsp-response")
						res.flushHeaders()

						// NOTE: Respond with a little delay to ensure waiting for signable
						// works as expected.
						setTimeout(() => res.end(ocspResponse.toBuffer()), 100)
					})

					var initiativePath = `/initiatives/${this.initiative.id}`
					var signing = yield this.request(initiativePath + "/signatures", {
						method: "POST",
						headers: {"X-Forwarded-For": LONDON_FORWARDED_FOR},

						form: {
							method: "mobile-id",
							"personal-id": ADULT_PERSONAL_ID,
							"phone-number": "+37200000766"
						}
					})

					var verificationCode =
						padVerificationCode(MobileId.verification(xades.signableHash))

					signing.statusCode.must.equal(202)
					signing.statusMessage.must.equal("Signing with Mobile-ID")
					signing.headers["content-type"].must.equal(HTML_TYPE)
					signing.headers["x-verification-code"].must.equal(verificationCode)

					var waitUrl = parseRefreshHeader(signing.headers.refresh)[1]
					var waiting = yield this.request(waitUrl)
					waiting.statusCode.must.equal(202)
					waiting.statusMessage.must.equal("Waiting for Mobile-ID")
					waiting.headers["content-type"].must.equal(HTML_TYPE)
					waiting.headers["x-verification-code"].must.equal(verificationCode)

					yield _.sleep(100)

					waitUrl = parseRefreshHeader(waiting.headers.refresh)[1]
					var signed = yield this.request(waitUrl)
					signed.statusCode.must.equal(303)
					signed.statusMessage.must.equal("Signed with Mobile-ID")
					signed.headers.location.must.equal(initiativePath + "-hello-world")

					var signables = signablesDb.search(sql`
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

					signaturesDb.search(sql`
						SELECT * FROM initiative_signatures
					`).must.eql([new ValidSignature({
						id: 1,
						initiative_uuid: this.initiative.uuid,
						token: signables[0].token,
						country: "EE",
						personal_id: ADULT_PERSONAL_ID,
						method: "mobile-id",
						xades: String(xades),
						created_from: LONDON_GEO
					})])

					initiativesDb.read(this.initiative).must.eql(_.defaults({
						last_signature_created_at: new Date
					}, this.initiative))
				})

				it("must respond with 422 given invalid personal id", function*() {
					var path = `/initiatives/${this.initiative.id}`
					var res = yield this.request(path + "/signatures", {
						method: "POST",
						form: {
							method: "mobile-id",
							"personal-id": ADULT_PERSONAL_ID + "666",
							"phone-number": "+37200000766"
						}
					})

					assertError(res, {
						code: 422,
						message: "Invalid Personal Id",
						description: t("eid_view.errors.invalid_personal_id")
					})

					signablesDb.search(sql`
						SELECT * FROM initiative_signables
					`).must.be.empty()
				})

				it("must respond with 422 given underage signer", function*() {
					var initiativePath = `/initiatives/${this.initiative.id}`
					var res = yield this.request(initiativePath + "/signatures", {
						method: "POST",
						form: {
							method: "mobile-id",
							"personal-id": CHILD_PERSONAL_ID,
							"phone-number": "+37200000766"
						}
					})

					assertError(res, {
						code: 422,
						message: "Too Young",
						description:
							t("creating_initiative_signature_page.errors.too_young")
					})
				})

				_.each(PERSONAL_ID_TRANSFORMS, function(to, from) {
					it(`must transform Mobile-ID personal id ${from} to ${to}`,
						function*() {
						var created = 0

						this.router.post(`${MOBILE_ID_URL.path}certificate`, (req, res) => {
							++created
							req.body.phoneNumber.must.equal("+37200000766")
							req.body.nationalIdentityNumber.must.equal(to)
							respond({result: "NOT_FOUND"}, req, res)
						})

						var path = `/initiatives/${this.initiative.id}`
						var res = yield this.request(path + "/signatures", {
							method: "POST",
							form: {
								method: "mobile-id",
								"personal-id": from,
								"phone-number": "+37200000766"
							}
						})

						created.must.equal(1)

						assertError(res, {
							code: 422,
							message: "Not a Mobile-ID User",
							description: t("eid_view.mobile_id_errors.not_found")
						})
					})
				})

				_.each(PHONE_NUMBER_TRANSFORMS, function(to, from) {
					it(`must transform Mobile-ID number ${from} to ${to}`,
						function*() {
						var created = 0
						this.router.post(`${MOBILE_ID_URL.path}certificate`, (req, res) => {
							++created
							req.body.phoneNumber.must.equal(to)
							req.body.nationalIdentityNumber.must.equal(ADULT_PERSONAL_ID)
							respond({result: "NOT_FOUND"}, req, res)
						})

						var path = `/initiatives/${this.initiative.id}`
						var res = yield this.request(path + "/signatures", {
							method: "POST",
							form: {
								method: "mobile-id",
								"personal-id": ADULT_PERSONAL_ID,
								"phone-number": from
							}
						})

						created.must.equal(1)

						assertError(res, {
							code: 422,
							message: "Not a Mobile-ID User",
							description: t("eid_view.mobile_id_errors.not_found")
						})
					})
				})
			})

			describe("when with JavaScript", function() {
				function assertOk(res) {
					res.statusCode.must.equal(200)
					res.statusMessage.must.equal("Signed with Mobile-ID")
					res.headers["content-type"].must.equal(JSON_TYPE)
					res.body.must.eql({state: "DONE"})
				}

				function assertError(res, obj) {
					res.statusCode.must.equal(obj.code)
					res.statusMessage.must.equal(obj.message)
					res.headers["content-type"].must.equal(ERROR_TYPE)
					res.body.must.eql(obj)
				}

				mustSign(function*(router, request, initiative, cert) {
					var res = yield signWithMobileId(
						router,
						request,
						initiative,
						cert || MOBILE_ID_CERTIFICATE,
						null,
						{Accept: `${JSON_TYPE}, ${ERROR_TYPE}`}
					)

					if (!(res.statusCode >= 200 && res.statusCode < 300)) return res
					return request(res.headers.location)
				}, assertError)

				mustSignWithMobileId((router, request, initiative, cert, session) => (
					signWithMobileId(router, request, initiative, cert, session, {
						Accept: `${JSON_TYPE}, ${ERROR_TYPE}`
					})
				), assertOk, assertError)

				mustRateLimit((router, request, initiative) => signWithMobileId(
					router,
					request,
					initiative,
					MOBILE_ID_CERTIFICATE,
					null,
					{Accept: `${JSON_TYPE}, ${ERROR_TYPE}`}
				), assertOk, assertError)

				it("must create a signature and update initiative", function*() {
					var [
						xades,
						tsResponse,
						ocspResponse
					] = newXades(this.initiative, MOBILE_ID_CERTIFICATE)

					this.router.post(
						`${MOBILE_ID_URL.path}certificate`,
						respond.bind(null, {
							result: "OK",
							cert: MOBILE_ID_CERTIFICATE.toString("base64")
						})
					)

					this.router.post(
						`${MOBILE_ID_URL.path}signature`,
						respond.bind(null, {sessionID: SESSION_ID})
					)

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

					this.router.post(TIMESTAMP_URL.path, function(req, res) {
						req.headers.host.must.equal(TIMESTAMP_URL.host)
						res.setHeader("Content-Type", "application/timestamp-reply")
						res.end(tsResponse.toBuffer())
					})

					this.router.post(OCSP_URL.path, function(req, res) {
						req.headers.host.must.equal(OCSP_URL.host)
						res.setHeader("Content-Type", "application/ocsp-response")
						res.flushHeaders()

						// NOTE: Respond with a little delay to ensure waiting for signable
						// works as expected.
						setTimeout(() => res.end(ocspResponse.toBuffer()), 100)
					})

					var initiativePath = `/initiatives/${this.initiative.id}`
					var signing = yield this.request(initiativePath + "/signatures", {
						method: "POST",

						headers: {
							Accept: `${EMPTY_TYPE}, ${ERROR_TYPE}`,
							"X-Forwarded-For": LONDON_FORWARDED_FOR
						},

						form: {
							method: "mobile-id",
							"personal-id": ADULT_PERSONAL_ID,
							"phone-number": "+37200000766"
						}
					})

					var verificationCode =
						padVerificationCode(MobileId.verification(xades.signableHash))

					signing.statusCode.must.equal(202)
					signing.statusMessage.must.equal("Signing with Mobile-ID")
					signing.headers.must.not.have.property("content-type")
					signing.headers["x-verification-code"].must.equal(verificationCode)

					var waitUrl = parseRefreshHeader(signing.headers.refresh)[1]
					var waiting = yield this.request(waitUrl, {
						headers: {Accept: `${JSON_TYPE}, ${ERROR_TYPE}`}
					})

					waiting.statusCode.must.equal(200)
					waiting.statusMessage.must.equal("Signed with Mobile-ID")
					waiting.headers["content-type"].must.equal(JSON_TYPE)
					waiting.headers.must.not.have.property("x-verification-code")
					waiting.headers.must.not.have.property("refresh")
					waiting.body.must.eql({state: "DONE"})

					var signed = yield this.request(waiting.headers.location)
					signed.statusCode.must.equal(303)
					signed.statusMessage.must.equal("Signed with Mobile-ID")
					signed.headers.location.must.equal(initiativePath + "-hello-world")

					signaturesDb.search(sql`
						SELECT * FROM initiative_signatures
					`).must.not.be.empty()

					initiativesDb.read(this.initiative).must.eql(_.defaults({
						last_signature_created_at: new Date
					}, this.initiative))
				})

				it("must respond with 422 given invalid personal id", function*() {
					var path = `/initiatives/${this.initiative.id}`
					var res = yield this.request(path + "/signatures", {
						method: "POST",
						headers: {Accept: `${EMPTY_TYPE}, ${ERROR_TYPE}`},
						form: {
							method: "mobile-id",
							"personal-id": ADULT_PERSONAL_ID + "666",
							"phone-number": "+37200000766"
						}
					})

					assertError(res, {
						code: 422,
						message: "Invalid Personal Id",
						description: t("eid_view.errors.invalid_personal_id")
					})

					signablesDb.search(sql`
						SELECT * FROM initiative_signables
					`).must.be.empty()
				})
			})

			function mustSignWithMobileId(sign, assertOk, assertError) {
				describe("as a Mobile-ID method", function() {
					_.each({
						RSA: [JOHN_RSA_KEYS, hashAndSignWithRsa],
						ECDSA: [JOHN_ECDSA_KEYS, hashAndSignWithEcdsa]
					}, function([keys, signSignable], algo) {
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

								extensions: SIGN_CERTIFICATE_EXTENSIONS,
								issuer: VALID_ISSUERS[0],
								publicKey: keys.publicKey
							}))

							assertOk(yield sign(
								this.router,
								this.request,
								this.initiative,
								cert,
								function(req, res) {
									var {xades} = signablesDb.read(sql`
										SELECT * FROM initiative_signables
									`)

									respond({
										state: "COMPLETE",
										result: "OK",

										signature: {
											algorithm: "sha256WithRSAEncryption",
											value: signSignable(
												keys.privateKey,
												xades.signable
											).toString("base64")
										}
									}, req, res)
								}
							))

							signaturesDb.search(sql`
								SELECT * FROM initiative_signatures
							`).must.not.be.empty()
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

								extensions: SIGN_CERTIFICATE_EXTENSIONS,
								issuer: VALID_ISSUERS[0],
								publicKey: keys.publicKey
							}))

							var res = yield sign(
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

							assertError(res, {
								code: 410,
								message: "Invalid Mobile-ID Signature",

								description:
									t("eid_view.mobile_id_errors.sign_invalid_signature")
							})

							signaturesDb.search(sql`
								SELECT * FROM initiative_signatures
							`).must.be.empty()
						})
					})

					it("must respond with 422 given invalid personal id from certificate request", function*() {
						this.router.post(`${MOBILE_ID_URL.path}certificate`, (req, res) => {
							res.statusCode = 400

							respond({
								error: "nationalIdentityNumber must contain of 11 digits"
							}, req, res)
						})

						var res = yield sign(
							this.router,
							this.request,
							this.initiative,
							MOBILE_ID_CERTIFICATE
						)

						assertError(res, {
							code: 422,
							message: "Not a Mobile-ID User",
							description: t("eid_view.mobile_id_errors.not_found")
						})

						signablesDb.search(sql`
							SELECT * FROM initiative_signables
						`).must.be.empty()
					})

					it("must respond with 422 given invalid phone number from certificate request", function*() {
						this.router.post(`${MOBILE_ID_URL.path}certificate`, (req, res) => {
							res.statusCode = 400

							respond({
								error: "phoneNumber must contain of + and numbers(8-30)"
							}, req, res)
						})

						var res = yield sign(
							this.router,
							this.request,
							this.initiative,
							MOBILE_ID_CERTIFICATE
						)

						assertError(res, {
							code: 422,
							message: "Not a Mobile-ID User",
							description: t("eid_view.mobile_id_errors.not_found")
						})

						signablesDb.search(sql`
							SELECT * FROM initiative_signables
						`).must.be.empty()
					})

					_.each(MOBILE_ID_CERT_ERRORS, ([
						statusCode,
						statusMessage,
						error
					], code) => it(`must respond with error given ${code}`, function*() {
						var res = yield sign(
							this.router,
							this.request,
							this.initiative,
							respond.bind(null, {result: code})
						)

						assertError(res, {
							code: statusCode,
							message: statusMessage,
							description: t(error)
						})

						signablesDb.search(sql`
							SELECT * FROM initiative_signables
						`).must.be.empty()
						})
					)

					_.each(MOBILE_ID_SIGN_ERRORS, ([
						statusCode,
						statusMessage,
						error
					], code) => it(`must respond with error given ${code} while signing`,
						function*() {
						var res = yield sign(
							this.router,
							this.request,
							this.initiative,
							MOBILE_ID_CERTIFICATE,
							respond.bind(null, {state: "COMPLETE", result: code})
						)

						assertError(res, {
							code: statusCode,
							message: statusMessage,
							description: t(error)
						})

						signaturesDb.search(sql`
							SELECT * FROM initiative_signatures
						`).must.be.empty()
						})
					)

					it("must respond with error given Bad Request from sign request",
						function*() {
						this.router.post(
							`${MOBILE_ID_URL.path}signature`,
							function(_req, res) { res.statusCode = 400; res.end() }
						)

						var res = yield sign(
							this.router,
							this.request,
							this.initiative,
							MOBILE_ID_CERTIFICATE
						)

						assertError(res, {
							code: 500,
							message: "Unknown Mobile-ID Error",
							description: t("500_BODY")
						})

						signablesDb.search(sql`
							SELECT * FROM initiative_signables
						`).must.be.empty()
					})

					it("must respond with error given Bad Request from sign session",
					function*() {
						var res = yield sign(
							this.router,
							this.request,
							this.initiative,
							MOBILE_ID_CERTIFICATE,
							function(_req, res) { res.statusCode = 400; res.end() }
						)

						assertError(res, {
							code: 500,
							message: "Unknown Mobile-ID Error",
							description: t("500_BODY")
						})
					})
				})
			}

			xit("must create signature if signature session running", function*() {
				var waited = 0
				var signed = yield signWithMobileId(
					this.router,
					this.request,
					this.initiative,
					MOBILE_ID_CERTIFICATE,
					function(req, res) {
						if (waited++ < 2)
							return void respond({state: "RUNNING"}, req, res)

						var {xades} = signablesDb.read(sql`
							SELECT * FROM initiative_signables
						`)

						respond({
							state: "COMPLETE",
							result: "OK",

							signature: {
								algorithm: "sha256WithRSAEncryption",
								value: hashAndSignWithRsa(
									JOHN_RSA_KEYS.privateKey,
									xades.signable
								).toString("base64")
							}
						}, req, res)
					}
				)

				signed.statusCode.must.equal(204)
				signed.statusMessage.must.equal("Signed")

				signaturesDb.search(sql`
					SELECT * FROM initiative_signatures
				`).must.not.be.empty()

				var cookies = parseCookies(signed.headers["set-cookie"])
				var res = yield this.request(signed.headers.location, {
					headers: {Cookie: serializeCookies(cookies)}
				})

				res.statusCode.must.equal(200)
				res.body.must.include(t("initiative_page.thanks_section.title"))
			})

			xit("must time out after 2 minutes", function*() {
				var waited = 0
				var errored = yield signWithMobileId(
					this.router,
					this.request,
					this.initiative,
					MOBILE_ID_CERTIFICATE,
					(req, res) => {
						var {timeoutMs} = Url.parse(req.url, true).query
						timeoutMs.must.equal(waited == 0 ? "120000" : "1000")
						if (waited++ == 0) this.time.tick(119 * 1000)
						else this.time.tick(1000)
						respond({state: "RUNNING"}, req, res)
					}
				)

				errored.statusCode.must.equal(410)
				errored.statusMessage.must.equal("Mobile-ID Timeout")
				var initiativePath = `/initiatives/${this.initiative.id}`
				errored.headers.location.must.equal(initiativePath)
				waited.must.equal(2)

				signaturesDb.search(sql`
					SELECT * FROM initiative_signatures
				`).must.be.empty()

				var cookies = parseCookies(errored.headers["set-cookie"])
				var res = yield this.request(errored.headers.location, {
					headers: {Cookie: serializeCookies(cookies)}
				})

				res.statusCode.must.equal(200)
				res.body.must.not.include(t("initiative_page.thanks_section.title"))
				res.body.must.not.include(t("initiative_page.thanks_section.title_when_overwritten"))
				res.body.must.include(t("eid_view.mobile_id_errors.sign_timeout"))
			})
		})

		describe("when signing via Smart-ID", function() {
			describe("when without JavaScript", function() {
				function assertOk(res) {
					res.statusCode.must.equal(303)
					res.statusMessage.must.equal("Signed with Smart-ID")
				}

				function assertError(res, obj) {
					res.statusCode.must.equal(obj.code)
					res.statusMessage.must.equal(obj.message)
					res.headers["content-type"].must.equal(HTML_TYPE)

					var el = parseHtml(res.body).querySelector("#error .description")
					el.textContent.must.equal(obj.description)
				}

				mustSign((router, request, initiative, cert) => signWithSmartId(
					router,
					request,
					initiative,
					cert || SMART_ID_CERTIFICATE
				), assertError)

				mustSignWithSmartId(signWithSmartId, assertOk, assertError)

				mustRateLimit((router, request, initiative) => (
					signWithSmartId(router, request, initiative, SMART_ID_CERTIFICATE)
				), assertOk, assertError)

				it("must create a signature and update initiative", function*() {
					var cert = new Certificate(newCertificate({
						subject: {
							countryName: "EE",
							organizationalUnitName: "SIGNATURE",
							commonName: `SMITH,JOHN,PNOEE-${ADULT_PERSONAL_ID}`,
							surname: "SMITH",
							givenName: "JOHN",
							serialNumber: `PNOEE-${ADULT_PERSONAL_ID}`
						},

						extensions: SIGN_CERTIFICATE_EXTENSIONS,
						issuer: VALID_ISSUERS[0],
						publicKey: JOHN_RSA_KEYS.publicKey
					}))

					var [xades, tsResponse, ocspResponse] = newXades(this.initiative, cert)
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
						req.headers.host.must.equal(SMART_ID_URL.host)

						req.body.relyingPartyName.must.equal(Config.smartIdUser)
						req.body.relyingPartyUUID.must.equal(Config.smartIdPassword)
						req.body.hashType.must.equal("SHA256")
						req.body.hash.must.equal(xades.signableHash.toString("base64"))

						respond({sessionID: signSession}, req, res)
					})

					this.router.get(`${SMART_ID_URL.path}session/${signSession}`,
						function(req, res) {
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

					this.router.post(TIMESTAMP_URL.path, function(req, res) {
						req.headers.host.must.equal(TIMESTAMP_URL.host)
						res.setHeader("Content-Type", "application/timestamp-reply")
						res.end(tsResponse.toBuffer())
					})

					this.router.post(OCSP_URL.path, function(req, res) {
						req.headers.host.must.equal(OCSP_URL.host)
						res.setHeader("Content-Type", "application/ocsp-response")
						res.flushHeaders()

						// NOTE: Respond with a little delay to ensure waiting for signable
						// works as expected.
						setTimeout(() => res.end(ocspResponse.toBuffer()), 100)
					})

					var initiativePath = `/initiatives/${this.initiative.id}`
					var signing = yield this.request(initiativePath + "/signatures", {
						method: "POST",
						headers: {"X-Forwarded-For": LONDON_FORWARDED_FOR},
						form: {method: "smart-id", "personal-id": ADULT_PERSONAL_ID}
					})

					var verificationCode =
						padVerificationCode(SmartId.verification(xades.signableHash))

					signing.statusCode.must.equal(202)
					signing.statusMessage.must.equal("Signing with Smart-ID")
					signing.headers["content-type"].must.equal(HTML_TYPE)
					signing.headers["x-verification-code"].must.equal(verificationCode)

					var waitUrl = parseRefreshHeader(signing.headers.refresh)[1]
					var waiting = yield this.request(waitUrl)
					waiting.statusCode.must.equal(202)
					waiting.statusMessage.must.equal("Waiting for Smart-ID")
					waiting.headers["content-type"].must.equal(HTML_TYPE)
					waiting.headers["x-verification-code"].must.equal(verificationCode)

					yield _.sleep(100)

					waitUrl = parseRefreshHeader(signing.headers.refresh)[1]
					var signed = yield this.request(waitUrl)
					signed.statusCode.must.equal(303)
					signed.statusMessage.must.equal("Signed with Smart-ID")
					signed.headers.location.must.equal(initiativePath + "-hello-world")

					var signables = signablesDb.search(sql`
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

					signaturesDb.search(sql`
						SELECT * FROM initiative_signatures
					`).must.eql([new ValidSignature({
						id: 1,
						initiative_uuid: this.initiative.uuid,
						token: signables[0].token,
						country: "EE",
						personal_id: ADULT_PERSONAL_ID,
						method: "smart-id",
						xades: String(xades),
						created_from: LONDON_GEO
					})])

					initiativesDb.read(this.initiative).must.eql(_.defaults({
						last_signature_created_at: new Date
					}, this.initiative))
				})

				it("must get certificate if certificate session running once", function*() {
					var cert = new Certificate(newCertificate({
						subject: {
							countryName: "EE",
							organizationalUnitName: "SIGNATURE",
							commonName: `SMITH,JOHN,PNOEE-${ADULT_PERSONAL_ID}`,
							surname: "SMITH",
							givenName: "JOHN",
							serialNumber: `PNOEE-${ADULT_PERSONAL_ID}`
						},

						extensions: SIGN_CERTIFICATE_EXTENSIONS,
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
							if (waited++ < 1) return void respond({
								state: "RUNNING"
							}, req, res)

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

					var path = `/initiatives/${this.initiative.id}/signatures`
					var res = yield this.request(path, {
						method: "POST",
						form: {method: "smart-id", "personal-id": ADULT_PERSONAL_ID}
					})

					assertError(res, {
						code: 422,
						message: "Certificate Expired",
						description: t("eid_view.errors.certificate_expired")
					})
				})

				it("must create signature if signature session running once",
					function*() {
					var waited = 0

					var signed = yield signWithSmartId(
						this.router,
						this.request,
						this.initiative,
						SMART_ID_CERTIFICATE,
						function(req, res) {
							if (waited++ < 1) return void respond({
								state: "RUNNING"
							}, req, res)

							var {xades} = signablesDb.read(sql`
								SELECT * FROM initiative_signables
							`)

							respond({
								state: "COMPLETE",
								result: {endResult: "OK"},

								cert: {
									certificateLevel: "QUALIFIED",
									value: SMART_ID_CERTIFICATE.toString("base64")
								},

								signature: {
									algorithm: "sha256WithRSAEncryption",
									value: hashAndSignWithRsa(
										JOHN_RSA_KEYS.privateKey,
										xades.signable
									).toString("base64")
								}
							}, req, res)
						}
					)

					assertOk(signed)

					signaturesDb.search(sql`
						SELECT * FROM initiative_signatures
					`).must.not.be.empty()
				})

				it("must respond with 422 given invalid personal id", function*() {
					var initiativePath = `/initiatives/${this.initiative.id}`
					var res = yield this.request(initiativePath + "/signatures", {
						method: "POST",
						form: {method: "smart-id", "personal-id": ADULT_PERSONAL_ID + "666"}
					})

					assertError(res, {
						code: 422,
						message: "Invalid Personal Id",
						description: t("eid_view.errors.invalid_personal_id")
					})

					signablesDb.search(sql`
						SELECT * FROM initiative_signables
					`).must.be.empty()
				})

				_.each(PERSONAL_ID_TRANSFORMS, function(to, from) {
					it(`must transform Smart-ID personal id ${from} to ${to}`,
						function*() {
						var created = 0

						this.router.post(
							`${SMART_ID_URL.path}certificatechoice/etsi/PNOEE-${to}`,
							function(_req, res) {
								++created
								res.statusCode = 404
								res.end()
						})

						var initiativePath = `/initiatives/${this.initiative.id}`
						var res = yield this.request(initiativePath + "/signatures", {
							method: "POST",
							form: {method: "smart-id", "personal-id": from}
						})

						created.must.equal(1)

						assertError(res, {
							code: 422,
							message: "Not a Smart-ID User",
							description: t("eid_view.smart_id_errors.not_found")
						})
					})
				})

				it("must respond with 422 given underage signer", function*() {
					var initiativePath = `/initiatives/${this.initiative.id}/signatures`
					var res = yield this.request(initiativePath, {
						method: "POST",
						form: {method: "smart-id", "personal-id": CHILD_PERSONAL_ID}
					})

					assertError(res, {
						code: 422,
						message: "Too Young",
						description: t("creating_initiative_signature_page.errors.too_young")
					})
				})
			})

			describe("when with JavaScript", function() {
				function assertOk(res) {
					res.statusCode.must.equal(200)
					res.statusMessage.must.equal("Signed with Smart-ID")
					res.headers["content-type"].must.equal(JSON_TYPE)
					res.body.must.eql({state: "DONE"})
				}

				function assertError(res, obj) {
					res.statusCode.must.equal(obj.code)
					res.statusMessage.must.equal(obj.message)
					res.headers["content-type"].must.equal(ERROR_TYPE)
					res.body.must.eql(obj)
				}

				mustSign(function*(router, request, initiative, cert) {
					var res = yield signWithSmartId(
						router,
						request,
						initiative,
						cert || SMART_ID_CERTIFICATE,
						null,
						{Accept: `${JSON_TYPE}, ${ERROR_TYPE}`}
					)

					if (!(res.statusCode >= 200 && res.statusCode < 300)) return res
					return request(res.headers.location)
				}, assertError)

				mustSignWithSmartId((router, request, initiative, cert, session) => (
					signWithSmartId(router, request, initiative, cert, session, {
						Accept: `${JSON_TYPE}, ${ERROR_TYPE}`
					})
				), assertOk, assertError)

				mustRateLimit((router, request, initiative) => signWithSmartId(
					router,
					request,
					initiative,
					SMART_ID_CERTIFICATE,
					null,
					{Accept: `${JSON_TYPE}, ${ERROR_TYPE}`}
				), assertOk, assertError)

				it("must create a signature and update initiative", function*() {
					var [
						xades,
						tsResponse,
						ocspResponse
					] = newXades(this.initiative, SMART_ID_CERTIFICATE)

					var signSession = "21e55f06-d6cb-40b7-9638-75dc0b131851"

					this.router.post(
						`${SMART_ID_URL.path}signature/document/${SMART_ID}`,
						respond.bind(null, {sessionID: signSession})
					)

					this.router.get(`${SMART_ID_URL.path}session/${signSession}`,
						function(req, res) {
						respond({
							state: "COMPLETE",
							result: {endResult: "OK"},

							cert: {
								certificateLevel: "QUALIFIED",
								value: SMART_ID_CERTIFICATE.toString("base64"),
							},

							signature: {
								algorithm: "sha256WithRSAEncryption",
								value: hashAndSignWithRsa(
									JOHN_RSA_KEYS.privateKey,
									xades.signable
								).toString("base64")
							}
						}, req, res)
					})

					this.router.post(TIMESTAMP_URL.path, function(req, res) {
						req.headers.host.must.equal(TIMESTAMP_URL.host)
						res.setHeader("Content-Type", "application/timestamp-reply")
						res.end(tsResponse.toBuffer(0))
					})

					this.router.post(OCSP_URL.path, function(req, res) {
						req.headers.host.must.equal(OCSP_URL.host)
						res.setHeader("Content-Type", "application/ocsp-response")
						res.flushHeaders()

						// NOTE: Respond with a little delay to ensure waiting for signable
						// works as expected.
						setTimeout(() => res.end(ocspResponse.toBuffer()), 100)
					})

					var signing = yield certWithSmartId(
						this.router,
						this.request,
						this.initiative,
						SMART_ID_CERTIFICATE,
						{Accept: `${EMPTY_TYPE}, ${ERROR_TYPE}`}
					)

					signing.statusCode.must.equal(202)
					signing.statusMessage.must.equal("Signing with Smart-ID")
					signing.headers.must.not.have.property("content-type")

					signing.headers["x-verification-code"].must.equal(
						_.padLeft(SmartId.verification(xades.signableHash), 4, 0)
					)

					var waitUrl = parseRefreshHeader(signing.headers.refresh)[1]
					var waiting = yield this.request(waitUrl, {
						headers: {Accept: `${JSON_TYPE}, ${ERROR_TYPE}`}
					})

					waiting.statusCode.must.equal(200)
					waiting.statusMessage.must.equal("Signed with Smart-ID")
					waiting.headers["content-type"].must.equal(JSON_TYPE)
					waiting.headers.must.not.have.property("x-verification-code")
					waiting.headers.must.not.have.property("refresh")
					waiting.body.must.eql({state: "DONE"})

					var res = yield this.request(waitUrl)
					res.statusCode.must.equal(303)
					res.statusMessage.must.equal("Signed with Smart-ID")
					var initiativePath = `/initiatives/${this.initiative.id}`
					res.headers.location.must.equal(initiativePath + "-hello-world")

					signaturesDb.search(sql`
						SELECT * FROM initiative_signatures
					`).must.not.be.empty()

					initiativesDb.read(this.initiative).must.eql(_.defaults({
						last_signature_created_at: new Date
					}, this.initiative))
				})

				it("must respond with 422 given invalid personal id", function*() {
					var initiativePath = `/initiatives/${this.initiative.id}`
					var res = yield this.request(initiativePath + "/signatures", {
						method: "POST",
						headers: {Accept: `${EMPTY_TYPE}, ${ERROR_TYPE}`},
						form: {method: "smart-id", "personal-id": ADULT_PERSONAL_ID + "666"}
					})

					assertError(res, {
						code: 422,
						message: "Invalid Personal Id",
						description: t("eid_view.errors.invalid_personal_id")
					})

					signablesDb.search(sql`
						SELECT * FROM initiative_signables
					`).must.be.empty()
				})
			})

			function mustSignWithSmartId(sign, assertOk, assertError) {
				describe("as a Smart-ID method", function() {
					_.each({
						RSA: [JOHN_RSA_KEYS, hashAndSignWithRsa],
						ECDSA: [JOHN_ECDSA_KEYS, hashAndSignWithEcdsa]
					}, function([keys, signSignable], algo) {
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

								extensions: SIGN_CERTIFICATE_EXTENSIONS,
								issuer: VALID_ISSUERS[0],
								publicKey: keys.publicKey
							}))

							assertOk(yield sign(
								this.router,
								this.request,
								this.initiative,
								cert,
								function(req, res) {
									var {xades} = signablesDb.read(sql`
										SELECT * FROM initiative_signables
									`)

									respond({
										state: "COMPLETE",
										result: {endResult: "OK"},

										cert: {
											certificateLevel: "QUALIFIED",
											value: SMART_ID_CERTIFICATE.toString("base64")
										},

										signature: {
											algorithm: "sha256WithRSAEncryption",
											value: signSignable(
												keys.privateKey,
												xades.signable
											).toString("base64")
										}
									}, req, res)
								}
							))

							signaturesDb.search(sql`
								SELECT * FROM initiative_signatures
							`).must.not.be.empty()
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

								extensions: SIGN_CERTIFICATE_EXTENSIONS,
								issuer: VALID_ISSUERS[0],
								publicKey: keys.publicKey
							}))

							var res = yield sign(
								this.router,
								this.request,
								this.initiative,
								cert,
								respond.bind(null, {
									state: "COMPLETE",
									result: {endResult: "OK"},

									cert: {
										certificateLevel: "QUALIFIED",
										value: cert.toString("base64")
									},

									signature: {
										algorithm: "sha256WithRSAEncryption",
										value: Crypto.randomBytes(64).toString("base64")
									}
								})
							)

							assertError(res, {
								code: 410,
								message: "Invalid Smart-ID Signature",

								description:
									t("eid_view.smart_id_errors.sign_invalid_signature")
							})

							signaturesDb.search(sql`
								SELECT * FROM initiative_signatures
							`).must.be.empty()
						})
					})

					_.each(SMART_ID_SESSION_ERRORS, function([
						statusCode,
						statusMessage,
						error
					], code) {
						it(`must respond with error given ${code} while fetching certificate`,
							function*() {
							var res = yield sign(
								this.router,
								this.request,
								this.initiative,
								respond.bind(null, {
									state: "COMPLETE",
									result: {endResult: code}
								})
							)

							assertError(res, {
								code: statusCode,
								message: statusMessage,
								description: t(error)
							})

							signaturesDb.search(sql`
								SELECT * FROM initiative_signatures
							`).must.be.empty()
						})

						it(`must respond with error given ${code} while signing`,
							function*() {
							var res = yield sign(
								this.router,
								this.request,
								this.initiative,
								SMART_ID_CERTIFICATE,
								respond.bind(null, {
									state: "COMPLETE",
									result: {endResult: code}
								})
							)

							assertError(res, {
								code: statusCode,
								message: statusMessage,
								description: t(error)
							})

							signaturesDb.search(sql`
								SELECT * FROM initiative_signatures
							`).must.be.empty()
						})
					})

					it("must respond with 422 given invalid personal id from certificate request", function*() {
						this.router.post(
							`${SMART_ID_URL.path}certificatechoice/etsi/:id`,
							function(_req, res) { res.statusCode = 404; res.end() }
						)

						var res = yield sign(
							this.router,
							this.request,
							this.initiative,
							SMART_ID_CERTIFICATE
						)

						assertError(res, {
							code: 422,
							message: "Not a Smart-ID User",
							description: t("eid_view.smart_id_errors.not_found")
						})

						signablesDb.search(sql`
							SELECT * FROM initiative_signables
						`).must.be.empty()
					})

					it("must respond with error if certificate session expired",
						function*() {
						var res = yield sign(
							this.router,
							this.request,
							this.initiative,
							function(_req, res) { res.statusCode = 404; res.end() }
						)

						assertError(res, {
							code: 410,
							message: "Smart-ID Timeout",
							description: t("eid_view.smart_id_errors.sign_timeout")
						})

						signaturesDb.search(sql`
							SELECT * FROM initiative_signatures
						`).must.be.empty()
					})

					it("must respond with error if signing session expired",
						function*() {
						var res = yield sign(
							this.router,
							this.request,
							this.initiative,
							SMART_ID_CERTIFICATE,
							function(_req, res) { res.statusCode = 404; res.end() }
						)

						assertError(res, {
							code: 410,
							message: "Smart-ID Timeout",
							description: t("eid_view.smart_id_errors.sign_timeout")
						})

						signaturesDb.search(sql`
							SELECT * FROM initiative_signatures
						`).must.be.empty()
					})

					it("must respond with error given Bad Request from certificate request", function*() {
						this.router.post(
							`${SMART_ID_URL.path}certificatechoice/etsi/:id`,
							function(_req, res) { res.statusCode = 400; res.end() }
						)

						var res = yield sign(
							this.router,
							this.request,
							this.initiative,
							SMART_ID_CERTIFICATE
						)

						assertError(res, {
							code: 500,
							message: "Unknown Smart-ID Error",
							description: t("500_BODY")
						})

						signaturesDb.search(sql`
							SELECT * FROM initiative_signatures
						`).must.be.empty()
					})

					it("must respond with error given Bad Request from certificate session", function*() {
						var res = yield sign(
							this.router,
							this.request,
							this.initiative,
							function(_req, res) { res.statusCode = 400; res.end() }
						)

						assertError(res, {
							code: 500,
							message: "Unknown Smart-ID Error",
							description: t("500_BODY")
						})

						signaturesDb.search(sql`
							SELECT * FROM initiative_signatures
						`).must.be.empty()
					})

					it("must respond with error given Bad Request from sign request", function*() {
						this.router.post(
							`${SMART_ID_URL.path}signature/document/${SMART_ID}`,
							function(_req, res) { res.statusCode = 400; res.end() }
						)

						var res = yield sign(
							this.router,
							this.request,
							this.initiative,
							SMART_ID_CERTIFICATE
						)

						assertError(res, {
							code: 500,
							message: "Unknown Smart-ID Error",
							description: t("500_BODY")
						})

						signaturesDb.search(sql`
							SELECT * FROM initiative_signatures
						`).must.be.empty()
					})

					it("must respond with error given Bad Request from sign session",
						function*() {
						var res = yield sign(
							this.router,
							this.request,
							this.initiative,
							SMART_ID_CERTIFICATE,
							function(_req, res) { res.statusCode = 400; res.end() }
						)

						assertError(res, {
							code: 500,
							message: "Unknown Smart-ID Error",
							description: t("500_BODY")
						})

						signaturesDb.search(sql`
							SELECT * FROM initiative_signatures
						`).must.be.empty()
					})
				})
			}

			xit("must time out after 90s of waiting for certificate", function*() {
				var certSession = "3befb011-37bf-4e57-b041-e4cba1496766"

				this.router.post(
					`${SMART_ID_URL.path}certificatechoice/etsi/:id`,
					respond.bind(null, {sessionID: certSession})
				)

				var waited = 0
				this.router.get(
					`${SMART_ID_URL.path}session/${certSession}`,
					(req, res) => {
						var {timeoutMs} = Url.parse(req.url, true).query
						timeoutMs.must.equal(waited == 0 ? "90000" : "1000")
						if (waited++ == 0) this.time.tick(89 * 1000)
						else this.time.tick(1000)
						respond({state: "RUNNING"}, req, res)
					}
				)

				var path = `/initiatives/${this.initiative.id}/signatures`
				var res = yield this.request(path, {
					method: "POST",
					form: {method: "smart-id", "personal-id": ADULT_PERSONAL_ID}
				})

				res.statusCode.must.equal(410)
				res.statusMessage.must.equal("Smart-ID Timeout")
				res.headers["content-type"].must.equal("text/html; charset=utf-8")
				res.body.must.include(t("eid_view.smart_id_errors.sign_timeout"))
			})

			xit("must time out after 2 minutes", function*() {
				var waited = 0
				var errored = yield signWithSmartId(
					this.router,
					this.request,
					this.initiative,
					SMART_ID_CERTIFICATE,
					(req, res) => {
						var {timeoutMs} = Url.parse(req.url, true).query
						timeoutMs.must.equal(waited == 0 ? "120000" : "1000")
						if (waited++ == 0) this.time.tick(119 * 1000)
						else this.time.tick(1000)
						respond({state: "RUNNING"}, req, res)
					}
				)

				errored.statusCode.must.equal(410)
				errored.statusMessage.must.equal("Smart-ID Timeout")
				var initiativePath = `/initiatives/${this.initiative.id}`
				errored.headers.location.must.equal(initiativePath)
				waited.must.equal(2)

				signaturesDb.search(sql`
					SELECT * FROM initiative_signatures
				`).must.be.empty()

				var cookies = parseCookies(errored.headers["set-cookie"])
				var res = yield this.request(errored.headers.location, {
					headers: {Cookie: serializeCookies(cookies)}
				})

				res.statusCode.must.equal(200)
				res.body.must.not.include(t("initiative_page.thanks_section.title"))
				res.body.must.not.include(t("initiative_page.thanks_section.title_when_overwritten"))
				res.body.must.include(t("eid_view.smart_id_errors.sign_timeout"))
			})
		})
	})

	describe(`GET /:personalid for ${ASICE_TYPE}`, function() {
		beforeEach(function() {
			this.author = usersDb.create(new ValidUser)

			this.initiative = initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				phase: "sign",
				signing_ends_at: DateFns.addDays(new Date, 1)
			}))
		})

		it("must respond with signature ASIC-E", function*() {
			var signature = signaturesDb.create(new ValidSignature({
				initiative_uuid: this.initiative.uuid,
				country: "EE",
				personal_id: "38706181337"
			}))

			var initiativePath = `/initiatives/${this.initiative.id}`
			var path = initiativePath + "/signatures/EE38706181337.asice"
			path += "?token=" + signature.token.toString("hex")
			var res = yield this.request(path)
			res.headers["content-type"].must.equal(ASICE_TYPE)

			var zip = yield Zip.parse(Buffer.from(res.body))
			var entries = yield Zip.parseEntries(zip)

			entries.must.have.keys(_.concat(
				ASICE_FILES,
				"initiative.html",
				"META-INF/signatures-1.xml"
			))

			var xades = yield Zip.readEntry(zip, entries["META-INF/signatures-1.xml"])
			String(xades).must.equal(String(signature.xades))

			var text = yield Zip.readEntry(zip, entries["initiative.html"])
			String(text).must.equal(this.initiative.text)
		})

		it("must respond with 404 if no signature", function*() {
			var initiativePath = `/initiatives/${this.initiative.id}`
			var path = initiativePath + "/signatures/EE38706181337.asice"
			path += "?token=aabbccddee"
			var res = yield this.request(path)
			res.statusCode.must.equal(404)
			res.statusMessage.must.equal("Signature Not Found")
		})

		it("must respond with 404 if invalid token", function*() {
			signaturesDb.create(new ValidSignature({
				initiative_uuid: this.initiative.uuid,
				country: "EE",
				personal_id: "38706181337"
			}))

			var initiativePath = `/initiatives/${this.initiative.id}`
			var path = initiativePath + "/signatures/EE38706181337.asice"
			path += "?token=aabbccddee"
			var res = yield this.request(path)
			res.statusCode.must.equal(404)
			res.statusMessage.must.equal("Signature Not Found")
		})
	})

	describe("PUT /:personalId", function() {
		require("root/test/time")()

		beforeEach(function() {
			this.author = usersDb.create(new ValidUser)

			this.initiative = initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				phase: "sign",
				signing_ends_at: DateFns.addDays(new Date, 1)
			}))
		})

		it("must respond with 409 if setting signature once signed", function*() {
			var signature = signaturesDb.create(new ValidSignature({
				initiative_uuid: this.initiative.uuid,
				country: "EE",
				personal_id: "38706181337"
			}))

			var initiativePath = `/initiatives/${this.initiative.id}`
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
		beforeEach(function() {
			this.author = usersDb.create(new ValidUser)

			this.initiative = initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				phase: "sign",
				title: "Hello, world!",
				signing_ends_at: DateFns.addDays(new Date, 1)
			}))
		})

		it("must delete signature and redirect", function*() {
			var signature = signaturesDb.create(new ValidSignature({
				initiative_uuid: this.initiative.uuid,
				country: "EE",
				personal_id: "38706181337"
			}))

			var initiativePath = `/initiatives/${this.initiative.id}`
			var path = initiativePath + "/signatures/EE38706181337"
			path += "?token=" + signature.token.toString("hex")
			var deleted = yield this.request(path, {method: "DELETE"})
			deleted.statusCode.must.equal(303)
			deleted.statusMessage.must.equal("Signature Deleted")
			deleted.headers.location.must.equal(initiativePath + "-hello-world")

			signaturesDb.search(sql`
				SELECT * FROM initiative_signatures
			`).must.be.empty()

			var cookies = parseCookies(deleted.headers["set-cookie"])
			var res = yield this.request(deleted.headers.location, {
				headers: {Cookie: serializeCookies(cookies)}
			})

			res.statusCode.must.equal(200)
			res.body.must.include(t("SIGNATURE_REVOKED"))
			res.body.must.not.include(t("initiative_page.thanks_section.title"))
			res.body.must.not.include("donate-form")
		})

		it("must respond with 404 if no signature", function*() {
			var initiativePath = `/initiatives/${this.initiative.id}`
			var path = initiativePath + "/signatures/EE38706181337?token=aabbccddee"
			var res = yield this.request(path, {method: "DELETE"})
			res.statusCode.must.equal(404)
			res.statusMessage.must.equal("Signature Not Found")
		})

		it("must respond with 404 if invalid token", function*() {
			var signature = signaturesDb.create(new ValidSignature({
				initiative_uuid: this.initiative.uuid,
				country: "EE",
				personal_id: "38706181337"
			}))

			var initiativePath = `/initiatives/${this.initiative.id}`
			var path = initiativePath + "/signatures/EE38706181337?token=aabbccddee"
			var res = yield this.request(path, {method: "DELETE"})

			res.statusCode.must.equal(404)
			res.statusMessage.must.equal("Signature Not Found")
			signaturesDb.read(signature).must.eql(signature)
		})

		it("must not delete signature on another initiative", function*() {
			var signature = signaturesDb.create(new ValidSignature({
				initiative_uuid: this.initiative.uuid,
				country: "EE",
				personal_id: "38706181337"
			}))

			var otherInitiative = initiativesDb.create(new ValidInitiative({
				user_id: this.author.id
			}))

			var otherSignature = signaturesDb.create(new ValidSignature({
				initiative_uuid: otherInitiative.uuid,
				country: "EE",
				personal_id: "38706181337"
			}))

			var initiativePath = `/initiatives/${this.initiative.id}`
			var path = initiativePath + "/signatures/EE38706181337"
			path += "?token=" + signature.token.toString("hex")
			var res = yield this.request(path, {method: "DELETE"})
			res.statusCode.must.equal(303)
			res.statusMessage.must.equal("Signature Deleted")

			signaturesDb.search(sql`
				SELECT * FROM initiative_signatures
			`).must.eql([otherSignature])
		})

		it("must not delete signature of another person", function*() {
			var signature = signaturesDb.create(new ValidSignature({
				initiative_uuid: this.initiative.uuid,
				country: "EE",
				personal_id: "38706181337"
			}))

			var otherSignature = signaturesDb.create(new ValidSignature({
				initiative_uuid: this.initiative.uuid,
				country: "EE",
				personal_id: "60001019907"
			}))

			var initiativePath = `/initiatives/${this.initiative.id}`
			var path = initiativePath + "/signatures/EE38706181337"
			path += "?token=" + signature.token.toString("hex")
			var res = yield this.request(path, {method: "DELETE"})
			res.statusCode.must.equal(303)
			res.statusMessage.must.equal("Signature Deleted")

			signaturesDb.search(sql`
				SELECT * FROM initiative_signatures
			`).must.eql([otherSignature])
		})

		it("must not delete signature if initiative signing finished", function*() {
			var initiative = initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				phase: "sign",
				signing_ends_at: new Date
			}))

			var signature = signaturesDb.create(new ValidSignature({
				initiative_uuid: initiative.uuid,
				country: "EE",
				personal_id: "38706181337"
			}))

			var initiativePath = `/initiatives/${initiative.id}`
			var path = initiativePath + "/signatures/EE38706181337"
			path += "?token=" + signature.token.toString("hex")
			var res = yield this.request(path, {method: "DELETE"})
			res.statusCode.must.equal(405)
			res.statusMessage.must.equal("Cannot Delete Signature as Signing Ended")

			signaturesDb.search(sql`
				SELECT * FROM initiative_signatures
			`).must.eql([signature])
		})
	})
})

function* signWithIdCard(router, request, initiative, cert) {
	var signing = yield request(`/initiatives/${initiative.id}/signatures`, {
		method: "POST",

		headers: {
			Accept: `${SIGNABLE_TYPE}, ${ERROR_TYPE}`,
			"Content-Type": CERTIFICATE_TYPE
		},

		body: cert.toBuffer()
	})

	if (!(signing.statusCode >= 200 && signing.statusCode < 300)) return signing
	signing.statusCode.must.equal(202)
	signing.statusMessage.must.equal("Signing with ID-card")

	var {xades} = signablesDb.read(sql`SELECT xades FROM initiative_signables`)

	router.post(TIMESTAMP_URL.path, function(req, res) {
		req.headers.host.must.equal(TIMESTAMP_URL.host)
		res.setHeader("Content-Type", "application/timestamp-reply")
		res.end(newTimestampResponse())
	})

	router.post(OCSP_URL.path, function(req, res) {
		req.headers.host.must.equal(OCSP_URL.host)
		res.setHeader("Content-Type", "application/ocsp-response")
		res.end(newOcspResponse(cert))
	})

	return request(signing.headers.location, {
		method: "PUT",
		headers: {
			Accept: `text/html, ${ERROR_TYPE}`,
			"Content-Type": SIGNATURE_TYPE
		},

		body: hashAndSignWithRsa(JOHN_RSA_KEYS.privateKey, xades.signable)
	})
}

function* signWithMobileId(
	router,
	request,
	initiative,
	cert,
	session,
	headers
) {
	router.post(
		`${MOBILE_ID_URL.path}certificate`,
		typeof cert == "function" ? cert : respond.bind(null, {
			result: "OK",
			cert: cert.toString("base64")
		})
	)

	router.post(`${MOBILE_ID_URL.path}signature`, respond.bind(null, {
		sessionID: "7c8bdd56-6772-4264-ba27-bf7a9ef72a11"
	}))

	router.get(
		`${MOBILE_ID_URL.path}signature/session/:token`,
		typeof session == "function" ? session : function(req, res) {
			// There could be multiple signables when testing rate limiting.
			var {xades} = signablesDb.read(sql`
				SELECT xades FROM initiative_signables ORDER BY rowid DESC LIMIT 1
			`)

			respond({
				state: "COMPLETE",
				result: "OK",

				signature: {
					algorithm: "sha256WithRSAEncryption",
					value: hashAndSignWithRsa(
						JOHN_RSA_KEYS.privateKey,
						xades.signable
					).toString("base64")
				}
			}, req, res)
		}
	)

	router.post(TIMESTAMP_URL.path, function(req, res) {
		req.headers.host.must.equal(TIMESTAMP_URL.host)
		res.setHeader("Content-Type", "application/timestamp-reply")
		res.end(newTimestampResponse())
	})

	router.post(OCSP_URL.path, function(req, res) {
		req.headers.host.must.equal(OCSP_URL.host)
		res.setHeader("Content-Type", "application/ocsp-response")
		res.end(newOcspResponse(cert))
	})

	var signing = yield request(`/initiatives/${initiative.id}/signatures`, {
		method: "POST",
		headers: headers || {},

		form: {
			method: "mobile-id",
			"personal-id": ADULT_PERSONAL_ID,
			"phone-number": "+37200000766"
		}
	})

	if (!(signing.statusCode >= 200 && signing.statusCode < 300)) return signing
	signing.statusCode.must.equal(202)
	signing.statusMessage.must.equal("Signing with Mobile-ID")

	return request(parseRefreshHeader(signing.headers.refresh)[1], {
		headers: headers || {}
	})
}

function certWithSmartId(router, request, initiative, cert, headers) {
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

	return request(`/initiatives/${initiative.id}/signatures`, {
		method: "POST",
		headers: headers || {},
		form: {method: "smart-id", "personal-id": ADULT_PERSONAL_ID}
	})
}

function* signWithSmartId(router, request, initiative, cert, session, headers) {
	var signSession = "21e55f06-d6cb-40b7-9638-75dc0b131851"

	router.post(
		`${SMART_ID_URL.path}signature/document/${SMART_ID}`,
		respond.bind(null, {sessionID: signSession})
	)

	router.get(
		`${SMART_ID_URL.path}session/${signSession}`,
		typeof session == "function" ? session : function(req, res) {
			// There could be multiple signables when testing rate limiting.
			var {xades} = signablesDb.read(sql`
				SELECT xades FROM initiative_signables ORDER BY rowid DESC LIMIT 1
			`)

			respond({
				state: "COMPLETE",
				result: {endResult: "OK"},
				cert: {certificateLevel: "QUALIFIED", value: cert.toString("base64")},

				signature: {
					algorithm: "sha256WithRSAEncryption",
					value: hashAndSignWithRsa(
						JOHN_RSA_KEYS.privateKey,
						xades.signable
					).toString("base64")
				}
			}, req, res)
		}
	)

	router.post(TIMESTAMP_URL.path, function(req, res) {
		req.headers.host.must.equal(TIMESTAMP_URL.host)
		res.setHeader("Content-Type", "application/timestamp-reply")
		res.end(newTimestampResponse())
	})

	router.post(OCSP_URL.path, function(req, res) {
		req.headers.host.must.equal(OCSP_URL.host)
		res.setHeader("Content-Type", "application/ocsp-response")
		res.end(newOcspResponse(cert))
	})

	var signing = yield certWithSmartId(
		router,
		request,
		initiative,
		cert,
		headers
	)

	if (!(signing.statusCode >= 200 && signing.statusCode < 300)) return signing
	signing.statusCode.must.equal(202)
	signing.statusMessage.must.equal("Signing with Smart-ID")

	return request(parseRefreshHeader(signing.headers.refresh)[1], {
		headers: headers || {}
	})
}

function newXades(initiative, cert) {
	var xades = hades.new(cert, [{
		path: "initiative.html",
		type: "text/html",
		hash: initiative.text_sha256
	}])

	var signatureBytes = hashAndSignWithRsa(
		JOHN_RSA_KEYS.privateKey,
		xades.signable
	)

	xades.setSignature(signatureBytes)

	var timestampResponse = Timestamp.parse(newTimestampResponse())
	xades.setTimestamp(timestampResponse)

	var ocspResponse = Ocsp.parse(newOcspResponse(cert))
	xades.setOcspResponse(ocspResponse)

	return [xades, timestampResponse, ocspResponse]
}

// Can't sign the hash directly unfortunately with Node.js.
function hashAndSignWithRsa(key, signable) {
	return Crypto.createSign("sha256").update(signable).sign(key)
}

function hashAndSignWithEcdsa(key, signable) {
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

function padVerificationCode(code) { return _.padLeft(code, 4, 0) }
