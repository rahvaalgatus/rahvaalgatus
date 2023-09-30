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
var co = require("co")
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
var {validateAuthenticationCertificate} = require("root/lib/certificate")
var {validateIdCardAuthenticationCertificate} = require("root/lib/certificate")
var {hasSignatureType} = require("./initiatives/signatures_controller")
var {getNormalizedMobileIdErrorCode} = require("root/lib/eid")
var sql = require("sqlate")
var {validateRedirect} = require("root/lib/http")
var canonicalizeUrl = require("root/lib/middleware/canonical_site_middleware")
var reportError = require("root").errorReporter
var {constantTimeEqual} = require("root/lib/crypto")
var sessionsDb = require("root/db/sessions_db")
var usersDb = require("root/db/users_db")
var authenticationsDb = require("root/db/authentications_db")
var AUTH_RATE = 5
var AUTH_RATE_IN_MINUTES = 30
var {ENV} = process.env

var ID_CARD_AUTH_SECRET = (
	Config.idCardAuthenticationSecret &&
	Buffer.from(Config.idCardAuthenticationSecret)
)

var waitForMobileIdSession =
	waitForSession.bind(null, mobileId.waitForAuthentication.bind(mobileId))
var waitForSmartIdSession =
	waitForSession.bind(null, smartId.wait.bind(smartId))

var MOBILE_ID_ERRORS = {
	TIMEOUT: [
		410,
		"Mobile-Id Timeout",
		"MOBILE_ID_ERROR_TIMEOUT_AUTH"
	],

	NOT_MID_CLIENT: [
		422,
		"Not a Mobile-Id User or Personal Id Mismatch",
		"MOBILE_ID_ERROR_NOT_FOUND"
	],

	USER_CANCELLED: [
		410,
		"Mobile-Id Cancelled",
		"MOBILE_ID_ERROR_USER_CANCELLED_AUTH"
	],

	SIGNATURE_HASH_MISMATCH: [
		410,
		"Mobile-Id Signature Hash Mismatch",
		"MOBILE_ID_ERROR_SIGNATURE_HASH_MISMATCH_AUTH"
	],

	PHONE_ABSENT: [
		410,
		"Mobile-Id Phone Absent",
		"MOBILE_ID_ERROR_PHONE_ABSENT_AUTH"
	],

	DELIVERY_ERROR: [
		410,
		"Mobile-Id Delivery Error",
		"MOBILE_ID_ERROR_DELIVERY_ERROR_AUTH"
	],

	SIM_ERROR: [
		410,
		"Mobile-Id SIM Application Error",
		"MOBILE_ID_ERROR_SIM_ERROR"
	],

	// Custom responses:
	CERTIFICATE_MISMATCH: [
		409,
		"Authentication Certificate Doesn't Match",
		"MOBILE_ID_ERROR_AUTH_CERTIFICATE_MISMATCH"
	],

	INVALID_SIGNATURE: [
		410,
		"Invalid Mobile-Id Signature",
		"MOBILE_ID_ERROR_INVALID_SIGNATURE_AUTH"
	],

	NOT_FOUND: [
		422,
		"Not a Mobile-Id User or Personal Id Mismatch",
		"MOBILE_ID_ERROR_NOT_FOUND"
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
		"SMART_ID_ERROR_USER_REFUSED_AUTH"
	],

	TIMEOUT: [
		410,
		"Smart-Id Timeout",
		"SMART_ID_ERROR_TIMEOUT_AUTH"
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
	CERTIFICATE_MISMATCH: [
		409,
		"Authentication Certificate Doesn't Match",
		"SMART_ID_ERROR_AUTH_CERTIFICATE_MISMATCH"
	],

	INVALID_SIGNATURE: [
		410,
		"Invalid Smart-Id Signature",
		"SMART_ID_ERROR_INVALID_SIGNATURE"
	]
}

exports.router = Router({mergeParams: true})
exports.router.use(parseBody({type: hasSignatureType}))

exports.router.get("/", function(req, res) {
	if (req.user) res.redirect(302, "/user")
	else res.redirect(302, "/sessions/new")
})

exports.router.get("/new", canonicalizeUrl, function(req, res) {
	if (req.user)
		res.redirect(302, validateRedirect(req, req.headers.referer, "/user"))
	else
		res.render("sessions/create_page.jsx")
})

exports.router.post("/", next(function*(req, res, next) {
	if (req.query["authentication-token"]) return void next()

	var cert, err, country, personalId, authentication, authUrl, tokenHash

	var referrer = req.headers.referer
	if (referrer && Url.parse(referrer).pathname.startsWith(req.baseUrl))
		referrer = null

	switch (getSigninMethod(req)) {
		case "id-card":
			var pem = req.headers["x-client-certificate"]
			if (pem == null) throw new HttpError(400, "Missing Certificate", {
				description: req.t("ID_CARD_ERROR_CERTIFICATE_MISSING")
			})

			if (!ID_CARD_AUTH_SECRET)
				throw new HttpError(501, "ID-Card Authentication Not Yet Available")

			if (!constantTimeEqual(
				Buffer.from(req.headers["x-client-certificate-secret"] || ""),
				ID_CARD_AUTH_SECRET
			)) throw new HttpError(403, "Invalid Proxy Secret")

			cert = parseCertificateFromHeader(pem)
			if (err = validateIdCardAuthenticationCertificate(req.t, cert)) throw err

			if (req.headers["x-client-certificate-verification"] != "SUCCESS")
				throw new HttpError(422, "Sign In Failed", {
					description: req.t("ID_CARD_ERROR_AUTHENTICATION_FAILED")
				})

			;[country, personalId] = getCertificatePersonalId(cert)
			if (country != "EE") throw new HttpError(422, "Estonian Users Only")

			authentication = authenticationsDb.create({
				country: country,
				personal_id: personalId,
				method: "id-card",
				certificate: cert,
				token: Crypto.randomBytes(16),
				created_ip: req.ip,
				created_user_agent: req.headers["user-agent"],
				authenticated: true
			})

			createSessionAndSignIn(authentication, req, res)
			res.statusMessage = "Signed In"
			res.redirect(303, validateRedirect(req, referrer, "/user"))
			break

		case "mobile-id":
			var phoneNumber = parsePhoneNumber(String(req.body.phoneNumber))
			if (phoneNumber == null) throw new MobileIdError("NOT_FOUND")

			personalId = parsePersonalId(String(req.body.personalId))
			if (personalId == null) throw new MobileIdError("NOT_FOUND")
			if (rateLimitSigningIn(req, res, personalId)) return

			authentication = authenticationsDb.create({
				country: "EE",
				personal_id: personalId,
				method: "mobile-id",
				token: Crypto.randomBytes(16),
				created_ip: req.ip,
				created_user_agent: req.headers["user-agent"]
			})

			tokenHash = sha256(authentication.token)

			var sessionId = yield mobileId.authenticate(
				phoneNumber,
				personalId,
				tokenHash
			)

			co(waitForMobileIdAuthentication(req.t, authentication, sessionId))

			authUrl = req.baseUrl + "/?" + Qs.stringify({
				"authentication-token": authentication.token.toString("hex"),
				referrer: referrer
			})

			res.setHeader("Location", authUrl)

			res.status(202).render("sessions/creating_page.jsx", {
				method: "mobile-id",
				code: MobileId.confirmation(tokenHash),
				poll: authUrl
			})
			break

		case "smart-id":
			personalId = parsePersonalId(String(req.body.personalId))
			if (personalId == null) throw new SmartIdError("ACCOUNT_NOT_FOUND")
			if (rateLimitSigningIn(req, res, personalId)) return

			var token = Crypto.randomBytes(16)
			tokenHash = sha256(token)
			var session = yield smartId.authenticate("PNOEE-" + personalId, tokenHash)

			authentication = authenticationsDb.create({
				country: "EE",
				personal_id: personalId,
				method: "smart-id",
				token: token,
				created_ip: req.ip,
				created_user_agent: req.headers["user-agent"]
			})

			co(waitForSmartIdAuthentication(req.t, authentication, session))

			authUrl = req.baseUrl + "/?" + Qs.stringify({
				"authentication-token": authentication.token.toString("hex"),
				referrer: referrer
			})

			res.setHeader("Location", authUrl)

			res.status(202).render("sessions/creating_page.jsx", {
				method: "smart-id",
				code: SmartId.verification(tokenHash),
				poll: authUrl
			})
			break

		default: throw new HttpError(422, "Unknown Signing Method")
	}
}))

exports.router.post("/",
	new ResponseTypeMiddeware([
		"text/html",
		"application/x-empty"
	].map(MediaType)),
	next(function*(req, res) {
	var authenticationToken =
		Buffer.from(req.query["authentication-token"] || "", "hex")

	var authentication

	switch (getSigninMethod(req)) {
		case "mobile-id":
			for (
				let end = Date.now() + 120 * 1000;
				Date.now() < end;
				yield _.sleep(ENV == "test" ? 50 : 500)
			) {
				authentication = authenticationsDb.read(sql`
					SELECT * FROM authentications WHERE token = ${authenticationToken}
				`)

				if (!authentication)
					throw new HttpError(404, "Authentication Not Found")

				if (authentication.authenticated || authentication.error) break
			}

			if (authentication.error) {
				let err = authentication.error

				if (err.name == "HttpError") {
					res.statusCode = err.code
					res.statusMessage = err.message
					res.flash("error", err.description || err.message)
				}
				else if (err.name == "MobileIdError") {
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
				else {
					res.statusCode = 500
					res.flash("error", req.t("500_BODY"))
				}
			}
			else if (!authentication.authenticated) {
				res.statusCode = 410
				res.flash("error", req.t("MOBILE_ID_ERROR_TIMEOUT"))
			}
			break

		case "smart-id":
			for (
				let end = Date.now() + 120 * 1000;
				Date.now() < end;
				yield _.sleep(ENV == "test" ? 50 : 500)
			) {
				authentication = authenticationsDb.read(sql`
					SELECT * FROM authentications WHERE token = ${authenticationToken}
				`)

				if (!authentication)
					throw new HttpError(404, "Authentication Not Found")

				if (authentication.authenticated || authentication.error) break
			}

			if (authentication.error) {
				let err = authentication.error

				if (err.name == "HttpError") {
					res.statusCode = err.code
					res.statusMessage = err.message
					res.flash("error", err.description || err.message)
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
			else if (!authentication.authenticated) {
				res.statusCode = 410
				res.flash("error", req.t("SMART_ID_ERROR_TIMEOUT_AUTH"))
			}
			break

		default: throw new HttpError(422, "Unknown Signing Method")
	}

	if (authentication.authenticated) {
		res.setHeader("Location", validateRedirect(req, req.query.referrer, "/user"))
		createSessionAndSignIn(authentication, req, res)
		res.statusCode = 204
		res.statusMessage = "Signed In"
	}
	else res.setHeader("Location", req.baseUrl + "/new")

	switch (res.contentType.name) {
		case "application/x-empty": return void res.end()
		default: return void res.status(303).end()
	}
}))

exports.router.use("/", function(err, req, res, next) {
	if (err instanceof MobileIdError) {
		var code = getNormalizedMobileIdErrorCode(err)

		if (code in MOBILE_ID_ERRORS) {
			res.statusCode = MOBILE_ID_ERRORS[code][0]
			res.statusMessage = MOBILE_ID_ERRORS[code][1]

			res.render("sessions/creating_page.jsx", {
				error: req.t(MOBILE_ID_ERRORS[code][2])
			})
		}
		else throw new HttpError(500, "Unknown Mobile-Id Error", {error: err})
	}
	else if (err instanceof SmartIdError) {
		if (err.code in SMART_ID_ERRORS) {
			res.statusCode = SMART_ID_ERRORS[err.code][0]
			res.statusMessage = SMART_ID_ERRORS[err.code][1]

			res.render("sessions/creating_page.jsx", {
				error: req.t(SMART_ID_ERRORS[err.code][2])
			})
		}
		else throw new HttpError(500, "Unknown Smart-Id Error", {error: err})
	}
	else next(err)
})

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
			domain: Config.cookieDomain
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

function* waitForMobileIdAuthentication(t, authentication, sessionId) {
	try {
		var certAndSignatureHash = yield waitForMobileIdSession(120, sessionId)
		if (certAndSignatureHash == null) throw new MobileIdError("TIMEOUT")

		var [cert, signatureHash] = certAndSignatureHash

		authenticationsDb.update(authentication, {
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

		if (!cert.hasSigned(authentication.token, signatureHash))
			throw new MobileIdError("INVALID_SIGNATURE")

		authenticationsDb.update(authentication, {
			authenticated: true,
			updated_at: new Date
		})
	}
	catch (ex) {
		if (!(
			ex instanceof HttpError ||
			ex instanceof MobileIdError &&
			getNormalizedMobileIdErrorCode(ex) in MOBILE_ID_ERRORS
		)) reportError(ex)

		authenticationsDb.update(authentication, {error: ex, updated_at: new Date})
	}
}

function* waitForSmartIdAuthentication(t, authentication, session) {
	try {
		var authCertAndSignature = yield waitForSmartIdSession(120, session)
		if (authCertAndSignature == null) throw new SmartIdError("TIMEOUT")

		var [cert, signature] = authCertAndSignature

		authenticationsDb.update(authentication, {
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

		if (!cert.hasSigned(authentication.token, signature))
			throw new SmartIdError("INVALID_SIGNATURE")

		authenticationsDb.update(authentication, {
			authenticated: true,
			updated_at: new Date
		})
	}
	catch (ex) {
		if (!(
			ex instanceof HttpError ||
			ex instanceof SmartIdError && ex.code in SMART_ID_ERRORS
		)) reportError(ex)

		authenticationsDb.update(authentication, {error: ex, updated_at: new Date})
	}
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

	logger.info(
		"Created session %d for user %d from request %s.",
		session.id,
		user.id,
		req.headers["request-id"] || "?"
	)

	res.cookie(Config.sessionCookieName, sessionToken.toString("hex"), {
		httpOnly: true,
		secure: req.secure,
		sameSite: "lax",
		domain: Config.cookieDomain,
		maxAge: 120 * 86400 * 1000
	})

	csrf.reset(req, res)
}

function rateLimitSigningIn(req, res, personalId) {
	var authentications = authenticationsDb.search(sql`
		SELECT created_at FROM authentications
		WHERE personal_id = ${personalId}
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
		res.statusCode = 429
		res.statusMessage = "Too Many Incomplete Authentications"

		var minutes = Math.max(DateFns.differenceInMinutes(until, new Date), 1)

		res.render("error_page.jsx", {
			title: req.t("AUTH_RATE_LIMIT_TITLE", {minutes: minutes}),
			body: req.t("AUTH_RATE_LIMIT_BODY", {minutes: minutes})
		})

		return true
	}

	return false
}

function* waitForSession(wait, timeout, session) {
	var res
	for (
		var started = Date.now() / 1000, elapsed = 0;
		res == null && elapsed < timeout;
		elapsed = Date.now() / 1000 - started
	) res = yield wait(session, timeout - elapsed)
	return res
}

function getSigninMethod(req) {
	var type = req.contentType.name

	return (
		type == "application/x-www-form-urlencoded" ? req.body.method :
		type == "application/json" ? req.body.method :
		null
	)
}

function parseCertificateFromHeader(pem) {
	return Certificate.parse(decodeURIComponent(pem))
}
