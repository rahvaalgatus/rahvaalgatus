var _ = require("root/lib/underscore")
var Jsx = require("j6pack")
var Trix = require("root/lib/trix")
var Router = require("express").Router
var HttpError = require("standard-http-error")
var SmartId = require("undersign/lib/smart_id")
var MobileId = require("undersign/lib/mobile_id")
var Certificate = require("undersign/lib/certificate")
var MediaType = require("medium-type")
var ResponseTypeMiddeware =
	require("root/lib/middleware/response_type_middleware")
var {SmartIdError} = require("undersign/lib/smart_id")
var {MobileIdError} = require("undersign/lib/mobile_id")
var initiativesDb = require("root/db/initiatives_db")
var textSignaturesDb = require("root/db/initiative_text_signatures_db")
var textsDb = require("root/db/initiative_texts_db")
var next = require("co-next")
var {getSigningMethod} = require("./signatures_controller")
var {validateCertificate} = require("root/lib/certificate")
var {ensureAreaCode} = require("root/lib/mobile_id")
var {getCertificatePersonalId} = require("root/lib/certificate")
var {waitForMobileIdSession} = require("./signatures_controller")
var {waitForSmartIdSession} = require("./signatures_controller")
var sha256 = require("root/lib/crypto").hash.bind(null, "sha256")
var co = require("co")
var outdent = require("root/lib/outdent")
var sql = require("sqlate")
var hades = require("root").hades
var logger = require("root").logger
var mobileId = require("root").mobileId
var smartId = require("root").smartId
var parseBody = require("body-parser").raw
var t = require("root/lib/i18n").t.bind(null, "et")
var reportError = require("root").errorReporter
var getNormalizedMobileIdErrorCode =
	require("root/lib/mobile_id").getNormalizedErrorCode
var {hasSignatureType} = require("./signatures_controller")
var {MOBILE_ID_ERRORS} = require("./signatures_controller")
var {SMART_ID_ERRORS} = require("./signatures_controller")
var LANGUAGES = require("root/config").languages
var AFFIRMATION = t("INITIATIVE_TRANSLATION_SIGNABLE_INTRO")
exports.parse = parse
exports.renderForSigning = renderForSigning

exports.router = Router({mergeParams: true})
exports.router.use(parseBody({type: hasSignatureType}))

exports.router.use(function(req, _res, next) {
	var user = req.user
	if (user == null) throw new HttpError(401)

	var initiative = req.initiative

	if (!(user && initiative.user_id == user.id))
		throw new HttpError(403, "No Permission to Edit")

	if (!(initiative.phase == "edit" || initiative.phase == "sign"))
		throw new HttpError(403, "Not Editable")

	next()
})

exports.router.get("/new", next(function*(req, res) {
	var initiative = req.initiative
	var lang = req.query.language || "et"

	var text = yield textsDb.read(sql`
		SELECT * FROM initiative_texts
		WHERE initiative_uuid = ${initiative.uuid}
		AND language = ${lang}
		ORDER BY created_at DESC
		LIMIT 1
	`)

	if (text) res.redirect(req.baseUrl + "/" + text.id)
	else res.render("initiatives/update_page.jsx", {language: lang})
}))

exports.router.use("/:id", next(function*(req, _res, next) {
	var initiative = req.initiative

	var text = yield textsDb.read(sql`
		SELECT * FROM initiative_texts
		WHERE initiative_uuid = ${initiative.uuid}
		AND id = ${req.params.id}
	`)

	if (text == null) throw new HttpError(404)

	req.text = text
	next()
}))

exports.router.get("/:id", function(req, res) {
	res.render("initiatives/update_page.jsx", {text: req.text})
})

exports.router.post("/", next(function*(req, res) {
	var user = req.user
	var initiative = req.initiative
	var attrs = parse(req.body)

	if (!(
		initiative.phase == "edit" ||
		initiative.phase == "sign"
	)) throw new HttpError(405, "Can Only Add Text in Edit or Sign Phase")

	if (!(
		initiative.phase == "edit" ||
		initiative.phase == "sign" && initiative.language != attrs.language
	)) throw new HttpError(405, "Can Only Add Translations")

	// Matching basis are also enforced by the database schema, but let's not
	// throw an SQL error should something happen to the basis.
	if (attrs.basis_id && !(yield textsDb.read(sql`
		SELECT true FROM initiative_texts
		WHERE initiative_uuid = ${initiative.uuid}
		AND id = ${attrs.basis_id}
	`))) attrs.basis_id = null

	var text = yield textsDb.create({
		__proto__: attrs,
		initiative_uuid: initiative.uuid,
		user_id: user.id,
		created_at: new Date
	})

	if (
		initiative.phase == "edit" && (
			initiative.language == text.language ||
			_.parseBoolean(req.body["set-default"])
		)
	) initiative = yield initiativesDb.update(initiative, {
		title: text.title,
		language: text.language
	})

	res.flash("notice",
		initiative.published_at && initiative.language == text.language
		? req.t("INITIATIVE_TEXT_CREATED_IF_PUBLISHED")
		: req.t("INITIATIVE_TEXT_CREATED")
	)

	var path = "/initiatives/" + initiative.uuid
	if (text.language != initiative.language) path += "?language=" + text.language
	res.redirect(path)
}))

exports.router.get("/:id/sign", function(req, res) {
	res.render("initiatives/texts/sign_page.jsx", {text: req.text})
})

exports.router.get("/:id/signable", function(req, res) {
	var text = req.text
	return void res.send(renderForSigning(text))
})

exports.router.post("/:id/signatures", next(function*(req, res) {
	var t = req.t
	var text = req.text
	var user = req.user
	var signable = renderForSigning(text)
	var method = res.locals.method = getSigningMethod(req)
	var cert, err, country, xades, signature, verificationCode
	var personalId

	switch (method) {
		case "id-card":
			cert = Certificate.parse(req.body)
			if (err = validateCertificate(req.t, cert)) throw err

			;[country, personalId] = getCertificatePersonalId(cert)
			if (err = validateSigner(req.t, user, country, personalId)) throw err

			xades = newXades(signable)

			signature = yield createSignature(
				text,
				country,
				personalId,
				signable,
				xades,
				"id-card"
			)

			var signatureUrl = req.baseUrl + "/" + text.id
			signatureUrl += "/signatures/" + signature.id
			res.setHeader("Location", signatureUrl)
			res.setHeader("Content-Type", "application/vnd.rahvaalgatus.signable")
			res.status(202).end(xades.signableHash)
			break

		case "mobile-id":
			var phoneNumber = ensureAreaCode(req.body.phoneNumber)
			personalId = req.body.personalId

			// Log Mobile-Id requests to confirm SK's billing.
			logger.info("Requesting Mobile-Id certificate for %s.", personalId)

			cert = yield mobileId.readCertificate(phoneNumber, personalId)
			if (err = validateCertificate(req.t, cert)) throw err

			;[country, personalId] = getCertificatePersonalId(cert)
			if (err = validateSigner(req.t, user, country, personalId)) throw err

			xades = newXades(signable)

			// The Mobile-Id API returns any signing errors only when its status is
			// queried, not when signing is initiated.
			logger.info("Signing via Mobile-Id for %s.", personalId)

			var sessionId = yield mobileId.sign(
				phoneNumber,
				personalId,
				xades.signableHash
			)

			signature = yield createSignature(
				text,
				country,
				personalId,
				signable,
				xades,
				"mobile-id"
			)

			verificationCode = MobileId.confirmation(xades.signableHash)
			respondWithVerificationCode(verificationCode, res)
			co(waitForMobileIdSignature(t, text, signature, sessionId, res))
			break

		case "smart-id":
			personalId = req.body.personalId

			// Log Smart-Id requests to confirm SK's billing.
			logger.info("Requesting Smart-Id certificate for %s.", personalId)

			cert = yield smartId.certificate("PNOEE-" + personalId)
			cert = yield waitForSmartIdSession(90, cert)
			if (cert == null) throw new SmartIdError("TIMEOUT")
			if (err = validateCertificate(req.t, cert)) throw err

			;[country, personalId] = getCertificatePersonalId(cert)
			if (err = validateSigner(req.t, user, country, personalId)) throw err

			xades = newXades(signable)

			logger.info("Signing via Smart-Id for %s.", personalId)

			// The Smart-Id API returns any signing errors only when its status is
			// queried, not when signing is initiated.
			var signSession = yield smartId.sign(cert, xades.signableHash)

			signature = yield createSignature(
				text,
				country,
				personalId,
				signable,
				xades,
				"smart-id"
			)

			verificationCode = SmartId.verification(xades.signableHash)
			respondWithVerificationCode(verificationCode, res)
			co(waitForSmartIdSignature(t, text, signature, signSession, res))
			break

		default: throw new HttpError(422, "Unknown Signing Method")
	}

	function newXades(signable) {
		return hades.new(cert, [{
			path: "translation.html",
			type: "text/html",
			hash: sha256(signable)
		}], {policy: "bdoc"})
	}

	function respondWithVerificationCode(verificationCode, res) {
		// Without a byte of body, Firefox won't resolve the Fetch promise.
		res.statusCode = 202
		res.setHeader("X-Accel-Buffering", "no")
		res.setHeader("X-Verification-Code", _.padLeft(verificationCode, 4, 0))
		res.setHeader("Content-Type", "application/json")
		res.write("\n")
	}

	function createSignature(text, country, personalId, signable, xades, method) {
		return textSignaturesDb.create({
			text_id: text.id,
			country: country,
			personal_id: personalId,
			method: method,
			created_at: new Date,
			updated_at: new Date,
			signable: signable,
			signable_type: "text/html",
			xades: xades
		})
	}
}), function(err, req, res, next) {
	if (err instanceof MobileIdError) {
		var code = getNormalizedMobileIdErrorCode(err)

		if (code in MOBILE_ID_ERRORS) {
			res.statusCode = MOBILE_ID_ERRORS[code][0]
			res.statusMessage = MOBILE_ID_ERRORS[code][1]

			res.json({
				code: res.statusCode,
				message: res.statusMessage,
				description: req.t(MOBILE_ID_ERRORS[code][2])
			})
		}
		else throw new HttpError(500, "Unknown Mobile-Id Error", {error: err})
	}
	else if (err instanceof SmartIdError) {
		if (err.code in SMART_ID_ERRORS) {
			res.statusCode = SMART_ID_ERRORS[err.code][0]
			res.statusMessage = SMART_ID_ERRORS[err.code][1]

			res.json({
				code: res.statusCode,
				message: res.statusMessage,
				description: req.t(SMART_ID_ERRORS[err.code][2])
			})
		}
		else throw new HttpError(500, "Unknown Smart-Id Error", {error: err})
	}
	else next(err)
})

exports.router.put("/:textId/signatures/:signatureId",
	new ResponseTypeMiddeware([
		"text/html",
		"application/x-empty"
	].map(MediaType)),
	next(function*(req, res) {
	var text = req.text

	var signature = yield textSignaturesDb.read(sql`
		SELECT * FROM initiative_text_signatures
		WHERE text_id = ${text.id}
		AND id = ${req.params.signatureId}
	`)

	if (signature == null) throw new HttpError(404, "Signature Not Found")

	switch (req.contentType && req.contentType.name) {
		case "application/vnd.rahvaalgatus.signature":
			if (signature.signed) throw new HttpError(409, "Already Signed")

			var xades = signature.xades

			if (!xades.certificate.hasSigned(xades.signable, req.body))
				throw new HttpError(409, "Invalid Signature")

			xades.setSignature(req.body)

			yield textSignaturesDb.update(signature, {
				xades: xades,
				signed: true,
				updated_at: new Date
			})

			logger.info("Requesting timemark for text signature %d.", signature.id)
			xades.setOcspResponse(yield hades.timemark(xades))

			yield textSignaturesDb.update(signature, {
				xades: xades,
				timestamped: true,
				updated_at: new Date
			})

			var initiativePath = `/initiatives/${text.initiative_uuid}`
			initiativePath += "?language=" + text.language
			res.setHeader("Location", initiativePath)
			res.flash("notice", req.t("INITIATIVE_TRANSLATION_SIGNED"))

			switch (res.contentType.name) {
				case "application/x-empty": return void res.status(204).end()
				default: return void res.status(303).end()
			}

		default: throw new HttpError(415)
	}
}))

function parse(obj) {
	return {
		title: String(obj.title),
		content: JSON.parse(obj.content),
		content_type: "application/vnd.basecamp.trix+json",
		language: LANGUAGES.includes(obj.language) ? obj.language : "et",
		basis_id: Number(obj["basis-id"]) || null
	}
}

function* waitForMobileIdSignature(_t, text, signature, sessionId, res) {
	try {
		var xades = signature.xades
		var signatureHash = yield waitForMobileIdSession(120, sessionId)
		if (signatureHash == null) throw new MobileIdError("TIMEOUT")

		if (!xades.certificate.hasSigned(xades.signable, signatureHash))
			throw new MobileIdError("INVALID_SIGNATURE")

		xades.setSignature(signatureHash)

		yield textSignaturesDb.update(signature, {
			xades: xades,
			signed: true,
			updated_at: new Date
		})

		logger.info("Requesting timemark for text signature %d.", signature.id)
		xades.setOcspResponse(yield hades.timemark(xades))

		yield textSignaturesDb.update(signature, {
			xades: xades,
			timestamped: true,
			updated_at: new Date
		})

		var initiativePath = `/initiatives/${text.initiative_uuid}`
		initiativePath += "?language=" + text.language
		res.end(JSON.stringify({code: "OK", location: initiativePath}))
	}
	catch (ex) {
		if (!(
			ex instanceof MobileIdError &&
			getNormalizedMobileIdErrorCode(ex) in MOBILE_ID_ERRORS
		)) reportError(ex)

		yield textSignaturesDb.update(signature, {error: ex, updated_at: new Date})
		res.end(serializeError(ex))
	}
}

function* waitForSmartIdSignature(_t, text, signature, session, res) {
	try {
		var xades = signature.xades
		var certAndSignatureHash = yield waitForSmartIdSession(120, session)
		if (certAndSignatureHash == null) throw new SmartIdError("TIMEOUT")

		var [_cert, signatureHash] = certAndSignatureHash
		if (!xades.certificate.hasSigned(xades.signable, signatureHash))
			throw new SmartIdError("INVALID_SIGNATURE")

		xades.setSignature(signatureHash)

		yield textSignaturesDb.update(signature, {
			xades: xades,
			signed: true,
			updated_at: new Date
		})

		logger.info("Requesting timemark for text signature %d.", signature.id)
		xades.setOcspResponse(yield hades.timemark(xades))

		yield textSignaturesDb.update(signature, {
			xades: xades,
			timestamped: true,
			updated_at: new Date
		})

		var initiativePath = `/initiatives/${text.initiative_uuid}`
		initiativePath += "?language=" + text.language
		res.end(JSON.stringify({code: "OK", location: initiativePath}))
	}
	catch (ex) {
		if (!(ex instanceof SmartIdError && ex.code in SMART_ID_ERRORS))
			reportError(ex)

		yield textSignaturesDb.update(signature, {error: ex, updated_at: new Date})
		res.end(serializeError(ex))
	}
}

function renderForSigning(text) {
	switch (String(text.content_type)) {
		case "application/vnd.basecamp.trix+json": return (
			Jsx("html", {lang: "et"}, [
				Jsx("head", null, [
					Jsx("meta", {charset: "utf-8"}),
					Jsx("title", null, [text.title]),

					Jsx("style", null, [outdent`
						body {
							white-space: pre-wrap;
						}
					`])
				]),

				Jsx("body", null, [
					Jsx("p", null, [AFFIRMATION]),

					Jsx("blockquote", {lang: text.language}, [
						Jsx("h1", null, [text.title]),
						Trix.render(text.content, {heading: "h2"})
					])
				])
			])
		).toString("doctype")

		default:
			throw new RangeError("Unsupported content type: " + text.content_type)
	}
}

function validateSigner(t, user, country, personalId) {
	if (!(user.country == country && user.personal_id == personalId))
		return new HttpError(422, "Not Initiative Author", {
			description: t("INITIATIVE_TEXT_SIGNER_NOT_AUTHOR")
		})

	return null
}

function serializeError(err) {
	return JSON.stringify({code: err.code, message: err.message})
}
