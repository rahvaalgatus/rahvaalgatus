var _ = require("root/lib/underscore")
var Mime = require("mime")
var Zip = require("root/lib/zip")
var Asic = require("undersign/lib/asic")
var Path = require("path")
var DateFns = require("date-fns")
var MobileId = require("undersign/lib/mobile_id")
var SmartId = require("undersign/lib/smart_id")
var MediaType = require("medium-type")
var {Router} = require("express")
var Initiative = require("root/lib/initiative")
var HttpError = require("standard-http-error")
var {MobileIdError} = require("undersign/lib/mobile_id")
var {SmartIdError} = require("undersign/lib/smart_id")
var Certificate = require("undersign/lib/certificate")
var ResponseTypeMiddeware =
	require("root/lib/middleware/response_type_middleware")
var next = require("co-next")
var co = require("co")
var sql = require("sqlate")
var dispose = require("content-disposition")
var reportError = require("root").errorReporter
var {mobileId} = require("root")
var {smartId} = require("root")
var geoipPromise = require("root").geoip
var {hades} = require("root")
var parseBody = require("body-parser").raw
var signaturesDb = require("root/db/initiative_signatures_db")
var signablesDb = require("root/db/initiative_signables_db")
var textsDb = require("root/db/initiative_texts_db")
var citizenosSignaturesDb =
	require("root/db/initiative_citizenos_signatures_db")
var {parsePersonalId} = require("root/lib/eid")
var {parsePhoneNumber} = require("root/lib/eid")
var {constantTimeEqual} = require("root/lib/crypto")
var {getCertificatePersonalId} = require("root/lib/certificate")
var {ENV} = process.env
var {validateSigningCertificate} = require("root/lib/certificate")
var {getNormalizedMobileIdErrorCode} = require("root/lib/eid")
var LOCAL_GOVERNMENTS = require("root/lib/local_governments")
var SIGN_RATE = 5
var SIGN_RATE_IN_MINUTES = 30
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
	var {t} = req
	var {user} = req
	var {initiative} = req
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

	if (initiative.received_by_government_at)
		throw new HttpError(423, "Signatures Already In Government", {
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
				var estonian = textsDb.read(sql`
					SELECT *
					FROM initiative_texts
					WHERE initiative_uuid = ${initiative.uuid} AND language = 'et'
					ORDER BY id DESC
					LIMIT 1
				`)

				if (estonian == null) break ESTONIAN
				var translationHtml = Initiative.renderForParliament(estonian)
				asic.add("estonian.html", translationHtml, "text/html")
			}

			{
				let signatures, added = 0

				while ((signatures = signaturesDb.search(sql`
					SELECT xades FROM initiative_signatures
					WHERE initiative_uuid = ${initiative.uuid}
					AND NOT anonymized
					ORDER BY country ASC, personal_id ASC
					LIMIT ${ENV == "test" ? 1 : 100}
					OFFSET ${added}
				`)).length > 0) {
					_.map(signatures, "xades").forEach(asic.addSignature, asic)
					added += signatures.length
					yield waitUntilZipFilesWritten(asic.zip)
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

			var citizenosSignatures = citizenosSignaturesDb.search(sql`
				SELECT * FROM initiative_citizenos_signatures
				WHERE initiative_uuid = ${initiative.uuid}
				AND NOT anonymized
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

				for (added = 0; (signatures = citizenosSignaturesDb.search(sql`
					SELECT created_at, personal_id FROM initiative_citizenos_signatures
					WHERE initiative_uuid = ${initiative.uuid}
					AND NOT anonymized
					ORDER BY country ASC, personal_id ASC
					LIMIT ${ENV == "test" ? 1 : 10000}
					OFFSET ${added}
				`)).length > 0; added += signatures.length)
					res.write(signatures.map(serializeSignatureCsv).join(""))

				for (added = 0; (signatures = signaturesDb.search(sql`
					SELECT created_at, personal_id FROM initiative_signatures
					WHERE initiative_uuid = ${initiative.uuid}
					AND NOT anonymized
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
	var {initiative} = req
	var method = res.locals.method = getSigningMethod(req)
	var cert, err, country, personalId, xades, signable, signatureUrl
	var geo = yield lookupAndSerializeGeo(req.ip)

	// Prevents new signatures after the signing deadline, but lets already
	// started signatures finish.
	//
	// Mobile methods wait for the signature in the background, but the ID-card
	// process sends a PUT later. This needs to be let through.
	if (initiative.phase == "edit")
		throw new HttpError(405, "Signing Not Yet Started", {
			description: req.t("CANNOT_SIGN_SIGNING_NOT_YET_STARTED")
		})

	if (!Initiative.isSignable(new Date, initiative))
		throw new HttpError(405, "Signing Ended", {
			description: req.t("CANNOT_SIGN_SIGNING_ENDED")
		})

	switch (method) {
		case "id-card":
			cert = Certificate.parse(req.body)
			if (err = validateSigningCertificate(req.t, cert)) throw err

			;[country, personalId] = getCertificatePersonalId(cert)
			if (err = validateAge(req.t, personalId)) throw err

			xades = newXades(cert, initiative)

			signable = signablesDb.create({
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

			res.statusCode = 202
			res.statusMessage = "Signing"
			res.end(xades.signableHash)
			break

		case "mobile-id":
			var phoneNumber = parsePhoneNumber(String(req.body.phoneNumber))
			personalId = parsePersonalId(req.body.personalId)

			if (personalId == null) throw new HttpError(422, "Invalid Personal Id", {
				description: req.t("SIGN_ERROR_PERSONAL_ID_INVALID")
			})

			if (err = validateAge(req.t, personalId)) throw err
			if (rateLimitSigning(req, res, personalId)) return

			cert = yield mobileId.readCertificate(phoneNumber, personalId)
			if (err = validateSigningCertificate(req.t, cert)) throw err

			;[country, personalId] = getCertificatePersonalId(cert)
			xades = newXades(cert, initiative)

			// The Mobile-Id API returns any signing errors only when its status is
			// queried, not when signing is initiated.
			var sessionId = yield mobileId.sign(
				phoneNumber,
				personalId,
				xades.signableHash
			)

			signable = signablesDb.create({
				initiative_uuid: initiative.uuid,
				country: country,
				personal_id: personalId,
				method: "mobile-id",
				xades: xades,
				created_from: geo
			})

			signatureUrl = req.baseUrl + "/" + pathToSignature(signable)
			res.setHeader("Location", signatureUrl)

			res.statusCode = 202
			res.statusMessage = "Signing"
			res.render("initiatives/signatures/creating_page.jsx", {
				code: MobileId.confirmation(xades.signableHash),
				poll: signatureUrl
			})

			co(waitForMobileIdSignature(signable, sessionId))
			break

		case "smart-id":
			personalId = parsePersonalId(req.body.personalId)

			if (personalId == null) throw new HttpError(422, "Invalid Personal Id", {
				description: req.t("SIGN_ERROR_PERSONAL_ID_INVALID")
			})

			if (err = validateAge(req.t, personalId)) throw err
			if (rateLimitSigning(req, res, personalId)) return

			cert = yield smartId.certificate("PNOEE-" + personalId)
			cert = yield waitForSmartIdSession(90, cert)
			if (cert == null) throw new SmartIdError("TIMEOUT")
			if (err = validateSigningCertificate(req.t, cert)) throw err

			;[country, personalId] = getCertificatePersonalId(cert)
			xades = newXades(cert, initiative)

			// The Smart-Id API returns any signing errors only when its status is
			// queried, not when signing is initiated.
			var signSession = yield smartId.sign(cert, xades.signableHash)

			signable = signablesDb.create({
				initiative_uuid: initiative.uuid,
				country: country,
				personal_id: personalId,
				method: "smart-id",
				xades: xades,
				created_from: geo
			})

			signatureUrl = req.baseUrl + "/" + pathToSignature(signable)
			res.setHeader("Location", signatureUrl)

			res.statusCode = 202
			res.statusMessage = "Signing"
			res.render("initiatives/signatures/creating_page.jsx", {
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

exports.router.use("/:personalId", function(req, _res, next) {
	var {initiative} = req
	var [country, personalId] = parseSignatureId(req.params.personalId)
	var token = req.token = Buffer.from(req.query.token || "", "hex")
	req.country = country
	req.personalId = personalId

	// NOTE: Don't read the signature unconditionally to at least reduce timing
	// leaks. Especially don't differentiate between non-existent signatures
	// and invalid tokens in the error response.
	req.signature = signaturesDb.read(sql`
		SELECT * FROM initiative_signatures
		WHERE initiative_uuid = ${initiative.uuid}
		AND country = ${country}
		AND personal_id = ${personalId}
		AND token = ${token}
	`)

	next()
})

exports.router.get("/:personalId",
	new ResponseTypeMiddeware([
		"text/html",
		"application/vnd.etsi.asic-e+zip",
		"application/x-empty"
	].map(MediaType)),
	next(function*(req, res) {
	var {initiative} = req
	var {signature} = req

	switch (res.contentType.name) {
		case "text/html":
		case "application/x-empty":
			var signable

			if (!signature) for (
				let end = Date.now() + 120 * 1000;
				Date.now() < end;
				yield _.sleep(ENV == "test" ? 50 : 500)
			) {
				signable = signablesDb.read(sql`
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
				yield _.sleep(ENV == "test" ? 50 : 200)
			) if (signature = signaturesDb.read(sql`
				SELECT *
				FROM initiative_signatures
				WHERE initiative_uuid = ${initiative.uuid}
				AND country = ${req.country}
				AND personal_id = ${req.personalId}
				AND token = ${req.token}
			`)) break

			if (signature) {
				res.statusCode = 204
				res.statusMessage = "Signed"
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
			if (signature == null) throw new HttpError(404, "Signature Not Found")

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
	var {initiative} = req
	var {signature} = req

	// NOTE: Intentionally let already started signatures finish even after the
	// initiative signing deadline is passed.
	if (initiative.phase != "sign") throw new HttpError(405, "Signing Ended", {
		description: req.t("CANNOT_SIGN_SIGNING_ENDED")
	})

	// Responding to a hidden signature if you know its token is not a privacy
	// leak given that if you have the token, you already know for a fact it
	// was once signed.
	switch (req.contentType && req.contentType.name) {
		case "application/vnd.rahvaalgatus.signature":
			if (signature) throw new HttpError(409, "Already Signed")

			var signable = signablesDb.read(sql`
				SELECT *
				FROM initiative_signables
				WHERE initiative_uuid = ${initiative.uuid}
				AND country = ${req.country}
				AND personal_id = ${req.personalId}
				AND token = ${req.token}
			`)

			if (signable == null) throw new HttpError(404, "Signature Not Found")

			var {xades} = signable

			if (!xades.certificate.hasSigned(xades.signable, req.body))
				throw new HttpError(409, "Invalid Signature")

			xades.setSignature(req.body)

			signablesDb.update(signable, {
				xades: xades,
				signed: true,
				updated_at: new Date
			})

			xades.setOcspResponse(yield hades.timemark(xades))

			signablesDb.update(signable, {
				xades: xades,
				timestamped: true,
				updated_at: new Date
			})

			replaceSignature(signable)
			res.flash("signatureToken", req.token.toString("hex"))
			res.setHeader("Location", Path.dirname(req.baseUrl))

			switch (res.contentType.name) {
				case "application/x-empty":
					res.statusCode = 204
					res.statusMessage = "Signed"
					return void res.end()

				default: return void res.status(303).end()
			}

		default: throw new HttpError(415)
	}
}))

exports.router.delete("/:personalId", function(req, res) {
	var {signature} = req
	if (signature == null) throw new HttpError(404, "Signature Not Found")

	if (!Initiative.isSignable(new Date, req.initiative))
		throw new HttpError(405, "Cannot Delete Signature as Signing Ended", {
			description: req.t("SIGNATURE_NOT_REVOKED_NOT_SIGNABLE")
		})

	signaturesDb.delete(signature)

	res.flash("notice", req.t("SIGNATURE_REVOKED"))
	res.statusMessage = "Signature Deleted"
	res.redirect(303, Path.dirname(req.baseUrl))
})

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
		var {xades} = signable
		var signatureHash = yield waitForMobileIdSession(120, sessionId)
		if (signatureHash == null) throw new MobileIdError("TIMEOUT")

		if (!xades.certificate.hasSigned(xades.signable, signatureHash))
			throw new MobileIdError("INVALID_SIGNATURE")

		xades.setSignature(signatureHash)

		signablesDb.update(signable, {
			xades: xades,
			signed: true,
			updated_at: new Date
		})

		xades.setOcspResponse(yield hades.timemark(xades))

		signablesDb.update(signable, {
			xades: xades,
			timestamped: true,
			updated_at: new Date
		})

		replaceSignature(signable)
	}
	catch (ex) {
		if (!(
			ex instanceof MobileIdError &&
			getNormalizedMobileIdErrorCode(ex) in MOBILE_ID_ERRORS
		)) reportError(ex)

		signablesDb.update(signable, {error: ex, updated_at: new Date})
	}
}

function* waitForSmartIdSignature(signable, session) {
	try {
		var {xades} = signable
		var certAndSignatureHash = yield waitForSmartIdSession(120, session)
		if (certAndSignatureHash == null) throw new SmartIdError("TIMEOUT")

		var [_cert, signatureHash] = certAndSignatureHash
		if (!xades.certificate.hasSigned(xades.signable, signatureHash))
			throw new SmartIdError("INVALID_SIGNATURE")

		xades.setSignature(signatureHash)

		signablesDb.update(signable, {
			xades: xades,
			signed: true,
			updated_at: new Date
		})

		xades.setOcspResponse(yield hades.timemark(xades))

		signablesDb.update(signable, {
			xades: xades,
			timestamped: true,
			updated_at: new Date
		})

		replaceSignature(signable)
	}
	catch (ex) {
		if (!(ex instanceof SmartIdError && ex.code in SMART_ID_ERRORS))
			reportError(ex)

		signablesDb.update(signable, {error: ex, updated_at: new Date})
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

function validateAge(t, id) {
	var birthdate = _.getBirthdateFromPersonalId(id)

	if (birthdate > DateFns.addYears(new Date, -16))
		return new HttpError(422, "Too Young", {
			description: t("SIGN_ERROR_TOO_YOUNG")
		})

	return null
}

function rateLimitSigning(req, res, personalId) {
	var signables = signablesDb.search(sql`
		SELECT created_at FROM initiative_signables
		WHERE personal_id = ${personalId}
		AND created_at > ${DateFns.addMinutes(new Date, -SIGN_RATE_IN_MINUTES)}
		AND NOT signed
		AND method != 'id-card'
		ORDER BY created_at ASC
		LIMIT ${SIGN_RATE}
	`)

	var until = signables.length < SIGN_RATE
		? null
		: DateFns.addMinutes(signables[0].created_at, SIGN_RATE_IN_MINUTES)

	if (until) {
		res.statusCode = 429
		res.statusMessage = "Too Many Incomplete Signatures"

		var minutes = Math.max(DateFns.differenceInMinutes(until, new Date), 1)

		res.render("error_page.jsx", {
			title: req.t("INITIATIVE_SIGN_RATE_LIMIT_TITLE", {minutes: minutes}),
			body: req.t("INITIATIVE_SIGN_RATE_LIMIT_BODY", {minutes: minutes})
		})

		return true
	}

	return false
}

function replaceSignature(signable) {
	var oldSignature = signaturesDb.read(sql`
		SELECT * FROM initiative_signatures
		WHERE initiative_uuid = ${signable.initiative_uuid}
		AND country = ${signable.country}
		AND personal_id = ${signable.personal_id}
	`)

	var oldCitizenosSignature = citizenosSignaturesDb.read(sql`
		SELECT * FROM initiative_citizenos_signatures
		WHERE initiative_uuid = ${signable.initiative_uuid}
		AND country = ${signable.country}
		AND personal_id = ${signable.personal_id}
	`)

	if (oldSignature) signaturesDb.delete(oldSignature)

	if (oldCitizenosSignature) citizenosSignaturesDb.execute(sql`
		DELETE FROM initiative_citizenos_signatures
		WHERE initiative_uuid = ${signable.initiative_uuid}
		AND country = ${signable.country}
		AND personal_id = ${signable.personal_id}
	`)

	signaturesDb.create({
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

function* waitUntilZipFilesWritten(zip) {
	// NOTE: There isn't a good way to wait for the Yazl's output stream drain
	// event as buffers go through an internal Zlib's compression stream and we
	// can't monitor that.
	//
	// Iterating over the entries seems to currently be the only way to identify
	// that everything's flushed as there's no guarantee the entries get written
	// in order. And yes, this is O(N^2)-ish.
	//
	// Waiting any fixed number of milliseconds does slow down the transfer rate,
	// but testing with 100ms locally seems to reduce signature download speed to
	// 3–4MBps and that's fine. 10k signatures is roughly a 50MB zip file.
	var FILE_DATA_DONE = 3

	while (!zip.entries.every((e) => e.state == FILE_DATA_DONE))
		yield _.sleep(100)
}

function serializeSignatureCsv(sig) {
	return [sig.personal_id, sig.created_at.toISOString()].join(",") + "\n"
}

function parseToken(token) {
	// Some email clients include trailing punctuation in links.
	try { return Buffer.from(token.replace(/[^A-Fa-f0-9]/g, ""), "hex") }
	catch (ex) { if (ex instanceof TypeError) return Buffer.alloc(0); throw ex }
}

function parseSignatureId(id) { return [id.slice(0, 2), id.slice(2)] }
