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
var ResponseTypeMiddeware =
	require("root/lib/middleware/response_type_middleware")
var co = require("co")
var next = require("co-next")
var mobileId = require("root").mobileId
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
var {MOBILE_ID_ERROR_STATUS_CODES} = require("root/lib/mobile_id")
var SESSION_COOKIE_NAME = Config.sessionCookieName
var ENV = process.env.ENV
var {MOBILE_ID_ERROR_STATUS_MESSAGES} = require("root/lib/mobile_id")
var {MOBILE_ID_ERROR_TEXTS} = require("root/lib/mobile_id")

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

	var cert, err, country, personalId, authentication, authUrl
	var method = getAuthenticationMethod(req)

	var referrer = req.headers.referer
	if (referrer && Url.parse(referrer).pathname.startsWith(req.baseUrl))
		referrer = null

	switch (method) {
		case "id-card":
			cert = Certificate.parse(req.body)
			if (err = validateCertificate(req.t, cert)) throw err
			;[country, personalId] = getCertificatePersonalId(cert)

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

			authentication = yield authenticationsDb.create({
				country: country,
				personal_id: personalId,
				method: "mobile-id",
				token: Crypto.randomBytes(16),
				created_ip: req.ip,
				created_user_agent: req.headers["user-agent"]
			})

			var tokenHash = sha256(authentication.token)
			var sessionId = yield mobileId.authenticate(
				phoneNumber,
				req.body.personalId,
				tokenHash
			)

			co(waitForMobileIdAuthentication(authentication, sessionId))

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
				var end = Date.now() + 120 * 1000;
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
				var err = authentication.error

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
			else if (!authentication.authenticated)
				res.flash("error", req.t("MOBILE_ID_ERROR_TIMEOUT"))
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
		res.statusCode = MOBILE_ID_ERROR_STATUS_CODES[code] || 500
		res.statusMessage = MOBILE_ID_ERROR_STATUS_MESSAGES[code]

		if (res.statusCode >= 500) throw new HttpError(
			500,
			res.statusMessage || "Unknown Mobile-Id Error",
			{error: err}
		)

		res.render("sessions/creating_page.jsx", {
			error: req.t(MOBILE_ID_ERROR_TEXTS[code]) || err.message
		})
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

function* waitForMobileIdAuthentication(authentication, sessionId) {
	try {
		var authCertAndHash

		for (
			var started = new Date;
			authCertAndHash == null && new Date - started < 120 * 1000;
		) authCertAndHash = yield mobileId.waitForAuthentication(sessionId, 30)
		if (authCertAndHash == null) throw new MobileIdError("TIMEOUT")

		// TODO: Compare authentication's country and personalId to the
		// authentication certificates details.
		var [cert, signature] = authCertAndHash

		if (!cert.hasSigned(authentication.token, signature))
			throw new MobileIdError("INVALID_SIGNATURE")

		yield authenticationsDb.update(authentication, {
			authenticated: true,
			certificate: cert,
			updated_at: new Date
		})
	}
	catch (ex) {
		if (!(
			ex instanceof MobileIdError &&
			MOBILE_ID_ERROR_STATUS_CODES[getNormalizedMobileIdErrorCode(ex)] < 500
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