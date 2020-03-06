var Url = require("url")
var Path = require("path")
var Config = require("root/config")
var ValidDemoSignature = require("root/test/valid_demo_signature")
var Certificate = require("undersign/lib/certificate")
var Ocsp = require("undersign/lib/ocsp")
var Zip = require("root/lib/zip")
var Crypto = require("crypto")
var respond = require("root/test/fixtures").respond
var sql = require("sqlate")
var t = require("root/lib/i18n").t.bind(null, Config.language)
var newCertificate = require("root/test/fixtures").newCertificate
var newOcspResponse = require("root/test/fixtures").newOcspResponse
var demoSignaturesDb = require("root/db/demo_signatures_db")
var signablesDb = require("root/db/initiative_signables_db")
var hades = require("root").hades
var next = require("co-next")
var sha256 = require("root/lib/crypto").hash.bind(null, "sha256")
var ASICE_TYPE = "application/vnd.etsi.asic-e+zip"
var MOBILE_ID_URL = Url.parse("https://mid.sk.ee/mid-api/")
var SMART_ID_URL = Url.parse("https://rp-api.smart-id.com/v1/")
var TIMEMARK_URL = Url.parse(Config.timemarkUrl)
var CERTIFICATE_TYPE = "application/pkix-cert"
var ERR_TYPE = "application/vnd.rahvaalgatus.error+json"
var SIGNABLE_TYPE = "application/vnd.rahvaalgatus.signable"
var SIGNATURE_TYPE = "application/vnd.rahvaalgatus.signature"
var PERSONAL_ID = "38706181337"
var VALID_ISSUERS = require("root/test/fixtures").VALID_ISSUERS
var JOHN_RSA_KEYS = require("root/test/fixtures").JOHN_RSA_KEYS
var SMART_ID = "PNOEE-" + PERSONAL_ID + "-R2D2-Q"
var SIGNABLE_TEXT = t("DEMO_SIGNATURES_HEADER")
var SIGNABLE_TEXT_SHA256 = sha256(SIGNABLE_TEXT)

var ID_CARD_CERTIFICATE = new Certificate(newCertificate({
	subject: {
		countryName: "EE",
		organizationName: "ESTEID",
		organizationalUnitName: "digital signature",
		commonName: `SMITH,JOHN,${PERSONAL_ID}`,
		surname: "SMITH",
		givenName: "JOHN",
		serialNumber: `PNOEE-${PERSONAL_ID}`
	},

	issuer: VALID_ISSUERS[0],
	publicKey: JOHN_RSA_KEYS.publicKey
}))

var MOBILE_ID_CERTIFICATE = new Certificate(newCertificate({
	subject: {
		countryName: "EE",
		organizationName: "ESTEID (MOBIIL-ID)",
		organizationalUnitName: "digital signature",
		commonName: `SMITH,JOHN,${PERSONAL_ID}`,
		surname: "SMITH",
		givenName: "JOHN",
		serialNumber: `PNOEE-${PERSONAL_ID}`
	},

	issuer: VALID_ISSUERS[0],
	publicKey: JOHN_RSA_KEYS.publicKey
}))

var SMART_ID_CERTIFICATE = new Certificate(newCertificate({
	subject: {
		countryName: "EE",
		organizationalUnitName: "SIGNATURE",
		commonName: `SMITH,JOHN,PNOEE-${PERSONAL_ID}`,
		surname: "SMITH",
		givenName: "JOHN",
		serialNumber: `PNOEE-${PERSONAL_ID}`
	},

	issuer: VALID_ISSUERS[0],
	publicKey: JOHN_RSA_KEYS.publicKey
}))

describe("DemoSignaturesController", function() {
	require("root/test/web")()
	require("root/test/mitm")()
	require("root/test/db")()
	require("root/test/email")()
	require("root/test/fixtures").csrfRequest()
	beforeEach(require("root/test/mitm").router)

	describe("GET /", function() {
		it("must render", function*() {
			var res = yield this.request("/digiallkiri")
			res.statusCode.must.equal(200)
		})

		// Once upon a time, on Mar 24, 2017, there was a bug where the UI
		// translation strings were not rendered on the initiative page. Adding
		// this test here for double checking. They're used only for ID-card
		// errors.
		it("must render UI strings", function*() {
			var res = yield this.request("/digiallkiri")
			res.statusCode.must.equal(200)
			res.body.must.include("MSG_ERROR_HWCRYPTO_NO_CERTIFICATES")
		})
	})
	
	describe("POST /", function() {
		require("root/test/time")(new Date(2015, 5, 18))

		function mustSign(sign, certificate) {
			describe("as signable", function() {
				it("must thank after signing", function*() {
					var signed = yield sign(this.router, this.request, certificate)
					signed.statusCode.must.equal(204)

					var res = yield this.request(signed.headers.location)
					res.statusCode.must.equal(200)
					res.body.must.include(t("THANKS_FOR_SIGNING"))
				})
			})
		}

		describe("when signing via Id-Card", function() {
			mustSign(signWithIdCard, ID_CARD_CERTIFICATE)

			it("must create a signature", function*() {
				var cert = ID_CARD_CERTIFICATE
				var xades = newXades(cert)
				var signed = yield signWithIdCard(this.router, this.request, cert)

				signed.statusCode.must.equal(204)
				var token = Path.basename(signed.headers.location)
				signed.headers.location.must.equal(`/demo-signatures/${token}`)

				var signatures = yield demoSignaturesDb.search(sql`
					SELECT * FROM demo_signatures
				`)

				signatures.must.eql([new ValidDemoSignature({
					id: 1,
					token: Buffer.from(token, "hex"),
					country: "EE",
					personal_id: PERSONAL_ID.slice(0, 5),
					method: "id-card",
					xades: signatures[0].xades,
					signed: true,
					timestamped: true
				})])

				signatures[0].xades.toString().must.equal(String(xades))
			})
		})

		describe("when signing via Mobile-Id", function() {
			mustSign(signWithMobileId, MOBILE_ID_CERTIFICATE)

			it("must create a signature", function*() {
				var cert = MOBILE_ID_CERTIFICATE
				var xades = newXades(cert)
				var signed = yield signWithMobileId(this.router, this.request, cert)

				signed.statusCode.must.equal(204)
				var token = Path.basename(signed.headers.location)
				signed.headers.location.must.equal(`/demo-signatures/${token}`)

				var signatures = yield demoSignaturesDb.search(sql`
					SELECT * FROM demo_signatures
				`)

				signatures.must.eql([new ValidDemoSignature({
					id: 1,
					token: Buffer.from(token, "hex"),
					country: "EE",
					personal_id: PERSONAL_ID.slice(0, 5),
					method: "mobile-id",
					xades: signatures[0].xades,
					signed: true,
					timestamped: true
				})])

				signatures[0].xades.toString().must.equal(String(xades))
			})
		})

		describe("when signing via Smart-Id", function() {
			mustSign(signWithSmartId, SMART_ID_CERTIFICATE)

			it("must create a signature", function*() {
				var cert = SMART_ID_CERTIFICATE
				var xades = newXades(cert)
				var signed = yield signWithSmartId(this.router, this.request, cert)

				signed.statusCode.must.equal(204)
				var token = Path.basename(signed.headers.location)
				signed.headers.location.must.equal(`/demo-signatures/${token}`)

				var signatures = yield demoSignaturesDb.search(sql`
					SELECT * FROM demo_signatures
				`)

				signatures.must.eql([new ValidDemoSignature({
					id: 1,
					token: Buffer.from(token, "hex"),
					country: "EE",
					personal_id: PERSONAL_ID.slice(0, 5),
					method: "smart-id",
					xades: signatures[0].xades,
					signed: true,
					timestamped: true
				})])

				signatures[0].xades.toString().must.equal(String(xades))
			})
		})
	})

	describe(`GET /:token for ${ASICE_TYPE}`, function() {
		it("must respond with signature ASIC-E", function*() {
			var signature = yield demoSignaturesDb.create(new ValidDemoSignature({
				signed: true,
				timestamped: true
			}))

			var path = `/demo-signatures/${signature.token.toString("hex")}.asice`
			var res = yield this.request(path)
			res.statusCode.must.equal(200)
			res.headers["content-type"].must.equal(ASICE_TYPE)

			var zip = yield Zip.parse(Buffer.from(res.body))
			var entries = yield Zip.parseEntries(zip)
			Object.keys(entries).length.must.equal(4)

			var xades = yield Zip.readEntry(zip, entries["META-INF/signatures-1.xml"])
			xades.must.equal(String(signature.xades))

			var text = yield Zip.readEntry(zip, entries["dokument.txt"])
			text.must.equal(SIGNABLE_TEXT)
		})

		it("must respond with 404 if no signature", function*() {
			var res = yield this.request("/demo-signatures/aabbccddee.asice")
			res.statusCode.must.equal(404)
		})

		it("must respond with 404 if invalid token", function*() {
			yield demoSignaturesDb.create(new ValidDemoSignature)
			var res = yield this.request("/demo-signatures/aabbccddee.asice")
			res.statusCode.must.equal(404)
		})

		it("must respond with 425 if not yet signed", function*() {
			var signature = yield demoSignaturesDb.create(new ValidDemoSignature)
			var path = `/demo-signatures/${signature.token.toString("hex")}.asice`
			var res = yield this.request(path)
			res.statusCode.must.equal(425)
			res.statusMessage.must.equal("Not Signed Yet")
		})

		it("must respond with 410 if already deleted", function*() {
			var signature = yield demoSignaturesDb.create(new ValidDemoSignature({
				xades: null,
				signed: true,
				timestamped: true
			}))

			var path = `/demo-signatures/${signature.token.toString("hex")}.asice`
			var res = yield this.request(path)
			res.statusCode.must.equal(410)
			res.statusMessage.must.equal("Gone")
		})
	})
})

function certWithSmartId(router, request, cert) {
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

	return request(`/demo-signatures`, {
		method: "POST",
		form: {method: "smart-id", personalId: PERSONAL_ID}
	})
}

function* signWithIdCard(router, request, cert) {
	var signing = yield request("/demo-signatures", {
		method: "POST",
		headers: {Accept: SIGNABLE_TYPE, "Content-Type": CERTIFICATE_TYPE},
		body: cert.toBuffer()
	})

	signing.statusCode.must.equal(202)

	var xades = yield signablesDb.read(sql`
		SELECT * FROM demo_signatures ORDER BY created_at DESC LIMIT 1
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

function* signWithMobileId(router, request, cert, res) {
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
				SELECT xades FROM demo_signatures ORDER BY created_at DESC LIMIT 1
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

	var signing = yield request("/demo-signatures", {
		method: "POST",
		form: {
			method: "mobile-id",
			personalId: PERSONAL_ID,
			phoneNumber: "+37200000766"
		}
	})

	signing.statusCode.must.equal(202)

	return request(signing.headers.location, {
		headers: {Accept: `application/x-empty, ${ERR_TYPE}`}
	})
}

function* signWithSmartId(router, request, cert, res) {
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
				SELECT xades FROM demo_signatures ORDER BY created_at DESC LIMIT 1
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
		res.flushHeaders()
		
		// NOTE: Respond with a little delay to ensure signature
		// polling later works as expected.
		setTimeout(() => res.end(Ocsp.parse(newOcspResponse(cert)).toBuffer(), 10))
	})

	var signing = yield certWithSmartId(router, request, cert)
	signing.statusCode.must.equal(202)

	return request(signing.headers.location, {
		headers: {Accept: `application/x-empty, ${ERR_TYPE}`}
	})
}

function newXades(cert) {
	var xades = hades.new(cert, [{
		path: "dokument.txt",
		type: "text/plain",
		hash: SIGNABLE_TEXT_SHA256
	}], {policy: "bdoc"})

	xades.setSignature(signWithRsa(
		JOHN_RSA_KEYS.privateKey,
		xades.signable
	))

	var ocspResponse = Ocsp.parse(newOcspResponse(cert))
	xades.setOcspResponse(ocspResponse)
	return xades
}

function signWithRsa(key, signable) {
	return Crypto.createSign("sha256").update(signable).sign(key)
}
