var _ = require("root/lib/underscore")
var Qs = require("querystring")
var Url = require("url")
var Mime = require("mime")
var Asic = require("undersign/lib/asic")
var Path = require("path")
var Config = require("root/config")
var MobileId = require("undersign/lib/mobile_id")
var MediaType = require("medium-type")
var Router = require("express").Router
var HttpError = require("standard-http-error")
var MobileIdError = require("undersign/lib/mobile_id").MobileIdError
var Certificate = require("undersign/lib/certificate")
var ResponseTypeMiddeware =
	require("root/lib/middleware/response_type_middleware")
var next = require("co-next")
var co = require("co")
var catch400 = require("root/lib/fetch").catch.bind(null, 400)
var catch401 = require("root/lib/fetch").catch.bind(null, 401)
var sql = require("sqlate")
var dispose = require("content-disposition")
var isOk = require("root/lib/http").isOk
var reportError = require("root").errorReporter
var sleep = require("root/lib/promise").sleep
var mobileId = require("root").mobileId
var hades = require("root").hades
var parseBody = require("body-parser").raw
var signaturesDb = require("root/db/initiative_signatures_db")
var signablesDb = require("root/db/initiative_signables_db")
var cosApi = require("root/lib/citizenos_api")
var decodeBase64 = require("root/lib/crypto").decodeBase64
var {readCitizenSignature} = require("../initiatives_controller")
var translateCitizenError = require("root/lib/citizenos_api").translateError
var constantTimeEqual = require("root/lib/crypto").constantTimeEqual
var ENV = process.env.NODE_ENV
var tsl = require("root").tsl
var logger = require("root").logger
exports.pathToSignature = pathToSignature

var VALID_ISSUERS = Config.issuers.map((p) => p.join(","))
VALID_ISSUERS = VALID_ISSUERS.map(tsl.getBySubjectName.bind(tsl))

var MOBILE_ID_ERROR_STATUS_CODES = {
	NOT_FOUND: 422,
	NOT_ACTIVE: 422,
	TIMEOUT: 410,
	INVALID_SIGNATURE: 410,
	NOT_MID_CLIENT: 410,
	USER_CANCELLED: 410,
	SIGNATURE_HASH_MISMATCH: 410,
	PHONE_ABSENT: 410,
	DELIVERY_ERROR: 410,
	SIM_ERROR: 410,
}

var MOBILE_ID_ERROR_STATUS_MESSAGES = {
	NOT_FOUND: "Not a Mobile-Id User or Personal Id Mismatch",
	NOT_ACTIVE: "Mobile-Id Certificates Not Activated",
	TIMEOUT: "Mobile-Id Timeout",
	INVALID_SIGNATURE: "Invalid Mobile-Id Signature",
	NOT_MID_CLIENT: "Mobile-Id Certificates Not Activated",
	USER_CANCELLED: "Mobile-Id Cancelled",
	SIGNATURE_HASH_MISMATCH: "Mobile-Id Signature Hash Mismatch",
	PHONE_ABSENT: "Mobile-Id Phone Absent",
	DELIVERY_ERROR: "Mobile-Id Delivery Error",
	SIM_ERROR: "Mobile-Id SIM Application Error"
}

var MOBILE_ID_ERROR_TEXTS = {
	NOT_FOUND: "MOBILE_ID_ERROR_NOT_FOUND",
	NOT_ACTIVE: "MOBILE_ID_ERROR_NOT_ACTIVE",
	TIMEOUT: "MOBILE_ID_ERROR_TIMEOUT",
	INVALID_SIGNATURE: "MOBILE_ID_ERROR_INVALID_SIGNATURE",
	NOT_MID_CLIENT: "MOBILE_ID_ERROR_NOT_ACTIVE",
	USER_CANCELLED: "MOBILE_ID_ERROR_USER_CANCELLED",
	SIGNATURE_HASH_MISMATCH: "MOBILE_ID_ERROR_SIGNATURE_HASH_MISMATCH",
	PHONE_ABSENT: "MOBILE_ID_ERROR_PHONE_ABSENT",
	DELIVERY_ERROR: "MOBILE_ID_ERROR_DELIVERY_ERROR",
	SIM_ERROR: "MOBILE_ID_ERROR_SIM_ERROR"
}

exports.router = Router({mergeParams: true})
exports.router.use(parseBody({type: hasSignatureType}))

exports.router.get("/", next(function*(req, res) {
	var initiative = req.initiative
	var token = Buffer.from(req.query["parliament-token"] || "", "hex")

	if (initiative.received_by_parliament_at)
		throw new HttpError(423, "Signatures Already In Parliament")
	if (!initiative.parliament_token)
		throw new HttpError(403, "Signatures Not Available")
	if (!constantTimeEqual(initiative.parliament_token, token))
		throw new HttpError(403, "Invalid Token")

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

exports.router.post("/", next(function*(req, res, next) {
	var initiative = req.initiative
	if (!initiative.undersignable) return void next()

	var method = res.locals.method = getSigningMethod(req)
	var cert, err, country, pid, xades, signable, signatureUrl

	switch (method) {
		case "id-card":
			cert = Certificate.parse(req.body)
			if (err = validateCertificate(cert)) throw err

			;[country, pid] = getCertificatePersonalId(cert)
			xades = newXades(initiative)

			signable = yield signablesDb.create({
				initiative_uuid: initiative.uuid,
				country: country,
				personal_id: pid,
				xades: xades
			})

			signatureUrl = req.baseUrl + "/" + pathToSignature(signable)
			res.setHeader("Location", signatureUrl)
			res.setHeader("Content-Type", "application/vnd.rahvaalgatus.signable")
			res.status(202)
			res.end(xades.signableHash)
			break

		case "mobile-id":
			var phoneNumber = ensureAreaCode(req.body.phoneNumber)

			// Log Mobile-Id requests to confirm SK's billing.
			logger.info(
				"Requesting Mobile-Id certificate for %s and %s.",
				phoneNumber,
				req.body.pid
			)

			cert = yield mobileId.readCertificate(phoneNumber, req.body.pid)
			if (err = validateCertificate(cert)) throw err

			;[country, pid] = getCertificatePersonalId(cert)
			xades = newXades(initiative)

			// The Mobile-Id API returns any signing errors only when its status is
			// queried, not when signing is initiated.
			logger.info("Signing via Mobile-Id for %s and %s.", phoneNumber, pid)
			var sessionId = yield mobileId.sign(phoneNumber, pid, xades.signableHash)
			
			signable = yield signablesDb.create({
				initiative_uuid: initiative.uuid,
				country: country,
				personal_id: pid,
				xades: xades
			})

			signatureUrl = req.baseUrl + "/" + pathToSignature(signable)
			res.setHeader("Location", signatureUrl)

			res.status(202).render("initiatives/signatures/create_page.jsx", {
				code: MobileId.confirmation(xades.signableHash),
				poll: signatureUrl
			})

			co(waitForMobileIdSignature(signable, sessionId))
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

	function validateCertificate(cert) {
		// Undersign's Certificates.prototype.getIssuer confirms the cert was also
		// signed by the issuer.
		var issuer = tsl.getIssuer(cert)

		if (!VALID_ISSUERS.includes(issuer))
			return new HttpError(422, "Invalid Issuer", {
				description: req.t("INVALID_CERTIFICATE_ISSUER")
			})

		if (cert.validFrom > new Date)
			return new HttpError(422, "Certificate Not Yet Valid", {
				description: req.t("CERTIFICATE_NOT_YET_VALID")
			})

		if (cert.validUntil <= new Date)
			return new HttpError(422, "Certificate Expired", {
				description: req.t("CERTIFICATE_EXPIRED")
			})

		return null
	}
}))

// Undersignable initiatives PUT their signatures, but the old implementation
// for CitizenOS took the signature via POST.
exports.router.put("/", function(req, _res, next) {
	var initiative = req.initiative
	if (initiative.undersignable) return void next()
	req.method = "post"
	next()
})

exports.router.post("/",
	new ResponseTypeMiddeware([
		"text/html",
		"application/vnd.rahvaalgatus.signable",
		"application/x-empty"
	].map(MediaType.parse)),
	next(function*(req, res, next) {
	var initiative = req.initiative
	if (initiative.undersignable) return void next()

	var path
	var topic = req.topic
	var vote = topic.vote
	var method = res.locals.method = getSigningMethod(req)

	// NOTE: Do not send signing requests through the current user. CitizenOS API
	// limits signing with one personal id number to a single account,
	// a requirement we don't need to enforce.
	switch (method) {
		case "id-card":
			if (req.query.token) {
				path = `/api/topics/${topic.id}/votes/${vote.id}/sign`
				var signed = yield cosApi(path, {
					method: "POST",
					json: {
						token: req.query.token,
						signatureValue: req.body.toString("hex")
					}
				}).catch(catch400)

				if (isOk(signed)) {
					var userId = parseUserIdFromBdocUrl(signed.body.data.bdocUri)
					var sig = yield readCitizenSignature(topic, userId)
					res.flash("signatureId", sig.id)
					res.setHeader("Location", Path.dirname(req.baseUrl))

					switch (res.contentType.name) {
						case "application/x-empty": return void res.status(204).end()
						default: return void res.status(303).end()
					}
				}
				else throw new HttpError(422, {
					description: translateCitizenError(req.t, signed.body)
				})
			}
			else {
				path = `/api/topics/${topic.id}/votes/${vote.id}`
				var signable = yield cosApi(path, {
					method: "POST",

					json: {
						options: [{optionId: req.query.optionId}],
						certificate: req.body.toString("hex")
					}
				}).catch(catch400)

				if (isOk(signable)) {
					var hashName = signable.body.data.signedInfoHashType
					if (hashName != "SHA-256")
						throw new Error("Unsupported Signable Hash: " + hashName)

					res.setHeader("Location", req.baseUrl + "?" + Qs.stringify({
						optionId: req.query.optionId,
						token: signable.body.data.token
					}))

					res.setHeader("Content-Type", "application/vnd.rahvaalgatus.signable")
					res.status(202)
					res.end(Buffer.from(signable.body.data.signedInfoDigest, "hex"))
				}
				else res.status(422).json({
					description: translateCitizenError(req.t, signable.body)
				})
			}
			break

		case "mobile-id":
			path = `/api/topics/${topic.id}/votes/${vote.id}`
			var signing = yield cosApi(path, {
				method: "POST",
				json: {
					options: [{optionId: req.body.optionId}],
					pid: req.body.pid,
					phoneNumber: ensureAreaCode(req.body.phoneNumber),
				}
			}).catch(catch400)

			if (isOk(signing)) {
				var token = signing.body.data.token
				var signatureUrl = req.baseUrl + "/" + encodeURIComponent(token)
				res.setHeader("Location", signatureUrl)

				res.status(202).render("initiatives/signatures/create_page.jsx", {
					code: signing.body.data.challengeID,
					poll: signatureUrl
				})
			}
			else res.status(422).render("initiatives/signatures/create_page.jsx", {
				error: translateCitizenError(req.t, signing.body)
			})
			break

		default: throw new HttpError(422, "Unknown Signing Method")
	}
}))

exports.router.use("/", next(function(err, req, res, next) {
	if (err instanceof MobileIdError) {
		var code = getNormalizedMobileIdErrorCode(err)
		res.statusCode = MOBILE_ID_ERROR_STATUS_CODES[code] || 500
		res.statusMessage = MOBILE_ID_ERROR_STATUS_MESSAGES[code]

		if (res.statusCode >= 500) throw new HttpError(
			500,
			res.statusMessage || "Unknown Mobile-Id Error",
			{error: err}
		)

		res.render("initiatives/signatures/create_page.jsx", {
			error: req.t(MOBILE_ID_ERROR_TEXTS[code]) || err.message
		})
	}
	else next(err)
}))

exports.router.use("/:id", next(function*(req, _res, next) {
	var initiative = req.initiative
	if (!initiative.undersignable) return void next()

	var [country, personalId] = parseSignatureId(req.params.id)
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

exports.router.get("/:id",
	new ResponseTypeMiddeware([
		"text/html",
		"application/vnd.etsi.asic-e+zip",
		"application/x-empty"
	].map(MediaType)),
	next(function*(req, res, next) {
	var initiative = req.initiative
	if (!initiative.undersignable) return void next()

	var signature = req.signature
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

	switch (res.contentType.name) {
		case "application/vnd.etsi.asic-e+zip":
			if (signature == null) throw new HttpError(404)
			if (signature.xades == null) throw new HttpError(404)

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

		case "text/html":
		case "application/x-empty":
			res.setHeader("Location", Path.dirname(req.baseUrl))

			var tokenHex = req.token.toString("hex")

			if (signature || signable.signed) {
				res.statusCode = 204
				res.flash("signatureToken", tokenHex)
			}
			else if (signable.error) {
				var err = signable.error

				if (err.name == "MobileIdError") {
					res.statusCode = MOBILE_ID_ERROR_STATUS_CODES[err.code] || 500

					res.statusMessage = (
						MOBILE_ID_ERROR_STATUS_MESSAGES[err.code] ||
						"Unknown Mobile-Id Error"
					)

					res.flash("error", (
						req.t(MOBILE_ID_ERROR_TEXTS[err.code]) || req.t("500_BODY")
					))

					// No need to throw a 500 as this error's been already reported by
					// the async process that set signable.error
				}
				else {
					res.statusCode = 500
					res.flash("error", req.t("500_BODY"))
				}
			}
			else res.flash("error", req.t("MOBILE_ID_ERROR_TIMEOUT"))

			switch (res.contentType.name) {
				case "application/x-empty": return void res.end()
				default: return void res.status(303).end()
			}
			
		default: throw new HttpError(406)
	}
}))

exports.router.get("/:token",
	new ResponseTypeMiddeware([
		"text/html",
		"application/x-empty"
	].map(MediaType)),
	next(function*(req, res, next) {
	var initiative = req.initiative
	if (initiative.undersignable) return void next()

	var token = req.params.token
	if (token == null) throw new HttpError(400, "Missing Token")
	var topic = req.topic
	var signature = yield waitForCitizenMobileIdSignature(topic, token)

	switch (signature.statusCode) {
		case 200:
			var userId = parseUserIdFromBdocUrl(signature.body.data.bdocUri)
			var sig = yield readCitizenSignature(topic, userId)
			res.flash("signatureId", sig.id)
			break

		default:
			res.flash("error", translateCitizenError(req.t, signature.body))
			break
	}

	res.setHeader("Location", Path.dirname(req.baseUrl))

	switch (res.contentType.name) {
		case "application/x-empty": res.status(204).end(); break
		default: res.status(303).end()
	}
}))

exports.router.put("/:id",
	new ResponseTypeMiddeware([
		"text/html",
		"application/x-empty"
	].map(MediaType)),
	next(function*(req, res) {
	var initiative = req.initiative
	if (!initiative.undersignable) throw new HttpError(405)

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

exports.router.delete("/:id", next(function*(req, res) {
	var initiative = req.initiative
	if (!initiative.undersignable) throw new HttpError(405)

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
			MOBILE_ID_ERROR_STATUS_CODES[getNormalizedMobileIdErrorCode(ex)] < 500
		)) reportError(ex)

		yield signablesDb.update(signable, {error: ex})
	}
}

function* waitForCitizenMobileIdSignature(topic, token) {
	var vote = topic.vote
	var path = `/api/topics/${topic.id}/votes/${vote.id}/status`
	path += "?token=" + encodeURIComponent(token)

	RETRY: for (var i = 0; i < 60; ++i) {
		// The signature endpoint is valid only for a limited amount of time.
		// If that time passes, 401 is thrown.
		var res = yield cosApi(path).catch(catch400).catch(catch401)

		switch (res.statusCode) {
			case 200:
				if (res.body.status.code === 20001) {
					yield sleep(2500);
					continue RETRY;
				}
				// Fall through.

			default: return res
		}
	}

	throw new HttpError(500, "Mobile-Id Took Too Long")
}

function ensureAreaCode(number) {
	number = number.replace(/[-()[\] ]/g, "")

	// As of Dec, 2019, numbers without a leading "+", even if otherwise prefixed
	// with a suitable area code (~372), don't work. They used to with the
	// Digidoc Service API.
	if (/^\+/.test(number)) return number
	if (/^3[567][0-9]/.test(number)) return "+" + number
	return "+372" + number
}

function parseUserIdFromBdocUrl(url) {
	url = Url.parse(url, true)
	return parseJwt(url.query.token).userId
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
		token: signable.token,
		xades: signable.xades,
		oversigned: signature && !signature.hidden && signature.oversigned + 1 || 0,
		created_at: new Date,
		updated_at: new Date
	})
}

function getNormalizedMobileIdErrorCode(err) {
	return (
		isMobileIdPersonalIdError(err) ? "NOT_FOUND" :
		isMobileIdPhoneNumberError(err) ? "NOT_FOUND"
		: err.code
	)

	function isMobileIdPersonalIdError(err) {
		return (
			err.code == "BAD_REQUEST" &&
			err.message.match(/\bnationalIdentityNumber\b/)
		)
	}

	function isMobileIdPhoneNumberError(err) {
		return (
			err.code == "BAD_REQUEST" &&
			err.message.match(/\bphoneNumber\b/)
		)
	}
}

function getCertificatePersonalId(cert) {
	var obj = _.assign({}, ...cert.subject), pno

	if (pno = /^PNO([A-Z][A-Z])-(\d+)$/.exec(obj.serialNumber))
		return [pno[1], pno[2]]
	else
		return [obj.countryName, obj.serialNumber]
}

// NOTE: Use this only on JWTs from trusted sources as it does no validation.
function parseJwt(jwt) { return JSON.parse(decodeBase64(jwt.split(".")[1])) }
function parseSignatureId(id) { return [id.slice(0, 2), id.slice(2)] }
