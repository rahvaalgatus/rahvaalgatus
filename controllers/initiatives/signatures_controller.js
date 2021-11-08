var _ = require("root/lib/underscore")
var Mime = require("mime")
var Zip = require("root/lib/zip")
var Asic = require("undersign/lib/asic")
var Path = require("path")
var DateFns = require("date-fns")
var MobileId = require("undersign/lib/mobile_id")
var SmartId = require("undersign/lib/smart_id")
var MediaType = require("medium-type")
var Router = require("express").Router
var Initiative = require("root/lib/initiative")
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
var geoipPromise = require("root").geoip
var hades = require("root").hades
var parseBody = require("body-parser").raw
var signaturesDb = require("root/db/initiative_signatures_db")
var signablesDb = require("root/db/initiative_signables_db")
var textsDb = require("root/db/initiative_texts_db")
var citizenosSignaturesDb =
	require("root/db/initiative_citizenos_signatures_db")
var {ensureAreaCode} = require("root/lib/mobile_id")
var constantTimeEqual = require("root/lib/crypto").constantTimeEqual
var {getCertificatePersonalId} = require("root/lib/certificate")
var ENV = process.env.ENV
var logger = require("root").logger
var {validateCertificate} = require("root/lib/certificate")
var getNormalizedMobileIdErrorCode =
	require("root/lib/mobile_id").getNormalizedErrorCode
var LOCAL_GOVERNMENTS = require("root/lib/local_governments")
exports.pathToSignature = pathToSignature
exports.getSigningMethod = getSigningMethod
exports.hasSignatureType = hasSignatureType

var waitForMobileIdSession = exports.waitForMobileIdSession =
	waitForSession.bind(null, mobileId.waitForSignature.bind(mobileId))
var waitForSmartIdSession = exports.waitForSmartIdSession =
	waitForSession.bind(null, smartId.wait.bind(smartId))

var MOBILE_ID_ERRORS = exports.MOBILE_ID_ERRORS = {
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

var SMART_ID_ERRORS = exports.SMART_ID_ERRORS = {
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

exports.router = Router({mergeParams: true})
exports.router.use(parseBody({type: hasSignatureType}))

exports.router.get("/",
	new ResponseTypeMiddeware([
		"application/vnd.etsi.asic-e+zip",
		"application/zip",
		"text/csv"
	].map(MediaType)),
	next(function*(req, res) {
	var t = req.t
	var user = req.user
	var initiative = req.initiative
	var token = parseToken(req.query["parliament-token"] || "")

	if (!initiative.parliament_token)
		throw new HttpError(403, "Signatures Not Available")

	if (!constantTimeEqual(initiative.parliament_token, token))
		throw new HttpError(403, "Invalid Token", {
			description: t("INITIATIVE_SIGNATURES_INVALID_TOKEN")
		})

	if (initiative.received_by_parliament_at)
		throw new HttpError(423, "Signatures Already In Parliament", {
			description: t("INITIATIVE_SIGNATURES_NO_LONGER_AVAILABLE")
		})

	if (initiative.destination != "parliament") {
		if (user == null) throw new HttpError(401)

		var government = LOCAL_GOVERNMENTS[initiative.destination]
		var downloaders = government.signatureDownloadPersonalIds

		if (!downloaders.includes(user.personal_id))
			throw new HttpError(403, "Not a Permitted Downloader", {
				description: t("INITIATIVE_SIGNATURES_NOT_PERMITTED_DOWNLOADER")
			})
	}

	switch (res.contentType.name) {
		case "application/vnd.etsi.asic-e+zip":
			if (req.query.type != null)
				throw new HttpError(400, "Unknown Signatures Type")

			var asic = new Asic
			res.setHeader("Content-Type", asic.type)
			res.setHeader("Content-Disposition",
				dispose("signatures.asice", "attachment"))
			asic.pipe(res)

			asic.add(
				`initiative.${Mime.extension(String(initiative.text_type))}`,
				initiative.text,
				initiative.text_type
			)

			ESTONIAN: if (initiative.language != "et") {
				var estonian = yield textsDb.read(sql`
					SELECT *
					FROM initiative_texts AS text
					JOIN initiative_text_signatures AS sig
					ON sig.text_id = text.id AND sig.signed AND sig.timestamped
					WHERE text.initiative_uuid = ${initiative.uuid}
					AND language = 'et'
					ORDER BY text.id DESC
					LIMIT 1
				`)

				if (estonian == null) break ESTONIAN
				var translationHtml = Initiative.renderForParliament(estonian)
				asic.add("estonian.html", translationHtml, "text/html")
			}

			{
				let signatures, added = 0

				while ((signatures = yield signaturesDb.search(sql`
					SELECT xades FROM initiative_signatures
					WHERE initiative_uuid = ${initiative.uuid}
					AND xades IS NOT NULL
					ORDER BY country ASC, personal_id ASC
					LIMIT ${ENV == "test" ? 1 : 100}
					OFFSET ${added}
				`)).length > 0) {
					_.map(signatures, "xades").forEach(asic.addSignature, asic)
					added += signatures.length
				}
			}

			asic.end()
			break

		case "application/zip":
			if (req.query.type != "citizenos")
				throw new HttpError(400, "Unknown Signatures Type")

			var zip = new Zip
			res.setHeader("Content-Type", zip.type)
			res.setHeader("Content-Disposition",
				dispose("citizenos-signatures.zip", "attachment"))
			zip.pipe(res)

			var citizenosSignatures = yield citizenosSignaturesDb.search(sql`
				SELECT * FROM initiative_citizenos_signatures
				WHERE initiative_uuid = ${initiative.uuid}
				AND asic IS NOT NULL
				ORDER BY country ASC, personal_id ASC
			`)

			citizenosSignatures.forEach(function(signature) {
				var name = signature.country + signature.personal_id + ".asice"
				zip.add(name, signature.asic)
			})

			zip.end()
			break

		case "text/csv":
			res.setHeader("Content-Type", "text/csv; charset=utf-8")
			res.setHeader("Content-Disposition",
				dispose("signatures.csv", "attachment"))

			{
				let signatures, added

				res.write("personal_id,created_at\n")

				for (added = 0; (signatures = yield citizenosSignaturesDb.search(sql`
					SELECT created_at, personal_id FROM initiative_citizenos_signatures
					WHERE initiative_uuid = ${initiative.uuid}
					ORDER BY country ASC, personal_id ASC
					LIMIT ${ENV == "test" ? 1 : 10000}
					OFFSET ${added}
				`)).length > 0; added += signatures.length)
					res.write(signatures.map(serializeSignatureCsv).join(""))

				for (added = 0; (signatures = yield signaturesDb.search(sql`
					SELECT created_at, personal_id FROM initiative_signatures
					WHERE initiative_uuid = ${initiative.uuid}
					ORDER BY country ASC, personal_id ASC
					LIMIT ${ENV == "test" ? 1 : 10000}
					OFFSET ${added}
				`)).length > 0; added += signatures.length)
					res.write(signatures.map(serializeSignatureCsv).join(""))

				res.end()
			}
			break

		default: throw new HttpError(406)
	}
}))

exports.router.post("/", next(function*(req, res) {
	var initiative = req.initiative
	var method = res.locals.method = getSigningMethod(req)
	var cert, err, country, personalId, xades, signable, signatureUrl
	var geo = yield lookupAndSerializeGeo(req.ip)

	switch (method) {
		case "id-card":
			cert = Certificate.parse(req.body)
			if (err = validateCertificate(req.t, cert)) throw err

			;[country, personalId] = getCertificatePersonalId(cert)
			if (err = validatePersonalId(req.t, personalId)) throw err

			xades = newXades(cert, initiative)

			signable = yield signablesDb.create({
				initiative_uuid: initiative.uuid,
				country: country,
				personal_id: personalId,
				method: "id-card",
				xades: xades,
				created_from: geo
			})

			signatureUrl = req.baseUrl + "/" + pathToSignature(signable)
			res.setHeader("Location", signatureUrl)
			res.setHeader("Content-Type", "application/vnd.rahvaalgatus.signable")
			res.status(202).end(xades.signableHash)
			break

		case "mobile-id":
			var phoneNumber = ensureAreaCode(req.body.phoneNumber)
			personalId = parsePersonalId(req.t, req.body.personalId)
			if (err = validatePersonalId(req.t, personalId)) throw err

			// Log Mobile-Id requests to confirm SK's billing.
			logger.info(
				"Requesting Mobile-Id certificate for %s and %s.",
				phoneNumber,
				personalId
			)

			cert = yield mobileId.readCertificate(phoneNumber, personalId)
			if (err = validateCertificate(req.t, cert)) throw err

			;[country, personalId] = getCertificatePersonalId(cert)
			xades = newXades(cert, initiative)

			logger.info(
				"Signing via Mobile-Id for %s and %s.",
				phoneNumber,
				personalId
			)

			// The Mobile-Id API returns any signing errors only when its status is
			// queried, not when signing is initiated.
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
				xades: xades,
				created_from: geo
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
			personalId = parsePersonalId(req.t, req.body.personalId)
			if (err = validatePersonalId(req.t, personalId)) throw err

			// Log Smart-Id requests to confirm SK's billing.
			logger.info("Requesting Smart-Id certificate for %s.", personalId)

			cert = yield smartId.certificate("PNOEE-" + personalId)
			cert = yield waitForSmartIdSession(90, cert)
			if (cert == null) throw new SmartIdError("TIMEOUT")
			if (err = validateCertificate(req.t, cert)) throw err

			;[country, personalId] = getCertificatePersonalId(cert)
			xades = newXades(cert, initiative)

			logger.info("Signing via Smart-Id for %s.", personalId)

			// The Smart-Id API returns any signing errors only when its status is
			// queried, not when signing is initiated.
			var signSession = yield smartId.sign(cert, xades.signableHash)

			signable = yield signablesDb.create({
				initiative_uuid: initiative.uuid,
				country: country,
				personal_id: personalId,
				method: "smart-id",
				xades: xades,
				created_from: geo
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

	function newXades(cert, initiative) {
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
				let end = Date.now() + 120 * 1000;
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

			// Until we're using transactions for atomic signable and signature
			// creation, reload the signature. Be sure to match on "token" to not
			// select soon-to-be-deleted old signatures.
			if (!signature && signable.timestamped) for (
				let end = Date.now() + 5 * 1000;
				!signature && Date.now() < end;
				yield sleep(ENV == "test" ? 50 : 200)
			) if (signature = yield signaturesDb.read(sql`
				SELECT *
				FROM initiative_signatures
				WHERE initiative_uuid = ${initiative.uuid}
				AND country = ${req.country}
				AND personal_id = ${req.personalId}
				AND token = ${req.token}
			`)) break

			if (signature) {
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

function* waitForSession(wait, timeout, session) {
	var res
	for (
		var started = Date.now() / 1000, elapsed = 0;
		res == null && elapsed < timeout;
		elapsed = Date.now() / 1000 - started
	) res = yield wait(session, timeout - elapsed)
	return res
}

function* waitForMobileIdSignature(signable, sessionId) {
	try {
		var xades = signable.xades
		var signatureHash = yield waitForMobileIdSession(120, sessionId)
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
		var certAndSignatureHash = yield waitForSmartIdSession(120, session)
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

function pathToSignature(signatureOrSignable, extension) {
	var path = signatureOrSignable.country + signatureOrSignable.personal_id
	if (extension) path += "." + extension
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
		type == "application/x-www-form-urlencoded" ? req.body.method :
		type == "application/json" ? req.body.method :
		type == "application/pkix-cert" ? "id-card" :
		type == "application/vnd.rahvaalgatus.signature" ? "id-card" :
		null
	)
}

function parsePersonalId(t, id) {
	id = id.replace(/[^0-9]/g, "")

	if (id.length != 11) throw new HttpError(422, "Invalid Personal Id", {
		description: t("SIGN_ERROR_PERSONAL_ID_INVALID")
	})

	return id
}

function validatePersonalId(t, id) {
	var birthdate = _.getBirthdateFromPersonalId(id)

	if (birthdate > DateFns.addYears(new Date, -16))
		return new HttpError(422, "Too Young", {
			description: t("SIGN_ERROR_TOO_YOUNG")
		})

	return null
}

function* replaceSignature(signable) {
	var oldSignature = yield signaturesDb.read(sql`
		SELECT * FROM initiative_signatures
		WHERE initiative_uuid = ${signable.initiative_uuid}
		AND country = ${signable.country}
		AND personal_id = ${signable.personal_id}
	`)

	var oldCitizenosSignature = yield citizenosSignaturesDb.read(sql`
		SELECT * FROM initiative_citizenos_signatures
		WHERE initiative_uuid = ${signable.initiative_uuid}
		AND country = ${signable.country}
		AND personal_id = ${signable.personal_id}
	`)

	if (oldSignature) yield signaturesDb.delete(oldSignature)

	if (oldCitizenosSignature) yield citizenosSignaturesDb.execute(sql`
		DELETE FROM initiative_citizenos_signatures
		WHERE initiative_uuid = ${signable.initiative_uuid}
		AND country = ${signable.country}
		AND personal_id = ${signable.personal_id}
	`)

	yield signaturesDb.create({
		initiative_uuid: signable.initiative_uuid,
		country: signable.country,
		personal_id: signable.personal_id,
		method: signable.method,
		token: signable.token,
		xades: signable.xades,

		oversigned: (
			oldSignature && !oldSignature.hidden && oldSignature.oversigned + 1 ||
			oldCitizenosSignature && 1 ||
			0
		),

		created_at: new Date,
		created_from: signable.created_from,
		updated_at: new Date
	})
}

function lookupAndSerializeGeo(ip) {
	return geoipPromise.then(function(geoip) {
		var geo = geoip && geoip.get(ip)
		return geo && serializeGeo(geo)
	})
}

function serializeGeo(geo) {
	return {
		country_code: geo.country ? geo.country.iso_code : null,
		country_name: geo.country ? geo.country.names.en : null,

		subdivisions: geo.subdivisions ? geo.subdivisions.map((div) => ({
			code: div.iso_code,
			name: div.names.en
		})) : null,

		// Some city names are converted to ASCII (Jaervekuela instead of
		// Järveküla), whereas Jõgeva correctly contains "õ". Go figure. The only
		// available canonical identifier for a city is the GeoName id.
		city_name: geo.city ? geo.city.names.en : null,
		city_geoname_id: geo.city ? geo.city.geoname_id : null
	}
}

function serializeSignatureCsv(sig) {
	return [sig.personal_id, sig.created_at.toISOString()].join(",") + "\n"
}

function parseToken(token) {
	// Some email clients include trailing punctuation in links.
	try { return Buffer.from(token.replace(/[^A-Fa-f0-9]/g, ""), "hex") }
	catch (ex) { if (ex instanceof TypeError) return new Buffer(0); throw ex }
}

function parseSignatureId(id) { return [id.slice(0, 2), id.slice(2)] }
