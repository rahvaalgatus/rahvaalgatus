var _ = require("root/lib/underscore")
var Mime = require("mime")
var Asic = require("undersign/lib/asic")
var Path = require("path")
var MobileId = require("undersign/lib/mobile_id")
var SmartId = require("undersign/lib/smart_id")
var MediaType = require("medium-type")
var Router = require("express").Router
var HttpError = require("standard-http-error")
var MobileIdError = require("undersign/lib/mobile_id").MobileIdError
var SmartIdError = require("undersign/lib/smart_id").SmartIdError
var Certificate = require("undersign/lib/certificate")
var ResponseTypeMiddeware =
	require("root/lib/middleware/response_type_middleware")
var next = require("co-next")
var co = require("co")
var sql = require("sqlate")
var dispose = require("content-disposition")
var reportError = require("root").errorReporter
var sleep = require("root/lib/promise").sleep
var mobileId = require("root").mobileId
var smartId = require("root").smartId
var hades = require("root").hades
var parseBody = require("body-parser").raw
var signaturesDb = require("root/db/initiative_signatures_db")
var signablesDb = require("root/db/initiative_signables_db")
var {ensureAreaCode} = require("root/lib/mobile_id")
var constantTimeEqual = require("root/lib/crypto").constantTimeEqual
var {getCertificatePersonalId} = require("root/lib/certificate")
var ENV = process.env.NODE_ENV
var logger = require("root").logger
var {validateCertificate} = require("root/lib/certificate")
var getNormalizedMobileIdErrorCode =
	require("root/lib/mobile_id").getNormalizedErrorCode
exports.router = Router({mergeParams: true})
exports.pathToSignature = pathToSignature
exports.router.use(parseBody({type: hasSignatureType}))

var MOBILE_ID_ERRORS = {
	// Initiation responses:
	NOT_FOUND: [
		422,
		"Not a Mobile-Id User or Personal Id Mismatch",
		"MOBILE_ID_ERROR_NOT_FOUND"
	],

	NOT_ACTIVE: [
		422,
		"Mobile-Id Certificates Not Activated",
		"MOBILE_ID_ERROR_NOT_ACTIVE"
	],

	// Session responses;
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

	// Custom responses:
	INVALID_SIGNATURE: [
		410,
		"Invalid Mobile-Id Signature",
		"MOBILE_ID_ERROR_INVALID_SIGNATURE"
	]
}

var SMART_ID_ERRORS = {
	// Initiation responses:
	ACCOUNT_NOT_FOUND: [
		422,
		"Not a Smart-Id User",
		"SMART_ID_ERROR_NOT_FOUND"
	],

	// Session responses:
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
	],

	// Custom responses:
	INVALID_SIGNATURE: [
		410,
		"Invalid Smart-Id Signature",
		"SMART_ID_ERROR_INVALID_SIGNATURE"
	]
}

exports.router.get("/", next(function*(req, res) {
	var initiative = req.initiative
	var token = Buffer.from(req.query["parliament-token"] || "", "hex")

	if (!initiative.parliament_token)
		throw new HttpError(403, "Signatures Not Available")
	if (!constantTimeEqual(initiative.parliament_token, token))
		throw new HttpError(403, "Invalid Token")
	if (initiative.received_by_parliament_at)
		throw new HttpError(423, "Signatures Already In Parliament")

	var asic = new Asic
	res.setHeader("Content-Type", asic.type)
	res.setHeader("Content-Disposition",
		dispose("signatures.asice", "attachment"))
	asic.pipe(res)

	var extension = Mime.extension(String(initiative.text_type))
	asic.add(`initiative.${extension}`, initiative.text, initiative.text_type)

	var signatures = yield signaturesDb.search(sql`
		SELECT * FROM initiative_signatures
		WHERE initiative_uuid = ${initiative.uuid}
		AND xades IS NOT NULL
		ORDER BY country ASC, personal_id ASC
	`)

	_.map(signatures, "xades").forEach(asic.addSignature, asic)

	asic.end()
}))

exports.router.post("/", next(function*(req, res) {
	var initiative = req.initiative
	var method = res.locals.method = getSigningMethod(req)
	var cert, err, country, personalId, xades, signable, signatureUrl

	switch (method) {
		case "id-card":
			cert = Certificate.parse(req.body)
			if (err = validateCertificate(req.t, cert)) throw err

			;[country, personalId] = getCertificatePersonalId(cert)
			xades = newXades(initiative)

			signable = yield signablesDb.create({
				initiative_uuid: initiative.uuid,
				country: country,
				personal_id: personalId,
				method: "id-card",
				xades: xades
			})

			signatureUrl = req.baseUrl + "/" + pathToSignature(signable)
			res.setHeader("Location", signatureUrl)
			res.setHeader("Content-Type", "application/vnd.rahvaalgatus.signable")
			res.status(202).end(xades.signableHash)
			break

		case "mobile-id":
			var phoneNumber = ensureAreaCode(req.body.phoneNumber)
			personalId = req.body.personalId

			// Log Mobile-Id requests to confirm SK's billing.
			logger.info(
				"Requesting Mobile-Id certificate for %s and %s.",
				phoneNumber,
				personalId
			)

			cert = yield mobileId.readCertificate(phoneNumber, personalId)
			if (err = validateCertificate(req.t, cert)) throw err

			;[country, personalId] = getCertificatePersonalId(cert)
			xades = newXades(initiative)

			// The Mobile-Id API returns any signing errors only when its status is
			// queried, not when signing is initiated.
			logger.info(
				"Signing via Mobile-Id for %s and %s.",
				phoneNumber,
				personalId
			)

			var sessionId = yield mobileId.sign(
				phoneNumber,
				personalId,
				xades.signableHash
			)

			signable = yield signablesDb.create({
				initiative_uuid: initiative.uuid,
				country: country,
				personal_id: personalId,
				method: "mobile-id",
				xades: xades
			})

			signatureUrl = req.baseUrl + "/" + pathToSignature(signable)
			res.setHeader("Location", signatureUrl)

			res.status(202).render("initiatives/signatures/creating_page.jsx", {
				code: MobileId.confirmation(xades.signableHash),
				poll: signatureUrl
			})

			co(waitForMobileIdSignature(signable, sessionId))
			break

		case "smart-id":
			personalId = req.body.personalId

			// Log Smart-Id requests to confirm SK's billing.
			logger.info("Requesting Smart-Id certificate for %s.", personalId)

			cert = yield smartId.certificate("PNOEE-" + personalId)
			cert = yield smartId.wait(cert, 90)
			if (err = validateCertificate(req.t, cert)) throw err

			;[country, personalId] = getCertificatePersonalId(cert)
			xades = newXades(initiative)

			logger.info("Signing via Smart-Id for %s.", personalId)

			// The Smart-Id API returns any signing errors only when its status is
			// queried, not when signing is initiated.
			var signSession = yield smartId.sign(cert, xades.signableHash)

			signable = yield signablesDb.create({
				initiative_uuid: initiative.uuid,
				country: country,
				personal_id: personalId,
				method: "smart-id",
				xades: xades
			})

			signatureUrl = req.baseUrl + "/" + pathToSignature(signable)
			res.setHeader("Location", signatureUrl)

			res.status(202).render("initiatives/signatures/creating_page.jsx", {
				code: SmartId.verification(xades.signableHash),
				poll: signatureUrl
			})

			co(waitForSmartIdSignature(signable, signSession))
			break

		default: throw new HttpError(422, "Unknown Signing Method")
	}

	function newXades(initiative) {
		return hades.new(cert, [{
			path: `initiative.${Mime.extension(String(initiative.text_type))}`,
			type: initiative.text_type,
			hash: initiative.text_sha256
		}], {policy: "bdoc"})
	}
}))

exports.router.use("/", next(function(err, req, res, next) {
	if (err instanceof MobileIdError) {
		var code = getNormalizedMobileIdErrorCode(err)

		if (code in MOBILE_ID_ERRORS) {
			res.statusCode = MOBILE_ID_ERRORS[code][0]
			res.statusMessage = MOBILE_ID_ERRORS[code][1]

			res.render("initiatives/signatures/creating_page.jsx", {
				error: req.t(MOBILE_ID_ERRORS[code][2])
			})
		}
		else throw new HttpError(500, "Unknown Mobile-Id Error", {error: err})
	}
	else if (err instanceof SmartIdError) {
		if (err.code in SMART_ID_ERRORS) {
			res.statusCode = SMART_ID_ERRORS[err.code][0]
			res.statusMessage = SMART_ID_ERRORS[err.code][1]

			res.render("initiatives/signatures/creating_page.jsx", {
				error: req.t(SMART_ID_ERRORS[err.code][2])
			})
		}
		else throw new HttpError(500, "Unknown Smart-Id Error", {error: err})
	}
	else next(err)
}))

exports.router.use("/:personalId", next(function*(req, _res, next) {
	var initiative = req.initiative
	var [country, personalId] = parseSignatureId(req.params.personalId)
	var token = req.token = Buffer.from(req.query.token || "", "hex")
	req.country = country
	req.personalId = personalId

	// NOTE: Don't read the signature unconditionally to at least reduce timing
	// leaks. Especially don't differentiate between non-existent signatures
	// and invalid tokens in the error response.
	req.signature = yield signaturesDb.read(sql`
		SELECT * FROM initiative_signatures
		WHERE initiative_uuid = ${initiative.uuid}
		AND country = ${country}
		AND personal_id = ${personalId}
		AND token = ${token}
	`)

	next()
}))

exports.router.get("/:personalId",
	new ResponseTypeMiddeware([
		"text/html",
		"application/vnd.etsi.asic-e+zip",
		"application/x-empty"
	].map(MediaType)),
	next(function*(req, res) {
	var initiative = req.initiative
	var signature = req.signature

	switch (res.contentType.name) {
		case "text/html":
		case "application/x-empty":
			var signable

			if (!signature) for (
				var end = Date.now() + 120 * 1000;
				Date.now() < end;
				yield sleep(ENV == "test" ? 50 : 500)
			) {
				signable = yield signablesDb.read(sql`
					SELECT signed, timestamped, error
					FROM initiative_signables
					WHERE initiative_uuid = ${initiative.uuid}
					AND country = ${req.country}
					AND personal_id = ${req.personalId}
					AND token = ${req.token}
				`)

				if (signable == null) throw new HttpError(404, "Signature Not Found")
				// Wait until not only signing, but timestamping finishes, to have the
				// signature count on the initiative page increment after the redirect.
				if (signable.timestamped || signable.error) break
			}

			if (signature || signable.signed) {
				res.statusCode = 204
				res.flash("signatureToken", req.token.toString("hex"))
			}
			else if (signable.error) {
				var err = signable.error

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
			else if (signable.method == "mobile-id") {
				res.statusCode = 408
				res.flash("error", req.t("MOBILE_ID_ERROR_TIMEOUT"))
			}
			else {
				res.statusCode = 408
				res.flash("error", req.t("SMART_ID_ERROR_TIMEOUT_SIGN"))
			}

			res.setHeader("Location", Path.dirname(req.baseUrl))
			switch (res.contentType.name) {
				case "application/x-empty": return void res.end()
				default: return void res.status(303).end()
			}
			
		case "application/vnd.etsi.asic-e+zip":
			if (signature == null) throw new HttpError(404)

			var asic = new Asic
			res.setHeader("Content-Type", asic.type)
			res.setHeader("Content-Disposition",
				dispose("signature.asice", "attachment"))
			asic.pipe(res)

			asic.addSignature(signature.xades)
			var extension = Mime.extension(String(initiative.text_type))
			asic.add(`initiative.${extension}`, initiative.text, initiative.text_type)
			asic.end()
			break

		default: throw new HttpError(406)
	}
}))

exports.router.put("/:personalId",
	new ResponseTypeMiddeware([
		"text/html",
		"application/x-empty"
	].map(MediaType)),
	next(function*(req, res) {
	var initiative = req.initiative
	var signature = req.signature

	// Responding to a hidden signature if you know its token is not a privacy
	// leak given that if you have the token, you already know for a fact it
	// was once signed.
	switch (req.contentType && req.contentType.name) {
		case "application/vnd.rahvaalgatus.signature":
			if (signature) throw new HttpError(409, "Already Signed")

			var signable = yield signablesDb.read(sql`
				SELECT *
				FROM initiative_signables
				WHERE initiative_uuid = ${initiative.uuid}
				AND country = ${req.country}
				AND personal_id = ${req.personalId}
				AND token = ${req.token}
			`)

			if (signable == null) throw new HttpError(404, "Signature Not Found")

			var xades = signable.xades

			if (!xades.certificate.hasSigned(xades.signable, req.body))
				throw new HttpError(409, "Invalid Signature")

			xades.setSignature(req.body)

			yield signablesDb.update(signable, {
				xades: xades,
				signed: true,
				updated_at: new Date
			})

			logger.info(
				"Requesting timemark for signable %s%s.",
				signable.country,
				signable.personal_id
			)

			xades.setOcspResponse(yield hades.timemark(xades))

			yield signablesDb.update(signable, {
				xades: xades,
				timestamped: true,
				updated_at: new Date
			})

			yield replaceSignature(signable)
			res.flash("signatureToken", req.token.toString("hex"))
			res.setHeader("Location", Path.dirname(req.baseUrl))

			switch (res.contentType.name) {
				case "application/x-empty": return void res.status(204).end()
				default: return void res.status(303).end()
			}

		case "application/json":
		case "application/x-www-form-urlencoded":
			if (signature == null) throw new HttpError(404, "Signature Not Found")

			yield signaturesDb.update(signature, {
				hidden: _.parseBoolean(req.body.hidden),
				updated_at: new Date
			})

			res.flash("notice", req.t("SIGNATURE_HIDDEN"))
			res.redirect(303, Path.dirname(req.baseUrl))
			break

		default: throw new HttpError(415)
	}
}))

exports.router.delete("/:personalId", next(function*(req, res) {
	var signature = req.signature
	if (signature == null) throw new HttpError(404)

	yield signaturesDb.delete(signature)
	res.flash("notice", req.t("SIGNATURE_REVOKED"))
	res.redirect(303, Path.dirname(req.baseUrl))
}))

function* waitForMobileIdSignature(signable, sessionId) {
	try {
		var xades = signable.xades
		var signatureHash

		for (
			var started = new Date;
			signatureHash == null && new Date - started < 120 * 1000;
		) signatureHash = yield mobileId.waitForSignature(sessionId, 30)
		if (signatureHash == null) throw new MobileIdError("TIMEOUT")

		if (!xades.certificate.hasSigned(xades.signable, signatureHash))
			throw new MobileIdError("INVALID_SIGNATURE")

		xades.setSignature(signatureHash)

		yield signablesDb.update(signable, {
			xades: xades,
			signed: true,
			updated_at: new Date
		})

		logger.info(
			"Requesting timemark for signable %s%s.",
			signable.country,
			signable.personal_id
		)

		xades.setOcspResponse(yield hades.timemark(xades))

		yield signablesDb.update(signable, {
			xades: xades,
			timestamped: true,
			updated_at: new Date
		})

		yield replaceSignature(signable)
	}
	catch (ex) {
		if (!(
			ex instanceof MobileIdError &&
			getNormalizedMobileIdErrorCode(ex) in MOBILE_ID_ERRORS
		)) reportError(ex)

		yield signablesDb.update(signable, {error: ex, updated_at: new Date})
	}
}

function* waitForSmartIdSignature(signable, session) {
	try {
		var xades = signable.xades
		var certAndSignatureHash

		for (
			var started = new Date;
			certAndSignatureHash == null && new Date - started < 120 * 1000;
		) certAndSignatureHash = yield smartId.wait(session, 30)
		if (certAndSignatureHash == null) throw new SmartIdError("TIMEOUT")

		var [_cert, signatureHash] = certAndSignatureHash
		if (!xades.certificate.hasSigned(xades.signable, signatureHash))
			throw new SmartIdError("INVALID_SIGNATURE")

		xades.setSignature(signatureHash)

		yield signablesDb.update(signable, {
			xades: xades,
			signed: true,
			updated_at: new Date
		})

		logger.info(
			"Requesting timemark for signable %s%s.",
			signable.country,
			signable.personal_id
		)

		xades.setOcspResponse(yield hades.timemark(xades))

		yield signablesDb.update(signable, {
			xades: xades,
			timestamped: true,
			updated_at: new Date
		})

		yield replaceSignature(signable)
	}
	catch (ex) {
		if (!(ex instanceof SmartIdError && ex.code in SMART_ID_ERRORS))
			reportError(ex)

		yield signablesDb.update(signable, {error: ex, updated_at: new Date})
	}
}

function pathToSignature(signatureOrSignable) {
	var path = signatureOrSignable.country + signatureOrSignable.personal_id
	return path + "?token=" + signatureOrSignable.token.toString("hex")
}

function hasSignatureType(req) {
	return req.contentType && (
		req.contentType.match("application/pkix-cert") ||
		req.contentType.match("application/vnd.rahvaalgatus.signature")
	)
}

function getSigningMethod(req) {
	var type = req.contentType.name

	return (
		type == "application/x-www-form-urlencoded" ? req.body.method
		: type == "application/pkix-cert" ? "id-card"
		: type == "application/vnd.rahvaalgatus.signature" ? "id-card"
		: null
	)
}

function* replaceSignature(signable) {
	var signature = yield signaturesDb.read(sql`
		SELECT * FROM initiative_signatures
		WHERE initiative_uuid = ${signable.initiative_uuid}
		AND country = ${signable.country}
		AND personal_id = ${signable.personal_id}
	`)
	
	if (signature) yield signaturesDb.delete(signature)

	yield signaturesDb.create({
		initiative_uuid: signable.initiative_uuid,
		country: signable.country,
		personal_id: signable.personal_id,
		method: signable.method,
		token: signable.token,
		xades: signable.xades,
		oversigned: signature && !signature.hidden && signature.oversigned + 1 || 0,
		created_at: new Date,
		updated_at: new Date
	})
}

function parseSignatureId(id) { return [id.slice(0, 2), id.slice(2)] }
