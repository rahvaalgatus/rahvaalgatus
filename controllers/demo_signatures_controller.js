var _ = require("root/lib/underscore")
var Asic = require("undersign/lib/asic")
var Config = require("root").config
var Router = require("express").Router
var DateFns = require("date-fns")
var MobileId = require("undersign/lib/mobile_id")
var SmartId = require("undersign/lib/smart_id")
var MobileIdError = require("undersign/lib/mobile_id").MobileIdError
var SmartIdError = require("undersign/lib/smart_id").SmartIdError
var HttpError = require("standard-http-error")
var MediaType = require("medium-type")
var Certificate = require("undersign/lib/certificate")
var ResponseTypeMiddeware =
	require("root/lib/middleware/response_type_middleware")
var t = require("root/lib/i18n").t.bind(null, Config.language)
var {getSigningMethod} = require("./initiatives/signatures_controller")
var demoSignaturesDb = require("root/db/demo_signatures_db")
var dispose = require("content-disposition")
var sha256 = require("root/lib/crypto").hash.bind(null, "sha256")
var next = require("co-next")
var mobileId = require("root").mobileId
var smartId = require("root").smartId
var hades = require("root").hades
var reportError = require("root").errorReporter
var {validateSigningCertificate} = require("root/lib/certificate")
var {ensureAreaCode} = require("root/lib/mobile_id")
var {getCertificatePersonalId} = require("root/lib/certificate")
var parseBody = require("body-parser").raw
var getNormalizedMobileIdErrorCode =
	require("root/lib/mobile_id").getNormalizedErrorCode
var co = require("co")
var sql = require("sqlate")
var sleep = require("root/lib/promise").sleep
var sqlite = require("root").sqlite
var ENV = process.env.ENV
var {hasSignatureType} = require("./initiatives/signatures_controller")
var {waitForMobileIdSession} = require("./initiatives/signatures_controller")
var {waitForSmartIdSession} = require("./initiatives/signatures_controller")
var SIGNABLE_TEXT = t("DEMO_SIGNATURES_SIGNABLE")
var SIGNABLE_TEXT_SHA256 = sha256(SIGNABLE_TEXT)
var {MOBILE_ID_ERRORS} = require("./initiatives/signatures_controller")
var {SMART_ID_ERRORS} = require("./initiatives/signatures_controller")
var EXPIRATION = Config.demoSignaturesExpirationSeconds

exports.router = Router({mergeParams: true})
exports.router.use(require("root/lib/middleware/canonical_site_middleware"))
exports.router.use(parseBody({type: hasSignatureType}))

exports.router.get("/", function(_req, res) {
	var today = new Date

	var signatureCount = sqlite(sql`
		SELECT COUNT(*) AS count FROM demo_signatures
	`)[0].count

	var signatureCountsByDate = _.mapValues(_.indexBy(sqlite(sql`
		SELECT date(datetime(created_at, 'localtime')) AS date, COUNT(*) AS count
		FROM demo_signatures
		WHERE signed AND timestamped
		AND created_at >= ${DateFns.addDays(today, -7)}
		GROUP BY date(datetime(created_at, 'localtime'))
	`), "date"), (row) => row.count)

	res.render("demo_signatures/index_page.jsx", {
		signatureCount: signatureCount,
		signatureCountsByDate: signatureCountsByDate
	})
})

exports.router.get("/signable", function(_req, res) {
	res.setHeader("Content-Type", "text/plain; charset=utf-8")
	res.setHeader("Content-Disposition", dispose("dokument.txt", "attachment"))
	res.end(SIGNABLE_TEXT)
})

exports.router.post("/", next(function*(req, res) {
	var method = res.locals.method = getSigningMethod(req)
	var cert, err, country, xades, signature, signatureUrl
	var personalId, sanitizedPersonalId

	switch (method) {
		case "id-card":
			cert = Certificate.parse(req.body)
			if (err = validateSigningCertificate(req.t, cert)) throw err

			;[country, personalId] = getCertificatePersonalId(cert)
			xades = newXades()

			signature = demoSignaturesDb.create({
				country: country,
				personal_id: sanitizePersonalId(personalId),
				method: "id-card",
				created_at: new Date,
				updated_at: new Date,
				xades: xades
			})

			signatureUrl = req.baseUrl + "/" + signature.token.toString("hex")
			res.setHeader("Location", signatureUrl)
			res.setHeader("Content-Type", "application/vnd.rahvaalgatus.signable")
			res.status(202).end(xades.signableHash)
			break

		case "mobile-id":
			var phoneNumber = ensureAreaCode(req.body.phoneNumber)
			personalId = req.body.personalId
			sanitizedPersonalId = sanitizePersonalId(personalId)

			cert = yield mobileId.readCertificate(phoneNumber, personalId)
			if (err = validateSigningCertificate(req.t, cert)) throw err

			;[country, personalId] = getCertificatePersonalId(cert)
			xades = newXades()

			// The Mobile-Id API returns any signing errors only when its status is
			// queried, not when signing is initiated.
			var sessionId = yield mobileId.sign(
				phoneNumber,
				personalId,
				xades.signableHash
			)

			signature = demoSignaturesDb.create({
				country: country,
				personal_id: sanitizedPersonalId,
				method: "mobile-id",
				created_at: new Date,
				updated_at: new Date,
				xades: xades
			})

			signatureUrl = req.baseUrl + "/" + signature.token.toString("hex")
			res.setHeader("Location", signatureUrl)

			res.status(202).render("demo_signatures/creating_page.jsx", {
				code: MobileId.confirmation(xades.signableHash),
				poll: signatureUrl
			})

			co(waitForMobileIdSignature(signature, sessionId))
			break

		case "smart-id":
			personalId = req.body.personalId
			sanitizedPersonalId = sanitizePersonalId(personalId)

			cert = yield smartId.certificate("PNOEE-" + personalId)
			cert = yield waitForSmartIdSession(90, cert)
			if (cert == null) throw new SmartIdError("TIMEOUT")
			if (err = validateSigningCertificate(req.t, cert)) throw err

			;[country, personalId] = getCertificatePersonalId(cert)
			xades = newXades()

			// The Smart-Id API returns any signing errors only when its status is
			// queried, not when signing is initiated.
			var signSession = yield smartId.sign(cert, xades.signableHash)

			signature = demoSignaturesDb.create({
				country: country,
				personal_id: sanitizePersonalId(personalId),
				method: "smart-id",
				created_at: new Date,
				updated_at: new Date,
				xades: xades
			})

			signatureUrl = req.baseUrl + "/" + signature.token.toString("hex")
			res.setHeader("Location", signatureUrl)

			res.status(202).render("demo_signatures/creating_page.jsx", {
				code: SmartId.verification(xades.signableHash),
				poll: signatureUrl
			})

			co(waitForSmartIdSignature(signature, signSession))
			break

		default: throw new HttpError(422, "Unknown Signing Method")
	}

	function newXades() {
		return hades.new(cert, [{
			path: "dokument.txt",
			type: "text/plain",
			hash: SIGNABLE_TEXT_SHA256
		}], {policy: "bdoc"})
	}
}))

exports.router.use("/", next(function(err, req, res, next) {
	if (err instanceof MobileIdError) {
		var code = getNormalizedMobileIdErrorCode(err)

		if (code in MOBILE_ID_ERRORS) {
			res.statusCode = MOBILE_ID_ERRORS[code][0]
			res.statusMessage = MOBILE_ID_ERRORS[code][1]

			res.render("demo_signatures/creating_page.jsx", {
				error: req.t(MOBILE_ID_ERRORS[code][2])
			})
		}
		else throw new HttpError(500, "Unknown Mobile-Id Error", {error: err})
	}
	else if (err instanceof SmartIdError) {
		if (err.code in SMART_ID_ERRORS) {
			res.statusCode = SMART_ID_ERRORS[err.code][0]
			res.statusMessage = SMART_ID_ERRORS[err.code][1]

			res.render("demo_signatures/creating_page.jsx", {
				error: req.t(SMART_ID_ERRORS[err.code][2])
			})
		}
		else throw new HttpError(500, "Unknown Smart-Id Error", {error: err})
	}
	else next(err)
}))

exports.router.use("/:token", function(req, _res, next) {
	var signature = demoSignaturesDb.read(sql`
		SELECT * FROM demo_signatures
		WHERE token = ${Buffer.from(req.params.token || "", "hex")}
	`)

	if (signature == null) throw new HttpError(404, "Signature Not Found")
	req.signature = signature
	next()
})

exports.router.get("/:token",
	new ResponseTypeMiddeware([
		"text/html",
		"application/vnd.etsi.asic-e+zip",
		"application/x-empty"
	].map(MediaType)),
	next(function*(req, res) {
	var signature = req.signature

	switch (res.contentType.name) {
		case "text/html":
		case "application/x-empty":
			var signing

			if (!(signature.timestamped || signature.error)) for (
				var end = Date.now() + 120 * 1000;
				Date.now() < end;
				yield sleep(ENV == "test" ? 50 : 500)
			) {
				signing = demoSignaturesDb.read(sql`
					SELECT signed, timestamped, error
					FROM demo_signatures
					WHERE id = ${signature.id}
				`)

				if (signing.timestamped || signing.error) break
			}

			var err = signature.error || signing && signing.error

			if (signature.timestamped || signing && signing.timestamped) {
				res.statusCode = res.contentType.subtype == "x-empty" ? 204 : 200
			}
			else if (err) {
				if (err.name == "MobileIdError") {
					if (err.code in MOBILE_ID_ERRORS) {
						res.statusCode = MOBILE_ID_ERRORS[err.code][0]
						res.statusMessage = MOBILE_ID_ERRORS[err.code][1]
						res.flash("error", req.t(MOBILE_ID_ERRORS[err.code][2]))
					}
					else {
						res.statusCode = 500
						res.statusMessage = "Unknown Mobile-Id Error"
						res.flash("error", req.t("500_BODY"))
					}
				}
				else if (err.name == "SmartIdError") {
					if (err.code in SMART_ID_ERRORS) {
						res.statusCode = SMART_ID_ERRORS[err.code][0]
						res.statusMessage = SMART_ID_ERRORS[err.code][1]
						res.flash("error", req.t(SMART_ID_ERRORS[err.code][2]))
					}
					else {
						res.statusCode = 500
						res.statusMessage = "Unknown Smart-Id Error"
						res.flash("error", req.t("500_BODY"))
					}
				}
				else {
					res.statusCode = 500
					res.flash("error", req.t("500_BODY"))
				}
			}
			else if (signature.method == "mobile-id") {
				res.statusCode = 408
				res.flash("error", req.t("MOBILE_ID_ERROR_TIMEOUT"))
			}
			else {
				res.statusCode = 408
				res.flash("error", req.t("SMART_ID_ERROR_TIMEOUT_SIGN"))
			}

			res.setHeader("Location", req.baseUrl + req.path)
			switch (res.contentType.name) {
				case "application/x-empty": return void res.end()

				default:
					if (res.statusCode >= 400)
						return void res.render("demo_signatures/creating_page.jsx", {
							error: req.flash("error")
						})
					else return void res.render("demo_signatures/created_page.jsx")
			}

		case "application/vnd.etsi.asic-e+zip":
			if (!signature.timestamped) throw new HttpError(425, "Not Signed Yet")

			if (signature.xades == null)
				throw new HttpError(410)
			if (new Date >= DateFns.addSeconds(signature.updated_at, EXPIRATION))
				throw new HttpError(410)

			var asic = new Asic
			res.setHeader("Content-Type", asic.type)
			res.setHeader("Content-Disposition",
				dispose("signature.asice", "attachment"))
			asic.pipe(res)

			asic.addSignature(String(signature.xades))
			asic.add("dokument.txt", SIGNABLE_TEXT, "text/plain")
			asic.end()
			break

		default: throw new HttpError(406)
	}
}))

exports.router.put("/:token",
	new ResponseTypeMiddeware([
		"text/html",
		"application/x-empty"
	].map(MediaType)),
	next(function*(req, res) {
	var signature = req.signature

	switch (req.contentType && req.contentType.name) {
		case "application/vnd.rahvaalgatus.signature":
			if (signature.signed) throw new HttpError(409, "Already Signed")

			var xades = signature.xades

			if (!xades.certificate.hasSigned(xades.signable, req.body))
				throw new HttpError(409, "Invalid Signature")

			xades.setSignature(req.body)

			demoSignaturesDb.update(signature, {
				xades: xades,
				signed: true,
				updated_at: new Date
			})

			xades.setOcspResponse(yield hades.timemark(xades))

			demoSignaturesDb.update(signature, {
				xades: xades,
				timestamped: true,
				updated_at: new Date
			})

			var signatureUrl = req.baseUrl + "/" + signature.token.toString("hex")
			res.setHeader("Location", signatureUrl)

			switch (res.contentType.name) {
				case "application/x-empty": return void res.status(204).end()
				default: return void res.status(303).end()
			}

		default: throw new HttpError(415)
	}
}))

function* waitForMobileIdSignature(signature, sessionId) {
	try {
		var xades = signature.xades
		var signatureHash = yield waitForMobileIdSession(120, sessionId)
		if (signatureHash == null) throw new MobileIdError("TIMEOUT")

		if (!xades.certificate.hasSigned(xades.signable, signatureHash))
			throw new MobileIdError("INVALID_SIGNATURE")

		xades.setSignature(signatureHash)

		demoSignaturesDb.update(signature, {
			xades: xades,
			signed: true,
			updated_at: new Date
		})

		xades.setOcspResponse(yield hades.timemark(xades))

		demoSignaturesDb.update(signature, {
			xades: xades,
			timestamped: true,
			updated_at: new Date
		})
	}
	catch (ex) {
		if (!(
			ex instanceof MobileIdError &&
			getNormalizedMobileIdErrorCode(ex) in MOBILE_ID_ERRORS
		)) reportError(ex)

		demoSignaturesDb.update(signature, {error: ex, updated_at: new Date})
	}
}

function* waitForSmartIdSignature(signature, session) {
	try {
		var xades = signature.xades
		var certAndSignatureHash = yield waitForSmartIdSession(120, session)
		if (certAndSignatureHash == null) throw new SmartIdError("TIMEOUT")

		var [_cert, signatureHash] = certAndSignatureHash
		if (!xades.certificate.hasSigned(xades.signable, signatureHash))
			throw new SmartIdError("INVALID_SIGNATURE")

		xades.setSignature(signatureHash)

		demoSignaturesDb.update(signature, {
			xades: xades,
			signed: true,
			updated_at: new Date
		})

		xades.setOcspResponse(yield hades.timemark(xades))

		demoSignaturesDb.update(signature, {
			xades: xades,
			timestamped: true,
			updated_at: new Date
		})
	}
	catch (ex) {
		if (!(ex instanceof SmartIdError && ex.code in SMART_ID_ERRORS))
			reportError(ex)

		demoSignaturesDb.update(signature, {error: ex, updated_at: new Date})
	}
}

function sanitizePersonalId(personalId) { return personalId.slice(0, 5) }
