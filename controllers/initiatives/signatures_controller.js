var _ = require("root/lib/underscore")
var Mime = require("mime")
var Csv = require("root/lib/csv")
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
var {serializeRefreshHeader} = require("root/lib/http")
var {parsePersonalId} = require("root/lib/eid")
var {parsePhoneNumber} = require("root/lib/eid")
var {getCertificatePersonalId} = require("root/lib/certificate")
var {validateSigningCertificate} = require("root/lib/certificate")
var {getNormalizedMobileIdErrorCode} = require("root/lib/eid")
var signaturesDb = require("root/db/initiative_signatures_db")
var signatureTrusteesDb = require("root/db/initiative_signature_trustees_db")
var signablesDb = require("root/db/initiative_signables_db")
var citizenosSignaturesDb =
	require("root/db/initiative_citizenos_signatures_db")
var {ENV} = process.env
var {mobileId} = require("root")
var {smartId} = require("root")
var geoipPromise = require("root").geoip
var {logger} = require("root")
var {hades} = require("root")
var parseBody = require("body-parser").raw
var SIGNABLE_TYPE = "application/vnd.rahvaalgatus.signable"
var SIGN_RATE = 5
var SIGN_RATE_IN_MINUTES = 30
exports.pathToSignature = pathToSignature
exports.parseSignatureAttrs = parseSignatureAttrs
exports.hasSignatureType = hasSignatureType
exports.reinstantiateError = reinstantiateError
exports.handleEidError = handleEidError
exports.serializeVerificationCode = serializeVerificationCode
exports.SIGNABLE_TYPE = SIGNABLE_TYPE

var waitForMobileIdSession = exports.waitForMobileIdSession =
	waitForSession.bind(null, mobileId.wait.bind(mobileId))
var waitForSmartIdSession = exports.waitForSmartIdSession =
	waitForSession.bind(null, smartId.wait.bind(smartId))

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

	if (!_.constantTimeEqual(initiative.parliament_token, token))
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

		var trustee = signatureTrusteesDb.read(sql`
			SELECT * FROM initiative_signature_trustees
			WHERE initiative_destination = ${initiative.destination}
			AND country = ${user.country}
			AND personal_id = ${user.personal_id}
			AND deleted_at IS NULL
		`)

		// Being extra careful with a redundant personal id equivalency test.
		if (!(
			trustee &&
			trustee.country == user.country &&
			trustee.personal_id == user.personal_id
		)) throw new HttpError(403, "Not a Permitted Downloader", {
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

			// NOTE: Unfortunately can't add translations to the container. Even
			// though the ASiC-E container supports signed and unsigned files
			// together, client software like Digidoc doesn't.
			asic.add(
				`initiative.${Mime.extension(String(initiative.text_type))}`,
				initiative.text,
				initiative.text_type
			)

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

exports.router.post("/",
	new ResponseTypeMiddeware([
		"text/html",
		"application/json",
		"application/x-empty",
		SIGNABLE_TYPE
	].map(MediaType)),
	next(function*(req, res) {
	var {t} = req
	var {initiative} = req

	let {
		method,
		personalId: untrustedPersonalId,
		phoneNumber
	} = parseSignatureAttrs(req, req.body)

	var err, signable
	var geo = yield lookupAndSerializeGeo(req.ip)

	// Prevents new signatures after the signing deadline, but lets already
	// started signatures finish.
	//
	// Mobile methods wait for the signature in the background, but the ID-card
	// process sends a PUT later. This needs to be let through.
	if (initiative.phase == "edit")
		throw new HttpError(405, "Signing Not Yet Started", {
			description:
				t("creating_initiative_signature_page.errors.not_yet_started")
		})

	if (!Initiative.isSignable(new Date, initiative))
		throw new HttpError(405, "Signing Ended", {
			description: t("creating_initiative_signature_page.errors.signing_ended")
		})

	switch (method) {
		case "id-card": {
			if (res.contentType.name != SIGNABLE_TYPE) throw new HttpError(406)

			let cert = Certificate.parse(req.body)
			if (err = validateSigningCertificate(t, cert)) throw err

			let [country, personalId] = getCertificatePersonalId(cert)
			if (err = validateAge(t, personalId)) throw err

			let xades = newXades(cert, initiative)

			signable = signablesDb.create({
				initiative_uuid: initiative.uuid,
				country: country,
				personal_id: personalId,
				method: "id-card",
				xades: xades,
				created_from: geo
			})

			signable.id = readSignableId(signable)

			logger.info({
				request_id: req.headers["request-id"],
				event: "initiative-signature-start",
				initiative_id: initiative.id,
				initiative_uuid: initiative.uuid,
				signable_id: signable.id,
				signature_method: method
			})

			let signatureUrl = req.baseUrl + "/" + pathToSignature(signable)
			res.setHeader("Location", signatureUrl)
			res.setHeader("Content-Type", SIGNABLE_TYPE)

			res.statusCode = 202
			res.statusMessage = "Signing with ID-card"
			return void res.end(xades.signableHash)
		}

		case "mobile-id": {
			if (untrustedPersonalId == null)
				throw new HttpError(422, "Invalid Personal Id", {
					description: t("eid_view.errors.invalid_personal_id")
				})

			if (err = validateAge(t, untrustedPersonalId)) throw err
			if (err = rateLimitSigning(t, untrustedPersonalId)) throw err

			logger.info({
				request_id: req.headers["request-id"],
				event: "initiative-signature-start",
				initiative_uuid: initiative.uuid,
				signature_method: method
			})

			let cert = yield mobileId.certificate(phoneNumber, untrustedPersonalId)

			logger.info({
				request_id: req.headers["request-id"],
				event: "initiative-signature-validating-certificate",
				initiative_uuid: initiative.uuid,
				signature_method: method
			})

			if (err = validateSigningCertificate(t, cert)) throw err

			let [country, personalId] = getCertificatePersonalId(cert)
			let xades = newXades(cert, initiative)

			logger.info({
				request_id: req.headers["request-id"],
				event: "initiative-signature-signing",
				initiative_uuid: initiative.uuid,
				signature_method: method
			})

			// The Mobile-ID API returns any signing errors only when its status is
			// queried, not when signing is initiated.
			let session = yield mobileId.sign(
				phoneNumber,
				personalId,
				xades.signableHash
			)

			signable = signablesDb.create({
				initiative_uuid: initiative.uuid,
				country: country,
				personal_id: personalId,
				method: "mobile-id",
				xades,
				created_from: geo,
				eid_session: session
			})

			signable.id = readSignableId(signable)
			res.statusMessage = "Signing with Mobile-ID"
			co(waitForMobileIdSignature(req, signable, session))
			break
		}

		case "smart-id": {
			if (untrustedPersonalId == null)
				throw new HttpError(422, "Invalid Personal Id", {
					description: t("eid_view.errors.invalid_personal_id")
				})

			if (err = validateAge(t, untrustedPersonalId)) throw err
			if (err = rateLimitSigning(t, untrustedPersonalId)) throw err

			logger.info({
				request_id: req.headers["request-id"],
				event: "initiative-signature-start",
				initiative_uuid: initiative.uuid,
				signature_method: method
			})

			let cert = yield smartId.certificate("PNOEE-" + untrustedPersonalId)
			cert = yield waitForSmartIdSession(90, cert)
			if (cert == null) throw new SmartIdError("TIMEOUT")

			logger.info({
				request_id: req.headers["request-id"],
				event: "initiative-signature-validating-certificate",
				initiative_uuid: initiative.uuid,
				signature_method: method
			})

			if (err = validateSigningCertificate(t, cert)) throw err

			let [country, personalId] = getCertificatePersonalId(cert)
			let xades = newXades(cert, initiative)

			logger.info({
				request_id: req.headers["request-id"],
				event: "initiative-signature-signing",
				initiative_uuid: initiative.uuid,
				signature_method: method
			})

			// The Smart-ID API returns any signing errors only when its status is
			// queried, not when signing is initiated.
			let session = yield smartId.sign(cert, xades.signableHash)

			signable = signablesDb.create({
				initiative_uuid: initiative.uuid,
				country: country,
				personal_id: personalId,
				method: "smart-id",
				xades,
				created_from: geo,
				eid_session: session
			})

			signable.id = readSignableId(signable)
			res.statusMessage = "Signing with Smart-ID"
			co(waitForSmartIdSignature(req, signable, session))
			break
		}

		default: throw new HttpError(422, "Unknown Signing Method")
	}

	res.statusCode = 202

	var waitUrl = serializeWaitPath(req, res, signable)
	res.setHeader("Refresh", serializeRefreshHeader(3, waitUrl))
	var verificationCode = serializeVerificationCode(signable)
	res.setHeader("X-Verification-Code", verificationCode)

	switch (res.contentType.name) {
		case "application/json":
		case "application/x-empty": return void res.end()

		default: res.render("initiatives/signatures/creating_page.jsx", {
			method,
			verificationCode
		})
	}

	function newXades(cert, initiative) {
		return hades.new(cert, [{
			path: `initiative.${Mime.extension(String(initiative.text_type))}`,
			type: initiative.text_type,
			hash: initiative.text_sha256
		}])
	}
}), handleEidError)

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
		SELECT rowid AS id, * FROM initiative_signatures
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
		"application/json"
	].map(MediaType)),
	next(function*(req, res) {
	var {initiative} = req
	var {signature} = req

	switch (res.contentType.name) {
		case "text/html":
		case "application/json":
			var signable
			var isAjax = res.contentType.name == "application/json"
			var MAX_WAIT_MS = 120 * 1000

			if (signature == null) {
				while (true) {
					signable = signablesDb.read(sql`
						SELECT method, error, created_at, timestamped
						FROM initiative_signables
						WHERE token = ${req.token}
					`)

					if (signable == null) throw new HttpError(404, "Signature Not Found")
					if (signable.error) throw reinstantiateError(signable.error)

					// Wait until not only signing, but timestamping finishes, to have the
					// signature count on the initiative page increment after the
					// redirect.
					if (signable.timestamped) break

					var timedout = signable.created_at <= Date.now() - MAX_WAIT_MS

					switch (signable.method) {
						case "mobile-id":
							if (timedout) throw new MobileIdError("TIMEOUT"); break

						case "smart-id":
							if (timedout) throw new SmartIdError("TIMEOUT"); break

						default: throw new HttpError(409, "Cannot Wait for ID-card")
					}

					if (isAjax) yield _.sleep(ENV == "test" ? 50 : 500); else break
				}

				// NOTE: Read based on "token" to not select signatures that happened to
				// have been overwritten since we read the signable above.
				if (signable.timestamped) signature = signaturesDb.read(sql`
					SELECT * FROM initiative_signatures WHERE token = ${req.token}
				`)

				if (signature == null) signable = signablesDb.read(sql`
					SELECT * FROM initiative_signables WHERE token = ${req.token}
				`)
			}

			if (signature) {
				res.statusMessage =
					signature.method == "mobile-id" ? "Signed with Mobile-ID" :
					signature.method == "smart-id" ? "Signed with Smart-ID" :
					"Signed"

				switch (res.contentType.name) {
					case "application/json":
						var waitUrl = serializeWaitPath(req, res, signature)
						res.setHeader("Location", waitUrl)
						return void res.json({state: "DONE"})

					default:
						res.flash("signatureToken", req.token.toString("hex"))
						res.redirect(303, Initiative.slugPath(initiative))
				}
			}
			else {
				res.statusCode = 202

				res.statusMessage =
					signable.method == "mobile-id" ? "Waiting for Mobile-ID" :
					signable.method == "smart-id" ? "Waiting for Smart-ID" :
					"Waiting"

				let waitUrl = serializeWaitPath(req, res, signable)
				res.setHeader("Refresh", serializeRefreshHeader(2, waitUrl))
				var verificationCode = serializeVerificationCode(signable)
				res.setHeader("X-Verification-Code", verificationCode)

				switch (res.contentType.name) {
					case "application/json": return void res.json({state: "PENDING"})

					default: res.render("initiatives/signatures/creating_page.jsx", {
						method: signable.method,
						verificationCode
					})
				}
			}
			break

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
}), handleEidError)

exports.router.put("/:personalId",
	new ResponseTypeMiddeware([
		"text/html",
		"application/x-empty"
	].map(MediaType)),
	next(function*(req, res) {
	var {t} = req
	var {initiative} = req
	var {signature} = req

	// NOTE: Intentionally let already started signatures finish even after the
	// initiative signing deadline is passed.
	if (initiative.phase != "sign") throw new HttpError(405, "Signing Ended", {
		description: t("creating_initiative_signature_page.errors.signing_ended")
	})

	// Responding to a hidden signature if you know its token is not a privacy
	// leak given that if you have the token, you already know for a fact it
	// was once signed.
	switch (req.contentType && req.contentType.name) {
		case "application/vnd.rahvaalgatus.signature":
			if (signature) throw new HttpError(409, "Already Signed")

			var signable = signablesDb.read(sql`
				SELECT rowid AS id, *
				FROM initiative_signables
				WHERE token = ${req.token}
			`)

			if (signable == null) throw new HttpError(404, "Signature Not Found")

			logger.info({
				request_id: req.headers["request-id"],
				event: "initiative-signature-signed",
				initiative_uuid: signable.initiative_uuid,
				signable_id: signable.id,
				signature_method: signable.method
			})

			var {xades} = signable

			if (!xades.certificate.hasSigned(xades.signable, req.body))
				throw new HttpError(409, "Invalid Signature", {
					description: t("eid_view.id_card_errors.sign_invalid_signature")
				})

			yield finalizeSignable(req, signable, req.body)

			res.statusMessage = "Signed with ID-card"
			res.flash("signatureToken", req.token.toString("hex"))
			res.setHeader("Location", Path.dirname(req.baseUrl))

			switch (res.contentType.name) {
				case "application/x-empty": return void res.status(204).end()
				default: return void res.status(303).end()
			}

		default: throw new HttpError(415)
	}
}))

exports.router.delete("/:personalId", function(req, res) {
	var {initiative} = req
	var {signature} = req
	if (signature == null) throw new HttpError(404, "Signature Not Found")

	if (!Initiative.isSignable(new Date, req.initiative))
		throw new HttpError(405, "Cannot Delete Signature as Signing Ended", {
			description: req.t("SIGNATURE_NOT_REVOKED_NOT_SIGNABLE")
		})

	signaturesDb.delete(signature)

	logger.info({
		request_id: req.headers["request-id"],
		event: "initiative-signature-deleted",
		initiative_uuid: initiative.uuid,
		signature_id: signature.id,
		signature_method: signature.method,
		signature_oversigned: signature.oversigned
	})

	res.flash("notice", req.t("SIGNATURE_REVOKED"))
	res.statusMessage = "Signature Deleted"
	res.redirect(303, Initiative.slugPath(initiative))
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

function* waitForMobileIdSignature(req, signable, session) {
	logger.info({
		request_id: req.headers["request-id"],
		event: "initiative-signature-waiting",
		initiative_uuid: signable.initiative_uuid,
		signable_id: signable.id,
		signature_method: signable.method,
		mobile_id_session_id: session.id
	})

	try {
		var {xades} = signable
		var sig = yield waitForMobileIdSession(120, session)
		if (sig == null) throw new MobileIdError("TIMEOUT")

		logger.info({
			request_id: req.headers["request-id"],
			event: "initiative-signature-signed",
			initiative_uuid: signable.initiative_uuid,
			signable_id: signable.id,
			signature_method: signable.method
		})

		if (!xades.certificate.hasSigned(xades.signable, sig))
			throw new MobileIdError("INVALID_SIGNATURE")

		yield finalizeSignable(req, signable, sig)
	}
	catch (ex) {
		logger.info({
			request_id: req.headers["request-id"],
			event: "initiative-signature-error",
			initiative_uuid: signable.initiative_uuid,
			signable_id: signable.id,
			signature_method: signable.method,
			error: ex.message
		})

		signablesDb.update(signable, {error: ex, updated_at: new Date})
	}
}

function* waitForSmartIdSignature(req, signable, session) {
	logger.info({
		request_id: req.headers["request-id"],
		event: "initiative-signature-waiting",
		initiative_uuid: signable.initiative_uuid,
		signable_id: signable.id,
		signature_method: signable.method,
		smart_id_session_id: session.id
	})

	try {
		var {xades} = signable
		var [_cert, sig] = (yield waitForSmartIdSession(120, session)) || []
		if (sig == null) throw new SmartIdError("TIMEOUT")

		logger.info({
			request_id: req.headers["request-id"],
			event: "initiative-signature-signed",
			initiative_uuid: signable.initiative_uuid,
			signable_id: signable.id,
			signature_method: signable.method
		})

		if (!xades.certificate.hasSigned(xades.signable, sig))
			throw new SmartIdError("INVALID_SIGNATURE")

		yield finalizeSignable(req, signable, sig)
	}
	catch (ex) {
		logger.info({
			request_id: req.headers["request-id"],
			event: "initiative-signature-error",
			initiative_uuid: signable.initiative_uuid,
			signable_id: signable.id,
			signature_method: signable.method,
			error: ex.message
		})

		signablesDb.update(signable, {error: ex, updated_at: new Date})
	}
}

function handleEidError(err, {t}, _res, next) {
	var statusCode, statusMessage, description

	if (err instanceof MobileIdError) {
		switch (getNormalizedMobileIdErrorCode(err)) {
			// Initiation responses:
			case "NOT_FOUND":
				statusCode = 422
				statusMessage = "Not a Mobile-ID User"
				description = t("eid_view.mobile_id_errors.not_found")
				break

			// Session responses;
			case "TIMEOUT":
				statusCode = 410
				statusMessage = "Mobile-ID Timeout"
				description = t("eid_view.mobile_id_errors.sign_timeout")
				break

			case "NOT_MID_CLIENT":
				statusCode = 410
				statusMessage = "Mobile-ID Certificates Not Activated"
				description = t("eid_view.mobile_id_errors.not_active")
				break

			case "USER_CANCELLED":
				statusCode = 410
				statusMessage = "Mobile-ID Cancelled"
				description = t("eid_view.mobile_id_errors.sign_cancelled")
				break

			case "SIGNATURE_HASH_MISMATCH":
				statusCode = 410
				statusMessage = "Mobile-ID Signature Hash Mismatch"
				description = t("eid_view.mobile_id_errors.sign_hash_mismatch")
				break

			case "PHONE_ABSENT":
				statusCode = 410
				statusMessage = "Mobile-ID Phone Absent"
				description = t("eid_view.mobile_id_errors.sign_phone_absent")
				break

			case "DELIVERY_ERROR":
				statusCode = 410
				statusMessage = "Mobile-ID Delivery Error"
				description = t("eid_view.mobile_id_errors.sign_delivery_error")
				break

			case "SIM_ERROR":
				statusCode = 410
				statusMessage = "Mobile-ID SIM Application Error"
				description = t("eid_view.mobile_id_errors.sim_error")
				break

			// Custom responses:
			case "INVALID_SIGNATURE":
				statusCode = 410
				statusMessage = "Invalid Mobile-ID Signature"
				description = t("eid_view.mobile_id_errors.sign_invalid_signature")
				break

			default:
				statusCode = 500
				statusMessage = "Unknown Mobile-ID Error"
				description = t("500_BODY")
		}

		next(new HttpError(statusCode, statusMessage, {description, error: err}))
	}
	else if (err instanceof SmartIdError) {
		switch (err.code) {
			// Initiation responses:
			case "ACCOUNT_NOT_FOUND":
				statusCode = 422
				statusMessage = "Not a Smart-ID User"
				description = t("eid_view.smart_id_errors.not_found")
				break

			// Session responses:
			case "USER_REFUSED":
				statusCode = 410
				statusMessage = "Smart-ID Cancelled"
				description = t("eid_view.smart_id_errors.sign_cancelled")
				break

			case "TIMEOUT":
				statusCode = 410
				statusMessage = "Smart-ID Timeout"
				description = t("eid_view.smart_id_errors.sign_timeout")
				break

			case "NO_SUITABLE_CERTIFICATE":
				statusCode = 410
				statusMessage = "No Smart-ID Certificate"
				description = t("eid_view.smart_id_errors.sign_no_suitable_certificate")
				break

			case "DOCUMENT_UNUSABLE":
				statusCode = 410
				statusMessage = "Smart-ID Certificate Unusable"
				description = t("eid_view.smart_id_errors.document_unusable")
				break

			case "WRONG_VC":
				statusCode = 410
				statusMessage = "Wrong Smart-ID Verification Code Chosen"
				description = t("eid_view.smart_id_errors.wrong_vc")
				break

			case "SESSION_NOT_FOUND":
				statusCode = 410
				statusMessage = "Smart-ID Timeout"
				description = t("eid_view.smart_id_errors.sign_timeout")
				break

			// Custom responses:
			case "INVALID_SIGNATURE":
				statusCode = 410
				statusMessage = "Invalid Smart-ID Signature"
				description = t("eid_view.smart_id_errors.sign_invalid_signature")
				break

			default:
				statusCode = 500
				statusMessage = "Unknown Smart-ID Error"
				description = t("500_BODY")
		}

		next(new HttpError(statusCode, statusMessage, {description, error: err}))
	}
	else next(err)
}

function reinstantiateError(obj) {
	switch (obj.name) {
		case "HttpError": return new HttpError(obj.code, obj.message, {
			description: obj.description
		})

		case "MobileIdError": return new MobileIdError(obj.code, obj.message)
		case "SmartIdError": return new SmartIdError(obj.code, obj.message)
		default: return new HttpError(500, "Internal Server Error", {error: obj})
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

function parseSignatureAttrs(req, obj) {
	var method = getSigningMethod(req)

	if (method == "mobile-id") return {
		method,
		personalId: parsePersonalId(String(obj["personal-id"])),
		phoneNumber: parsePhoneNumber(String(obj["phone-number"]))
	}

	if (method == "smart-id") return {
		method,
		personalId: parsePersonalId(String(obj["personal-id"]))
	}

	return {method}
}

function validateAge(t, id) {
	var birthdate = _.getBirthdateFromPersonalId(id)

	if (birthdate > DateFns.addYears(new Date, -16))
		return new HttpError(422, "Too Young", {
			description: t("creating_initiative_signature_page.errors.too_young")
		})

	return null
}

function rateLimitSigning(t, personalId) {
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
		var minutes = Math.max(DateFns.differenceInMinutes(until, new Date), 1)

		return new HttpError(429, "Too Many Incomplete Signatures", {
			description: t("eid_view.errors.sign_rate_limit", {minutes: minutes})
		})
	}

	return null
}

function* finalizeSignable(req, signable, signature) {
	var {xades} = signable

	xades.setSignature(signature)

	signable = signablesDb.update(signable, {
		xades: xades,
		signed: true,
		updated_at: new Date
	})

	logger.info({
		request_id: req.headers["request-id"],
		event: "initiative-signature-timestamping",
		initiative_uuid: signable.initiative_uuid,
		signable_id: signable.id,
		signature_method: signable.method,
		timestamp_url: hades.timestampUrl
	})

	xades.setTimestamp(yield hades.timestamp(xades))

	logger.info({
		request_id: req.headers["request-id"],
		event: "initiative-signature-timestamped",
		initiative_uuid: signable.initiative_uuid,
		signable_id: signable.id,
		signature_method: signable.method,
		timestamp_url: hades.timestampUrl
	})

	logger.info({
		request_id: req.headers["request-id"],
		event: "initiative-signature-ocsping",
		initiative_uuid: signable.initiative_uuid,
		signable_id: signable.id,
		signature_method: signable.method,
		ocsp_url: xades.certificate.ocspUrl
	})

	xades.setOcspResponse(yield hades.ocsp(xades.certificate))

	logger.info({
		request_id: req.headers["request-id"],
		event: "initiative-signature-ocsped",
		initiative_uuid: signable.initiative_uuid,
		signable_id: signable.id,
		signature_method: signable.method,
		ocsp_url: xades.certificate.ocspUrl
	})

	signablesDb.transact(function() {
		signable = signablesDb.update(signable, {
			xades: xades,
			timestamped: true,
			updated_at: new Date
		})

		replaceSignature(req, signable)
	})
}

function replaceSignature(req, signable) {
	signaturesDb.transact(function() {
		var oldSignature = signaturesDb.read(sql`
			SELECT rowid AS id, * FROM initiative_signatures
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

		var signature = signaturesDb.create({
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

		logger.info({
			request_id: req.headers["request-id"],
			event: "initiative-signature-end",
			initiative_uuid: signature.initiative_uuid,
			signable_id: signable.id,
			signature_id: signature.id,
			signature_method: signature.method,
			signature_oversigned: signature.oversigned,

			signature_oversigned_id:
				oldSignature && oldSignature.id || undefined,
			signature_oversigned_created_at:
				oldSignature && oldSignature.created_at || undefined,
			signature_oversigned_method:
				oldSignature && oldSignature.method || undefined
		})
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

// Get the rowid from the database until we add an auto-incremented id field to
// initiative_signables. Even though signables get cleared out regularly, the
// rowid seems to be in the hundreds of thousands.
function readSignableId(signable) {
	return signablesDb.read(sql`
		SELECT rowid FROM initiative_signables WHERE token = ${signable.token}
	`).rowid
}

function serializeSignatureCsv(sig) {
	return Csv.serialize([sig.personal_id, sig.created_at.toISOString()]) + "\n"
}

function parseToken(token) {
	// Some email clients include trailing punctuation in links.
	try { return Buffer.from(token.replace(/[^A-Fa-f0-9]/g, ""), "hex") }
	catch (ex) { if (ex instanceof TypeError) return Buffer.alloc(0); throw ex }
}


function serializeWaitPath(req, res, signatureOrSignable) {
	return req.baseUrl + "/" + pathToSignature(signatureOrSignable)
		+ (res.contentType.name == "text/html" ? "#verification-code" : "")
}

function serializeVerificationCode(signable) {
	var {signableHash} = signable.xades

	return _.padLeft((
		signable.method == "mobile-id" ? MobileId.verification(signableHash) :
		signable.method == "smart-id" ? SmartId.verification(signableHash) :
	0), 4, 0)
}

function parseSignatureId(id) { return [id.slice(0, 2), id.slice(2)] }
