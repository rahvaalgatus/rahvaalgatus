var _ = require("root/lib/underscore")
var Qs = require("querystring")
var Url = require("url")
var {Router} = require("express")
var Config = require("root").config
var Crypto = require("crypto")
var DateFns = require("date-fns")
var HttpError = require("standard-http-error")
var Certificate = require("undersign/lib/certificate")
var MediaType = require("medium-type")
var MobileId = require("undersign/lib/mobile_id")
var {MobileIdError} = require("undersign/lib/mobile_id")
var SmartId = require("undersign/lib/smart_id")
var {SmartIdError} = require("undersign/lib/smart_id")
var ResponseTypeMiddeware =
	require("root/lib/middleware/response_type_middleware")
var next = require("co-next")
var {logger} = require("root")
var {mobileId} = require("root")
var {smartId} = require("root")
var parseBody = require("body-parser").raw
var csrf = require("root/lib/middleware/csrf_middleware")
var sha256 = require("root/lib/crypto").hash.bind(null, "sha256")
var {parsePersonalId} = require("root/lib/eid")
var {parsePhoneNumber} = require("root/lib/eid")
var {getCertificatePersonalId} = require("root/lib/certificate")
var {getCertificatePersonName} = require("root/lib/certificate")
var {serializeRefreshHeader} = require("root/lib/http")
var {validateAuthenticationCertificate} = require("root/lib/certificate")
var {validateIdCardAuthenticationCertificate} = require("root/lib/certificate")
var {hasSignatureType} = require("./initiatives/signatures_controller")
var {reinstantiateError} = require("./initiatives/signatures_controller")
var {getNormalizedMobileIdErrorCode} = require("root/lib/eid")
var sql = require("sqlate")
var {validateRedirect} = require("root/lib/http")
var {constantTimeEqual} = require("root/lib/crypto")
var sessionsDb = require("root/db/sessions_db")
var usersDb = require("root/db/users_db")
var authenticationsDb = require("root/db/authentications_db")
var AUTH_RATE = 5
var AUTH_RATE_IN_MINUTES = 30

var ID_CARD_AUTH_SECRET = (
	Config.idCardAuthenticationSecret &&
	Buffer.from(Config.idCardAuthenticationSecret)
)

exports.router = Router({mergeParams: true})
exports.router.use(parseBody({type: hasSignatureType}))

exports.router.get("/", function(req, res) {
	if (req.user) res.redirect(302, "/user")
	else res.redirect(302, "/sessions/new")
})

exports.router.get("/new", function(req, res, next) {
	if (req.user) {
		var referrer = req.query.referrer || req.headers.referer
		res.redirect(302, validateRedirect(req, referrer, "/user"))
	}
	else if (req.query["authentication-token"])
		next()
	else
		res.render("sessions/create_page.jsx")
})

exports.router.get("/new",
	new ResponseTypeMiddeware([
		"text/html",
		"application/json"
	].map(MediaType)),
	next(function*(req, res) {
	var {t} = req

	if (req.query["csrf-token"] !== req.csrfToken)
		throw new HttpError(412, "Bad Query CSRF Token", {
			description: t("create_session_page.errors.invalid_csrf_token")
		})

	var authenticationToken =
		Buffer.from(req.query["authentication-token"] || "", "hex")

	var authentication = authenticationsDb.read(sql`
		SELECT * FROM authentications WHERE token = ${authenticationToken}
	`)

	if (!authentication) throw new HttpError(404, "Authentication Not Found")

	var {method} = authentication

	if (!(method == "mobile-id" || method == "smart-id"))
		throw new HttpError(409, "Cannot Wait for ID-card")

	if (authentication.error) throw reinstantiateError(authentication.error)

	if (authentication.authenticated) {
		var used = Boolean(sessionsDb.read(sql`
			SELECT true FROM sessions
			WHERE authentication_id = ${authentication.id}
		`))

		if (used) throw new HttpError(410, "Session Already Created", {
			description: t("create_session_page.errors.authentication_already_used")
		})
	}
	else {
		var isAjax = res.contentType.name == "application/json"
		var timeout = isAjax ? 120 : 1

		switch (method) {
			case "mobile-id":
				authentication = (yield waitForMobileIdAuthentication(
					req,
					req.t,
					authentication,
					timeout
				)) || authentication
				break

			case "smart-id":
				authentication = (yield waitForSmartIdAuthentication(
					req,
					req.t,
					authentication,
					timeout
				)) || authentication
				break

			default: throw new Error("Unknown Authentication Method")
		}
	}

	var waitUrl = req.baseUrl + "/new?" + Qs.stringify({
		"authentication-token": authentication.token.toString("hex"),
		"csrf-token": req.csrfToken,
		referrer: req.query.referrer
	}) + (res.contentType.name == "text/html" ? "#verification-code" : "")

	if (authentication.authenticated) switch (res.contentType.name) {
		case "application/json":
			res.statusMessage =
				method == "mobile-id" ? "Authenticated with Mobile-ID" :
				method == "smart-id" ? "Authenticated with Smart-ID" :
				"Authenticated"

			res.setHeader("Location", waitUrl)
			return void res.json({state: "DONE"})

		default:
			createSessionAndSignIn(authentication, req, res)

			res.statusMessage =
				method == "mobile-id" ? "Signed In with Mobile-ID" :
				method == "smart-id" ? "Signed In with Smart-ID" :
				"Signed In"

			res.redirect(303, validateRedirect(req, req.query.referrer, "/user"))
	}
	else {
		res.statusCode = 202

		res.statusMessage =
			method == "mobile-id" ? "Waiting for Mobile-ID" :
			method == "smart-id" ? "Waiting for Smart-ID" :
			"Waiting"

		res.setHeader("Refresh", serializeRefreshHeader(2, waitUrl))
		var verificationCode = serializeVerificationCode(authentication)
		res.setHeader("X-Verification-Code", verificationCode)

		switch (res.contentType.name) {
			case "application/json": return void res.json({state: "PENDING"})

			default: res.render("sessions/creating_page.jsx", {
				method,
				verificationCode,
			})
		}
	}
}), handleEidError)

exports.router.post("/",
	new ResponseTypeMiddeware([
		"text/html",
		"application/json",
		"application/x-empty",
	].map(MediaType)),
	next(function*(req, res) {
	var {t} = req
	// TODO: Rename personalId to untrustedPersonalId.
	var {method, personalId, phoneNumber} = parseAuthenticationAttrs(req.body)
	var err, authentication
	var token = Crypto.randomBytes(16)

	var referrer = req.headers.referer
	if (referrer && Url.parse(referrer).pathname.startsWith(req.baseUrl))
		referrer = null

	switch (method) {
		case "id-card": {
			var pem = req.headers["x-client-certificate"]
			if (pem == null) throw new HttpError(400, "Missing Certificate", {
				description: t("create_session_page.id_card_errors.certificate_missing")
			})

			if (!ID_CARD_AUTH_SECRET)
				throw new HttpError(501, "ID-card Authentication Not Yet Available")

			if (!constantTimeEqual(
				Buffer.from(req.headers["x-client-certificate-secret"] || ""),
				ID_CARD_AUTH_SECRET
			)) throw new HttpError(403, "Invalid Proxy Secret", {
				description:
					t("create_session_page.id_card_errors.invalid_proxy_secret")
			})

			let cert = parseCertificateFromHeader(pem)
			if (err = validateIdCardAuthenticationCertificate(t, cert)) throw err

			if (req.headers["x-client-certificate-verification"] != "SUCCESS")
				throw new HttpError(422, "Sign In Failed", {
					description: t("create_session_page.id_card_errors.authentication_failed")
				})

			let [country, personalId] = getCertificatePersonalId(cert)

			if (country != "EE") throw new HttpError(422, "Estonian Users Only", {
				description:
					t("create_session_page.id_card_errors.non_estonian_certificate")
			})

			authentication = authenticationsDb.create({
				country: country,
				personal_id: personalId,
				method,
				certificate: cert,
				token,
				created_ip: req.ip,
				created_user_agent: req.headers["user-agent"],
				authenticated: true
			})

			createSessionAndSignIn(authentication, req, res)
			res.statusMessage = "Signed In with ID-card"
			return void res.redirect(303, validateRedirect(req, referrer, "/user"))
		}

		case "mobile-id": {
			if (phoneNumber == null) throw new MobileIdError("NOT_FOUND")

			if (personalId == null) throw new HttpError(422, "Invalid Personal Id", {
				description: t("eid_view.errors.invalid_personal_id")
			})

			if (err = rateLimitSigningIn(t, personalId)) throw err

			logger.info({
				request_id: req.headers["request-id"],
				event: "authentication-start",
				authentication_method: "mobile-id"
			})

			let session = yield mobileId.authenticate(
				phoneNumber,
				personalId,
				sha256(token)
			)

			authentication = authenticationsDb.create({
				country: "EE",
				personal_id: personalId,
				method,
				token,
				created_ip: req.ip,
				created_user_agent: req.headers["user-agent"],
				eid_session: session
			})

			break
		}

		case "smart-id": {
			if (personalId == null) throw new HttpError(422, "Invalid Personal Id", {
				description: t("eid_view.errors.invalid_personal_id")
			})

			if (err = rateLimitSigningIn(t, personalId)) throw err

			logger.info({
				request_id: req.headers["request-id"],
				event: "authentication-start",
				authentication_method: "smart-id"
			})

			let session = yield smartId.authenticate(
				"PNOEE-" + personalId,
				sha256(token)
			)

			authentication = authenticationsDb.create({
				country: "EE",
				personal_id: personalId,
				method,
				token,
				created_ip: req.ip,
				created_user_agent: req.headers["user-agent"],
				eid_session: session
			})

			break
		}

		default: throw new HttpError(422, "Unknown Authentication Method")
	}

	var waitUrl = req.baseUrl + "/new?" + Qs.stringify({
		"authentication-token": authentication.token.toString("hex"),
		"csrf-token": req.csrfToken,
		referrer: referrer
	}) + (res.contentType.name == "text/html" ? "#verification-code" : "")

	res.statusCode = 202

	res.statusMessage =
		method == "mobile-id" ? "Signing In with Mobile-ID" :
		method == "smart-id" ? "Signing In with Smart-ID" :
		"Signed In"

	var verificationCode = serializeVerificationCode(authentication)
	res.setHeader("Refresh", serializeRefreshHeader(4, waitUrl))
	res.setHeader("X-Verification-Code", verificationCode)

	switch (res.contentType.name) {
		case "application/json":
		case "application/x-empty": return void res.end()

		default: res.render("sessions/creating_page.jsx", {
			method,
			verificationCode
		})
	}
}), handleEidError)

exports.router.use("/:id", function(req, _res, next) {
	if (req.user == null) throw new HttpError(401)

	var id = Number(req.params.id)
	var session = req.session.id == id ? req.session : sessionsDb.read(sql`
		SELECT * FROM sessions WHERE id = ${id} AND user_id = ${req.user.id}
	`)

	if (session == null) throw new HttpError(404, "Session Not Found")

	req.editableSession = session
	next()
})

exports.router.delete("/:id", function(req, res) {
	var session = req.editableSession
	if (session.deleted_at) throw new HttpError(410, "Session Gone")

	sessionsDb.update(session, {deleted_at: new Date})

	if (req.session.id == session.id) {
		res.clearCookie(Config.sessionCookieName, {
			httpOnly: true,
			secure: req.secure,
			domain: Config.sessionCookieDomain
		})

		// NOTE: There's no security benefit in resetting the CSRF token on
		// signout. Someone with access to the browser and with CSRF token fixation
		// intentions could've just logged the person out themselves or
		// done their dirty deeds while it was logged in.
		res.flash("notice", req.t("CURRENT_SESSION_DELETED"))
		res.statusMessage = "Signed Out"
	}
	else {
		res.flash("notice", req.t("SESSION_DELETED"))
		res.statusMessage = "Session Deleted"
	}

	var to = req.headers.referer
	if (to && Url.parse(to).pathname.match(/^\/user($|\/)/)) to = "/"
	res.redirect(303, validateRedirect(req, to, "/"))
})

function* waitForMobileIdAuthentication(req, t, authentication, timeout) {
	var session = authentication.eid_session

	logger.info({
		request_id: req.headers["request-id"],
		event: "authentication-waiting",
		authentication_method: authentication.method,
		mobile_id_session_id: session.id
	})

	try {
		var [cert, sig] = (yield mobileId.wait(session, timeout)) || []
		if (cert == null || sig == null) return null

		logger.info({
			request_id: req.headers["request-id"],
			event: "authentication-signed",
			authentication_id: authentication.id,
			authentication_method: authentication.method
		})

		authentication = authenticationsDb.update(authentication, {
			certificate: cert,
			updated_at: new Date
		})

		var err
		if (err = validateAuthenticationCertificate(t, cert)) throw err

		var [country, personalId] = getCertificatePersonalId(cert)
		if (
			authentication.country != country ||
			authentication.personal_id != personalId
		) throw new MobileIdError("CERTIFICATE_MISMATCH")

		if (!cert.hasSigned(authentication.token, sig))
			throw new MobileIdError("INVALID_SIGNATURE")

		logger.info({
			request_id: req.headers["request-id"],
			event: "authentication-validated",
			authentication_id: authentication.id,
			authentication_method: authentication.method
		})

		return authenticationsDb.update(authentication, {
			authenticated: true,
			updated_at: new Date
		})
	}
	catch (ex) {
		logger.info({
			request_id: req.headers["request-id"],
			event: "authentication-error",
			authentication_id: authentication.id,
			authentication_method: authentication.method,
			error: ex.message
		})

		authenticationsDb.update(authentication, {error: ex, updated_at: new Date})

		throw ex
	}
}

function* waitForSmartIdAuthentication(req, t, authentication, timeout) {
	var session = authentication.eid_session

	logger.info({
		request_id: req.headers["request-id"],
		event: "authentication-waiting",
		authentication_method: authentication.method,
		smart_id_session_id: session.id,
		timeout
	})

	try {
		var [cert, sig] = (yield smartId.wait(session, timeout)) || []
		if (cert == null) return null

		logger.info({
			request_id: req.headers["request-id"],
			event: "authentication-signed",
			authentication_id: authentication.id,
			authentication_method: authentication.method
		})

		authentication = authenticationsDb.update(authentication, {
			certificate: cert,
			updated_at: new Date
		})

		var err
		if (err = validateAuthenticationCertificate(t, cert)) throw err

		var [country, personalId] = getCertificatePersonalId(cert)
		if (
			authentication.country != country ||
			authentication.personal_id != personalId
		) throw new SmartIdError("CERTIFICATE_MISMATCH")

		if (!cert.hasSigned(authentication.token, sig))
			throw new SmartIdError("INVALID_SIGNATURE")

		logger.info({
			request_id: req.headers["request-id"],
			event: "authentication-validated",
			authentication_id: authentication.id,
			authentication_method: authentication.method
		})

		return authenticationsDb.update(authentication, {
			authenticated: true,
			updated_at: new Date
		})
	}
	catch (ex) {
		logger.info({
			request_id: req.headers["request-id"],
			event: "authentication-error",
			authentication_id: authentication.id,
			authentication_method: authentication.method,
			error: ex.message
		})

		authenticationsDb.update(authentication, {error: ex, updated_at: new Date})

		throw ex
	}
}

function handleEidError(err, {t}, _res, next) {
	var statusCode, statusMessage, description

	if (err instanceof MobileIdError) {
		switch (getNormalizedMobileIdErrorCode(err)) {
			case "NOT_FOUND":
				statusCode = 422
				statusMessage = "Not a Mobile-ID User"
				description = t("eid_view.mobile_id_errors.not_found")
				break

			case "TIMEOUT":
				statusCode = 410
				statusMessage = "Mobile-ID Timeout"
				description = t("eid_view.mobile_id_errors.auth_timeout")
				break

			case "NOT_MID_CLIENT":
				statusCode = 422
				statusMessage = "Not a Mobile-ID User"
				description = t("eid_view.mobile_id_errors.not_found")
				break

			case "USER_CANCELLED":
				statusCode = 410
				statusMessage = "Mobile-ID Cancelled"
				description = t("eid_view.mobile_id_errors.auth_cancelled")
				break

			case "SIGNATURE_HASH_MISMATCH":
				statusCode = 410
				statusMessage = "Mobile-ID Signature Hash Mismatch"
				description = t("eid_view.mobile_id_errors.auth_hash_mismatch")
				break

			case "PHONE_ABSENT":
				statusCode = 410
				statusMessage = "Mobile-ID Phone Absent"
				description = t("eid_view.mobile_id_errors.auth_phone_absent")
				break

			case "DELIVERY_ERROR":
				statusCode = 410
				statusMessage = "Mobile-ID Delivery Error"
				description = t("eid_view.mobile_id_errors.auth_delivery_error")
				break

			case "SIM_ERROR":
				statusCode = 410
				statusMessage = "Mobile-ID SIM Application Error"
				description = t("eid_view.mobile_id_errors.sim_error")
				break

			case "SESSION_NOT_FOUND":
				statusCode = 410
				statusMessage = "Mobile-ID Timeout"
				description = t("eid_view.mobile_id_errors.auth_timeout")
				break

			// Custom responses
			case "CERTIFICATE_MISMATCH":
				statusCode = 409
				statusMessage = "Authentication Certificate Doesn't Match"
				description = t("eid_view.mobile_id_errors.auth_certificate_mismatch")
				break

			case "INVALID_SIGNATURE":
				statusCode = 410
				statusMessage = "Invalid Mobile-ID Signature"
				description = t("eid_view.mobile_id_errors.auth_invalid_signature")
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
				description = t("eid_view.smart_id_errors.auth_cancelled")
				break

			case "TIMEOUT":
				statusCode = 410
				statusMessage = "Smart-ID Timeout"
				description = t("eid_view.smart_id_errors.auth_timeout")
				break

			case "NO_SUITABLE_CERTIFICATE":
				statusCode = 410
				statusMessage = "No Smart-ID Certificate"
				description = t("eid_view.smart_id_errors.auth_no_suitable_certificate")
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
				description = t("eid_view.smart_id_errors.auth_timeout")
				break

			// Custom responses:
			case "CERTIFICATE_MISMATCH":
				statusCode = 409
				statusMessage = "Authentication Certificate Doesn't Match"
				description = t("eid_view.smart_id_errors.auth_certificate_mismatch")
				break

			case "INVALID_SIGNATURE":
				statusCode = 410
				statusMessage = "Invalid Smart-ID Signature"
				description = t("eid_view.smart_id_errors.auth_invalid_signature")
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

function readOrCreateUser(auth, lang) {
	var user = usersDb.read(sql`
		SELECT * FROM users
		WHERE country = ${auth.country}
		AND personal_id = ${auth.personal_id}
	`)

	if (user) return user
	if (auth.country != "EE") throw new HttpError(501, "Estonian Users Only")

	var officialName = getCertificatePersonName(auth.certificate)

	return usersDb.create({
		uuid: _.uuidV4(),
		country: auth.country,
		personal_id: auth.personal_id,
		name: officialName,
		official_name: officialName,
		created_at: new Date,
		updated_at: new Date,
		language: lang
	})
}

function createSessionAndSignIn(authentication, req, res) {
	if (!authentication.authenticated)
		throw new Error("Authentication is not authenticated")

	var user = readOrCreateUser(authentication, req.lang)
	var sessionToken = Crypto.randomBytes(16)

	var session = sessionsDb.create({
		user_id: user.id,

		// Hashing isn't meant to be long-term protection against token leakage.
		// Rather, should someone, like an admin, glance at the sessions table,
		// they wouldn't be able to immediately impersonate anyone and would have
		// to mine a little Bitcoin prior.
		token_sha256: sha256(sessionToken),
		created_ip: authentication.created_ip,
		created_user_agent: authentication.created_user_agent,
		method: authentication.method,
		authentication_id: authentication.id
	})

	logger.info({
		request_id: req.headers["request-id"],
		event: "authentication-end",
		authentication_id: authentication.id,
		authentication_method: authentication.method,
		session_id: session.id,
		user_id: user.id
	})

	res.cookie(Config.sessionCookieName, sessionToken.toString("hex"), {
		httpOnly: true,
		secure: req.secure,
		sameSite: "lax",
		domain: Config.sessionCookieDomain,
		maxAge: 120 * 86400 * 1000
	})

	csrf.reset(req, res)
}

function rateLimitSigningIn(t, personalId) {
	var authentications = authenticationsDb.search(sql`
		SELECT created_at FROM authentications
		WHERE country = 'EE'
		AND personal_id = ${personalId}
		AND created_at > ${DateFns.addMinutes(new Date, -AUTH_RATE_IN_MINUTES)}
		AND NOT authenticated
		AND method != 'id-card'
		ORDER BY created_at ASC
		LIMIT ${AUTH_RATE}
	`)

	var until = authentications.length < AUTH_RATE
		? null
		: DateFns.addMinutes(authentications[0].created_at, AUTH_RATE_IN_MINUTES)

	if (until) {
		var minutes = Math.max(DateFns.differenceInMinutes(until, new Date), 1)

		return new HttpError(429, "Too Many Incomplete Authentications", {
			description: t("eid_view.errors.auth_rate_limit", {minutes: minutes})
		})
	}

	return null
}

function parseAuthenticationAttrs(obj) {
	var {method} = obj

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

function parseCertificateFromHeader(pem) {
	return Certificate.parse(decodeURIComponent(pem))
}


function serializeVerificationCode(authentication) {
	var tokenHash = sha256(authentication.token)

	return _.padLeft((
		authentication.method == "mobile-id" ? MobileId.verification(tokenHash) :
		authentication.method == "smart-id" ? SmartId.verification(tokenHash) :
	0), 4, 0)
}
