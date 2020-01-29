var _ = require("root/lib/underscore")
var Qs = require("querystring")
var Url = require("url")
var Router = require("express").Router
var Config = require("root/config")
var Crypto = require("crypto")
var HttpError = require("standard-http-error")
var Certificate = require("undersign/lib/certificate")
var MediaType = require("medium-type")
var MobileId = require("undersign/lib/mobile_id")
var MobileIdError = require("undersign/lib/mobile_id").MobileIdError
var SmartId = require("undersign/lib/smart_id")
var SmartIdError = require("undersign/lib/smart_id").SmartIdError
var ResponseTypeMiddeware =
	require("root/lib/middleware/response_type_middleware")
var co = require("co")
var next = require("co-next")
var mobileId = require("root").mobileId
var smartId = require("root").smartId
var parseBody = require("body-parser").raw
var csrf = require("root/lib/middleware/csrf_middleware")
var cosDb = require("root").cosDb
var sha256 = require("root/lib/crypto").hash.bind(null, "sha256")
var {ensureAreaCode} = require("root/lib/mobile_id")
var {getCertificatePersonalId} = require("root/lib/certificate")
var {getCertificatePersonName} = require("root/lib/certificate")
var {validateCertificate} = require("root/lib/certificate")
var getNormalizedMobileIdErrorCode =
	require("root/lib/mobile_id").getNormalizedErrorCode
var logger = require("root").logger
var sql = require("sqlate")
var sleep = require("root/lib/promise").sleep
var reportError = require("root").errorReporter
var sessionsDb = require("root/db/sessions_db")
var usersDb = require("root/db/users_db")
var authenticationsDb = require("root/db/authentications_db")
var SESSION_COOKIE_NAME = Config.sessionCookieName
var ENV = process.env.ENV

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
		"MOBILE_ID_ERROR_TIMEOUT_AUTH"
	],

	NOT_MID_CLIENT: [
		410,
		"Mobile-Id Certificates Not Activated",
		"MOBILE_ID_ERROR_NOT_ACTIVE"
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
	INVALID_SIGNATURE: [
		410,
		"Invalid Mobile-Id Signature",
		"MOBILE_ID_ERROR_INVALID_SIGNATURE_AUTH"
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
	INVALID_SIGNATURE: [
		410,
		"Invalid Smart-Id Signature",
		"SMART_ID_ERROR_INVALID_SIGNATURE"
	]
}

exports.router = Router({mergeParams: true})

exports.router.use(parseBody({type: hasSignatureType}))

exports.router.get("/new", function(req, res) {
	if (req.user)
		res.redirect(302, referTo(req, req.headers.referer, "/user"))
	else
		res.render("sessions/create_page.jsx")
})

exports.router.get("/", function(req, res) {
	if (req.user) res.redirect(302, "/user")
	else res.redirect(302, "/sessions/new")
})

exports.router.post("/", next(function*(req, res, next) {
	if (req.query["authentication-token"]) return void next()

	var cert, err, country, personalId, authentication, authUrl, tokenHash
	var method = getAuthenticationMethod(req)

	var referrer = req.headers.referer
	if (referrer && Url.parse(referrer).pathname.startsWith(req.baseUrl))
		referrer = null

	switch (method) {
		case "id-card":
			cert = Certificate.parse(req.body)
			if (err = validateCertificate(req.t, cert)) throw err

			;[country, personalId] = getCertificatePersonalId(cert)
			if (country != "EE") throw new HttpError(422, "Estonian Users Only")

			authentication = yield authenticationsDb.create({
				country: country,
				personal_id: personalId,
				method: "id-card",
				certificate: cert,
				token: Crypto.randomBytes(16),
				created_ip: req.ip,
				created_user_agent: req.headers["user-agent"]
			})

			authUrl = req.baseUrl + "/?" + Qs.stringify({
				"authentication-token": authentication.token.toString("hex"),
				referrer: referrer
			})

			res.setHeader("Location", authUrl)
			res.setHeader("Content-Type", "application/vnd.rahvaalgatus.signable")
			res.status(202).end(sha256(authentication.token))
			break

		case "mobile-id":
			var phoneNumber = ensureAreaCode(req.body.phoneNumber)
			personalId = req.body.personalId

			// Log Mobile-Id requests to confirm SK's billing.
			logger.info(
				"Authenticating via Mobile-Id for %s and %s.",
				phoneNumber,
				personalId
			)

			// It's easier to get the signing certificate to validate the personal id
			// and Mobile-Id existence and only then initiate the actual
			// authentication. This way we avoid creating a authentication and going
			// async.
			cert = yield mobileId.readCertificate(phoneNumber, personalId)
			if (err = validateCertificate(req.t, cert)) throw err

			;[country, personalId] = getCertificatePersonalId(cert)
			if (country != "EE") throw new HttpError(422, "Estonian Users Only")

			authentication = yield authenticationsDb.create({
				country: country,
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
			personalId = req.body.personalId

			// Log Smart-Id requests to confirm SK's billing.
			logger.info("Authenticating via Smart-Id for %s.", personalId)

			var token = Crypto.randomBytes(16)
			tokenHash = sha256(token)
			var session = yield smartId.authenticate("PNOEE-" + personalId, tokenHash)

			authentication = yield authenticationsDb.create({
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
	var authenticationToken = Buffer.from(
		req.query["authentication-token"] || "",
		"hex"
	)

	var authentication
	var method = getAuthenticationMethod(req)

	switch (method) {
		case "id-card":
			var type = req.contentType && req.contentType.name
			if (type != "application/vnd.rahvaalgatus.signature")
				throw new HttpError(415, "Signature Expected")

			authentication = yield authenticationsDb.read(sql`
				SELECT * FROM authentications WHERE token = ${authenticationToken}
			`)

			if (!authentication)
				throw new HttpError(404, "Authentication Not Found")
			if (authentication.authenticated)
				throw new HttpError(409, "Already Authenticated")
			if (!authentication.certificate.hasSigned(authentication.token, req.body))
				throw new HttpError(409, "Invalid Signature")

			var attrs = {authenticated: true, updated_at: new Date}
			_.assign(authentication, attrs)
			yield authenticationsDb.update(authentication, attrs)
			break

		case "mobile-id":
			for (
				let end = Date.now() + 120 * 1000;
				Date.now() < end;
				yield sleep(ENV == "test" ? 50 : 500)
			) {
				authentication = yield authenticationsDb.read(sql`
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
				yield sleep(ENV == "test" ? 50 : 500)
			) {
				authentication = yield authenticationsDb.read(sql`
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
		res.setHeader("Location", referTo(req, req.query.referrer, "/user"))

		var user = yield readOrCreateUser(authentication, req.lang)
		var sessionToken = Crypto.randomBytes(16)

		yield sessionsDb.create({
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

		res.cookie(SESSION_COOKIE_NAME, sessionToken.toString("hex"), {
			httpOnly: true,
			secure: req.secure,
			domain: Config.cookieDomain,
			maxAge: 365 * 86400 * 1000
		})

		csrf.reset(req, res)

		res.statusCode = 204
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

exports.router.use("/:id", next(function*(req, _res, next) {
	if (req.user == null) throw new HttpError(401)

	var id = Number(req.params.id)
	var session = req.session.id == id ? req.session : yield sessionsDb.read(sql`
		SELECT * FROM sessions WHERE id = ${id} AND user_id = ${req.user.id}
	`)

	if (session == null) throw new HttpError(404, "Session Not Found")

	req.editableSession = session
	next()
}))

exports.router.delete("/:id", next(function*(req, res) {
	var session = req.editableSession
	if (session.deleted_at) throw new HttpError(410, "Session Gone")

	yield sessionsDb.update(session, {deleted_at: new Date})

	if (req.session.id == session.id) {
		res.clearCookie(SESSION_COOKIE_NAME, {
			httpOnly: true,
			secure: req.secure,
			domain: Config.cookieDomain
		})

		// NOTE: There's no security benefit in resetting the CSRF token on
		// signout. Someone with access to the browser and with CSRF token fixation
		// intentions could've just logged the person out themselves or
		// done their dirty deeds while it was logged in.
		res.flash("notice", req.t("CURRENT_SESSION_DELETED"))
	}
	else {
		res.flash("notice", req.t("SESSION_DELETED"))
	}

	var to = req.headers.referer
	if (to && Url.parse(to).pathname == "/user") to = "/"
	else if (!to) to = "/"
	res.redirect(303, to)
}))

function* waitForMobileIdAuthentication(t, authentication, sessionId) {
	try {
		var authCertAndHash, err

		for (
			var started = new Date;
			authCertAndHash == null && new Date - started < 120 * 1000;
		) authCertAndHash = yield mobileId.waitForAuthentication(sessionId, 30)
		if (authCertAndHash == null) throw new MobileIdError("TIMEOUT")

		var [cert, signature] = authCertAndHash
		var [country, personalId] = getCertificatePersonalId(cert)
		if (err = validateCertificate(t, cert)) throw err

		if (
			authentication.country != country ||
			authentication.personal_id != personalId
		) throw new HttpError(409, "Authentication Certificate Doesn't Match")

		yield authenticationsDb.update(authentication, {
			certificate: cert,
			updated_at: new Date
		})

		if (!cert.hasSigned(authentication.token, signature))
			throw new MobileIdError("INVALID_SIGNATURE")

		yield authenticationsDb.update(authentication, {
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

		yield authenticationsDb.update(authentication, {
			error: ex,
			updated_at: new Date
		})
	}
}

function* waitForSmartIdAuthentication(t, authentication, session) {
	try {
		var authCertAndSignature, err

		for (
			var started = new Date;
			authCertAndSignature == null && new Date - started < 120 * 1000;
		) authCertAndSignature = yield smartId.wait(session, 30)
		if (authCertAndSignature == null) throw new SmartIdError("TIMEOUT")

		var [cert, signature] = authCertAndSignature
		if (err = validateCertificate(t, cert)) throw err

		var [country, personalId] = getCertificatePersonalId(cert)

		if (
			authentication.country != country ||
			authentication.personal_id != personalId
		) throw new HttpError(409, "Authentication Certificate Doesn't Match")

		yield authenticationsDb.update(authentication, {
			certificate: cert,
			updated_at: new Date
		})

		if (!cert.hasSigned(authentication.token, signature))
			throw new SmartIdError("INVALID_SIGNATURE")

		yield authenticationsDb.update(authentication, {
			authenticated: true,
			updated_at: new Date
		})
	}
	catch (ex) {
		if (!(
			ex instanceof HttpError ||
			ex instanceof SmartIdError && ex.code in SMART_ID_ERRORS
		)) reportError(ex)

		yield authenticationsDb.update(authentication, {
			error: ex,
			updated_at: new Date
		})
	}
}

function* readOrCreateUser(auth, lang) {
	var user = yield usersDb.read(sql`
		SELECT * FROM users
		WHERE country = ${auth.country}
		AND personal_id = ${auth.personal_id}
	`)

	if (user) return user
	if (auth.country != "EE") throw new HttpError(501, "Estonian Users Only")

	// CitizenOS will have created user accounts for everyone that ever signed:
	// https://github.com/citizenos/citizenos-api/blob/fd5a433acb4335a8018b732dfe54aa39fdd962f3/routes/api/topic.js#L6044
	// Reuse their UUIDs to not create duplicates.
	//
	// No need to check for Smart-Id connectionIds as Smart-Id wasn't ever
	// enabled on Rahvaalgatus through CitizenOS.
	var citizenUser = yield cosDb.query(sql`
		SELECT "user".*
		FROM "Users" AS "user"
		JOIN "UserConnections" AS conn ON conn."userId" = "user".id
		WHERE conn."connectionId" = 'esteid'
		AND conn."connectionUserId" = ${auth.personal_id}
	`).then(_.first)

	if (citizenUser == null) {
		citizenUser = yield cosDb("Users").insert({
			id: _.serializeUuid(_.uuidV4()),
			emailVerificationCode: _.serializeUuid(_.uuidV4()),
			createdAt: new Date,
			updatedAt: new Date,
			language: lang,
			source: "citizenos"
		}).returning("*").then(_.first)

		yield cosDb("UserConnections").insert({
			userId: citizenUser.id,
			connectionId: "esteid",
			connectionUserId: auth.personal_id,
			createdAt: new Date,
			updatedAt: new Date
		})
	}

	var officialName = getCertificatePersonName(auth.certificate)

	return yield usersDb.create({
		uuid: _.parseUuid(citizenUser.id),
		country: auth.country,
		personal_id: auth.personal_id,
		name: citizenUser.name || officialName,
		official_name: officialName,
		created_at: citizenUser.createdAt,
		updated_at: citizenUser.updatedAt,

		email: citizenUser.emailIsVerified ? citizenUser.email : null,
		unconfirmed_email: citizenUser.emailIsVerified ? null : citizenUser.email,
		email_confirmed_at: citizenUser.emailIsVerified ? new Date(0) : null,

		email_confirmation_token: !citizenUser.emailIsVerified && citizenUser.email
			? Crypto.randomBytes(12)
			: null,

		// Don't use CitizenOS language as that often defaulted to English.
		language: lang
	})
}

function hasSignatureType(req) {
	return req.contentType && (
		req.contentType.match("application/pkix-cert") ||
		req.contentType.match("application/vnd.rahvaalgatus.signature")
	)
}

function getAuthenticationMethod(req) {
	var type = req.contentType.name

	return (
		type == "application/x-www-form-urlencoded" ? req.body.method
		: type == "application/pkix-cert" ? "id-card"
		: type == "application/vnd.rahvaalgatus.signature" ? "id-card"
		: null
	)
}

function referTo(req, referrer, fallback) {
	return referrer && Url.parse(referrer).hostname === req.hostname
		? referrer
		: fallback
}
