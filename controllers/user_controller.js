var _ = require("root/lib/underscore")
var Url = require("url")
var Config = require("root/config")
var Router = require("express").Router
var Crypto = require("crypto")
var HttpError = require("standard-http-error")
var SqliteError = require("root/lib/sqlite_error")
var sql = require("sqlate")
var usersDb = require("root/db/users_db")
var coauthorsDb = require("root/db/initiative_coauthors_db")
var initiativesDb = require("root/db/initiatives_db")
var signaturesDb = require("root/db/initiative_signatures_db")
var subscriptionsDb = require("root/db/initiative_subscriptions_db")
var {constantTimeEqual} = require("root/lib/crypto")
var next = require("co-next")
var sendEmail = require("root").sendEmail
var renderEmail = require("root/lib/i18n").email
var canonicalizeUrl = require("root/lib/middleware/canonical_site_middleware")
var {updateSubscriptions} = require("./subscriptions_controller")
var EMPTY_OBJ = Object.create(null)
var LANGS = require("root/lib/i18n").STRINGS
var EMPTY_ARR = Array.prototype

exports.router = Router({mergeParams: true})

exports.router.put("/", function(req, res, next) {
	if (req.user) return void next()

	var lang = req.body.language
	if (lang in LANGS) setLanguageCookie(req, res, lang)
	res.redirect(303, req.headers.referer || "/")
})

exports.router.get("/", canonicalizeUrl)

exports.router.use(function(req, _res, next) {
	if (req.user == null) throw new HttpError(401)
	next()
})

exports.router.get("/", next(read))

exports.router.put("/", next(function*(req, res) {
	var user = req.user
	var [attrs, errors] = parseUser(req.body)

	if (errors) {
		res.statusCode = 422
		res.statusMessage = "Invalid Attributes"
		res.locals.userAttrs = attrs
		res.locals.userErrors = errors
		yield read(req, res)
		return
	}

	if (attrs.unconfirmed_email === null) {
		attrs.email = null
		attrs.email_confirmed_at = null
		attrs.unconfirmed_email = null
		attrs.email_confirmation_token = null
		attrs.email_confirmation_sent_at = null
	}
	else if (attrs.unconfirmed_email && user.email == attrs.unconfirmed_email) {
		attrs.unconfirmed_email = null
		attrs.email_confirmation_token = null
	}
	else if (
		attrs.unconfirmed_email &&
		user.unconfirmed_email != attrs.unconfirmed_email ||

		user.unconfirmed_email && attrs.email_confirmation_sent_at === null && (
			user.email_confirmation_sent_at == null ||
			new Date - user.email_confirmation_sent_at >= 10 * 60 * 1000
		)
	) {
		var email = attrs.unconfirmed_email || user.unconfirmed_email

		var token
		if (user.unconfirmed_email == email) token = user.email_confirmation_token
		else token = attrs.email_confirmation_token = Crypto.randomBytes(12)

		var url = Config.url + req.baseUrl + "/email"
		url += "?confirmation-token=" + token.toString("hex")

		yield sendEmail({
			to: email,
			subject: req.t("CONFIRM_EMAIL_SUBJECT"),
			text: renderEmail(req.lang, "CONFIRM_EMAIL_BODY", {url: url})
		})

		attrs.email_confirmation_sent_at = new Date
	}
	else if (attrs.email_confirmation_sent_at === null) {
		delete attrs.email_confirmation_sent_at
	}

	if (!_.isEmpty(attrs)) {
		yield usersDb.update(user, _.assign(attrs, {updated_at: new Date}))
	}

	var to = Url.parse(req.headers.referer || req.baseUrl).pathname

	if (attrs.email_confirmation_sent_at)
		res.flash("notice", req.t("USER_UPDATED_WITH_EMAIL"))
	else if (to == req.baseUrl)
		res.flash("notice", req.t("USER_UPDATED"))

	if (attrs.language) setLanguageCookie(req, res, attrs.language)

	res.redirect(303, req.headers.referer || req.baseUrl)
}))

exports.router.get("/signatures", next(function*(req, res) {
	var user = req.user

	var signatures = yield signaturesDb.search(sql`
		WITH signatures AS (
			SELECT initiative_uuid, country, personal_id, created_at, token
			FROM initiative_signatures
			WHERE country = ${user.country}
			AND personal_id = ${user.personal_id}
			AND NOT hidden

			UNION
			SELECT initiative_uuid, country, personal_id, created_at, NULL AS token
			FROM initiative_citizenos_signatures
			WHERE country = ${user.country}
			AND personal_id = ${user.personal_id}
		)

		SELECT signature.*, initiative.title AS initiative_title
		FROM signatures AS signature
		JOIN initiatives AS initiative
		ON initiative.uuid = signature.initiative_uuid
		ORDER BY signature.created_at DESC
	`)

	res.render("user/signatures_page.jsx", {
		user: user,
		signatures: signatures
	})
}))

exports.router.use("/subscriptions", next(function*(req, _res, next) {
	var user = req.user

	req.subscriptions = user.email ? (yield subscriptionsDb.search(sql`
		SELECT subscription.*, initiative.title AS initiative_title
		FROM initiative_subscriptions AS subscription
		LEFT JOIN initiatives AS initiative
		ON initiative.uuid = subscription.initiative_uuid
		WHERE subscription.email = ${user.email}
		AND subscription.confirmed_at IS NOT NULL
		ORDER BY COALESCE(subscription.initiative_uuid, 0)
	`)) : EMPTY_ARR

	next()
}))

exports.router.get("/subscriptions", function(req, res) {
	var user = req.user
	var subscriptions = req.subscriptions

	res.render("user/subscriptions_page.jsx", {
		user: user,
		subscriptions: subscriptions
	})
})

exports.router.put("/subscriptions", next(function*(req, res) {
	var user = req.user
	if (user.email == null) throw new HttpError(403, "Email Unconfirmed")

	yield updateSubscriptions(req.subscriptions, req.body)
	res.flash("notice", req.t("INITIATIVE_SUBSCRIPTIONS_UPDATED"))
	res.redirect(303, req.baseUrl + req.path)
}))

exports.router.delete("/subscriptions", next(function*(req, res) {
	var user = req.user
	if (user.email == null) throw new HttpError(403, "Email Unconfirmed")

	yield subscriptionsDb.execute(sql`
		DELETE FROM initiative_subscriptions
		WHERE email = ${user.email}
		AND confirmed_at IS NOT NULL
	`)

	res.flash("notice", req.t("INITIATIVES_SUBSCRIPTION_DELETED"))
	res.redirect(303, req.baseUrl + req.path)
}))

exports.router.get("/email", next(function*(req, res) {
	var user = req.user

	var token = req.query["confirmation-token"]
	if (token == null) throw new HttpError(404, "Confirmation Token Missing", {
		description: req.t("USER_EMAIL_CONFIRMATION_TOKEN_MISSING")
	})

	if (user.unconfirmed_email == null) {
		res.flash("notice", req.t("USER_EMAIL_ALREADY_CONFIRMED"))
		res.redirect(303, req.baseUrl)
		return
	}

	token = Buffer.from(token, "hex")

	if (!constantTimeEqual(user.email_confirmation_token, token))
		throw new HttpError(404, "Confirmation Token Invalid", {
			description: req.t("USER_EMAIL_CONFIRMATION_TOKEN_INVALID")
		})

	try {
		yield usersDb.update(user, {
			email: user.unconfirmed_email,
			email_confirmed_at: new Date,
			unconfirmed_email: null,
			email_confirmation_token: null,
			updated_at: new Date
		})
	}
	catch (ex) {
		if (
			ex instanceof SqliteError &&
			ex.code == "constraint" &&
			ex.type == "unique" &&
			_.deepEquals(ex.columns, ["email"])
		) throw new HttpError(409, "Email Already Taken", {
			description: req.t("USER_EMAIL_ALREADY_TAKEN")
		})

		throw ex
	}

	res.flash("notice", req.t("USER_EMAIL_CONFIRMED"))
	res.redirect(303, req.baseUrl)
}))

function* read(req, res) {
	var user = req.user

	var initiatives = yield initiativesDb.search(sql`
		SELECT
			initiative.*,
			user.name AS user_name,
			json_group_array(coauthor_user.name) AS coauthor_names,
			${initiativesDb.countSignatures(sql`initiative_uuid = initiative.uuid`)}
			AS signature_count

		FROM initiatives AS initiative

		LEFT JOIN users AS user ON user.id = initiative.user_id

		LEFT JOIN initiative_coauthors AS coauthor
		ON coauthor.initiative_uuid = initiative.uuid
		AND coauthor.status = 'accepted'

		LEFT JOIN users AS coauthor_user ON coauthor_user.id = coauthor.user_id

		LEFT JOIN initiative_coauthors AS user_as_coauthor
		ON user_as_coauthor.initiative_uuid = initiative.uuid
		AND user_as_coauthor.status = 'accepted'

		WHERE initiative.user_id = ${user.id}
		OR user_as_coauthor.user_id = ${user.id}

		GROUP BY initiative.uuid
	`)

	var coauthorInvitations = yield coauthorsDb.search(sql`
		SELECT
			coauthor.*,
			initiative.title AS initiative_title,
			initiative.published_at AS initiative_published_at,
			inviter.name AS inviter_name

		FROM initiative_coauthors AS coauthor
		JOIN initiatives AS initiative ON initiative.uuid = coauthor.initiative_uuid
		JOIN users AS inviter ON inviter.id = initiative.user_id

		WHERE coauthor.country = ${user.country}
		AND coauthor.personal_id = ${user.personal_id}
		AND coauthor.status = 'pending'
	`)

	res.render("user/read_page.jsx", {
		user: user,
		initiatives: initiatives,
		coauthorInvitations,
		userAttrs: _.create(user, res.locals.userAttrs),
		userErrors: res.locals.userErrors || EMPTY_OBJ
	})
}

function parseUser(obj) {
	var attrs = {}
	if ("name" in obj) attrs.name = obj.name
	if ("email" in obj) attrs.unconfirmed_email = obj.email || null
	if ("language" in obj && obj.language in LANGS) attrs.language = obj.language

	if ("email_confirmation_sent_at" in obj)
		attrs.email_confirmation_sent_at = obj.email_confirmation_sent_at || null

	var errors = {}

	if ("name" in attrs && !attrs.name)
		errors.name = {code: "length", minimum: 1}

	if (
		"unconfirmed_email" in attrs &&
		attrs.unconfirmed_email != null &&
		!_.isValidEmail(attrs.unconfirmed_email)
	) errors.unconfirmed_email = {code: "format", format: "email"}

	if (
		"email_confirmation_sent_at" in attrs &&
		attrs.email_confirmation_sent_at !== null
	) errors.email_confirmation_sent_at = {code: "type", type: "null"}

	return [attrs, _.isEmpty(errors) ? null : errors]
}

function setLanguageCookie(req, res, lang) {
	res.cookie("language", lang, {
		httpOnly: true,
		secure: req.secure,
		maxAge: 365 * 86400 * 1000
	})
}
