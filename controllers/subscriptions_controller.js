var _ = require("root/lib/underscore")
var Qs = require("qs")
var Http = require("root/lib/http")
var {Router} = require("express")
var HttpError = require("standard-http-error")
var SqliteError = require("root/lib/sqlite_error")
var {sendEmail} = require("root")
var renderEmail = require("root/lib/i18n").email
var next = require("co-next")
var subscriptionsDb = require("root/db/initiative_subscriptions_db")
var sql = require("sqlate")
exports.router = Router({mergeParams: true})
exports.parse = parse
exports.updateSubscriptions = updateSubscriptions

var DEFAULT_INITIATIVES_INTERESTS = {
	new_interest: true,
	signable_interest: true,
	event_interest: false,
	comment_interest: false
}

var readSubscriptionFromQuery = withSubscription.bind(null, (req) => [
	req.query.initiative,
	req.query["update-token"]
])

exports.router.get("/", readSubscriptionFromQuery, function(req, res) {
	var {subscription} = req

	var subscriptions = subscriptionsDb.search(sql`
		SELECT subscription.*, initiative.title AS initiative_title
		FROM initiative_subscriptions AS subscription
		LEFT JOIN initiatives AS initiative
		ON initiative.uuid = subscription.initiative_uuid
		WHERE subscription.email = ${subscription.email}
		AND subscription.confirmed_at IS NOT NULL
		ORDER BY COALESCE(subscription.initiative_uuid, 0)
	`)

	res.render("subscriptions/index_page.jsx", {
		subscription: subscription,
		subscriptions: subscriptions
	})
})

exports.router.post("/", next(function*(req, res) {
	if (req.body["e-mail"]) throw new HttpError(403, "Suspicion of Automation")

	var {user} = req
	var {email} = req.body
	var attrs = _.defaults(parse(req.body), DEFAULT_INITIATIVES_INTERESTS)

	if (!_.isValidEmail(email))
		return void res.status(422).render("form_error_page.jsx", {
			errors: [req.t("INVALID_EMAIL")]
		})

	var subscription
	try {
		subscription = subscriptionsDb.create({
			email: email,
			new_interest: attrs.new_interest,
			signable_interest: attrs.signable_interest,
			event_interest: attrs.event_interest,
			comment_interest: attrs.comment_interest,
			created_at: new Date,
			created_ip: req.ip,
			updated_at: new Date
		})
	}
	catch (err) {
		if (err instanceof SqliteError && err.type == "unique")
			subscription = subscriptionsDb.read(sql`
				SELECT * FROM initiative_subscriptions
				WHERE initiative_uuid IS NULL AND email = ${email}
			`)

		else throw err
	}

	if (
		user &&
		user.email &&
		_.caseInsensitiveEquals(user.email, subscription.email)
	) {
		subscriptionsDb.update(subscription, {
			confirmed_at: new Date,
			new_interest: attrs.new_interest,
			signable_interest: attrs.signable_interest,
			event_interest: attrs.event_interest,
			comment_interest: attrs.comment_interest,
			updated_at: new Date
		})

		res.flash("notice", req.t("CONFIRMED_INITIATIVES_SUBSCRIPTION"))
	}
	else if (
		subscription.confirmation_sent_at == null ||
		new Date - subscription.confirmation_sent_at >= 3600 * 1000
	) {
		var token = subscription.update_token

		if (subscription.confirmed_at) {
			yield sendEmail({
				to: subscription.email,
				subject: req.t("ALREADY_SUBSCRIBED_TO_INITIATIVES_TITLE"),
				text: renderEmail(req.lang, "ALREADY_SUBSCRIBED_TO_INITIATIVES_BODY", {
					url: Http.link(req, req.baseUrl + "/" + token)
				})
			})
		}
		else yield sendEmail({
			to: subscription.email,
			subject: req.t("CONFIRM_INITIATIVES_SUBSCRIPTION_TITLE"),
			text: renderEmail(req.lang, "CONFIRM_INITIATIVES_SUBSCRIPTION_BODY", {
				url: Http.link(req, req.baseUrl + "/new?confirmation_token=" + token)
			})
		})

		subscriptionsDb.update(subscription, {confirmation_sent_at: new Date})
		res.flash("notice", req.t("CONFIRM_INITIATIVES_SUBSCRIPTION"))
	}
	else res.flash("notice", req.t("CONFIRM_INITIATIVES_SUBSCRIPTION"))

	res.redirect(303, "/")
}))

exports.router.put("/", readSubscriptionFromQuery, function(req, res) {
	var {subscription} = req

	var subscriptions = subscriptionsDb.search(sql`
		SELECT * FROM initiative_subscriptions
		WHERE email = ${subscription.email}
		AND confirmed_at IS NOT NULL
	`)

	subscriptions = updateSubscriptions(subscriptions, req.body)

	res.flash("notice", req.t("INITIATIVE_SUBSCRIPTIONS_UPDATED"))

	var to = subscriptions.find((sub) => (
		sub.initiative_uuid == subscription.initiative_uuid
	)) || subscriptions[0]

	res.redirect(303, to ? "/subscriptions?" + tokenize(to) : "/")
})

exports.router.delete("/", readSubscriptionFromQuery, function(req, res) {
	var {subscription} = req

	subscriptionsDb.execute(sql`
		DELETE FROM initiative_subscriptions
		WHERE email = ${subscription.email}
		AND confirmed_at IS NOT NULL
	`)

	res.flash("notice", req.t("INITIATIVES_SUBSCRIPTION_DELETED"))
	res.redirect(303, "/")
})

exports.router.get("/new", function(req, res) {
	var subscription = subscriptionsDb.read(sql`
		SELECT * FROM initiative_subscriptions
		WHERE initiative_uuid IS NULL
		AND update_token = ${String(req.query.confirmation_token)}
		LIMIT 1
	`)

	if (subscription) {
		if (!subscription.confirmed_at) subscriptionsDb.update(subscription, {
			confirmed_at: new Date,
			updated_at: new Date
		})

		res.flash("notice", req.t("CONFIRMED_INITIATIVES_SUBSCRIPTION"))
		res.redirect(303, req.baseUrl + "/" + subscription.update_token)
	}
	else {
		res.statusCode = 404
		res.statusMessage = "Invalid Confirmation Token"

		res.render("error_page.jsx", {
			body: req.t("INVALID_INITIATIVES_SUBSCRIPTION_CONFIRMATION_TOKEN")
		})
	}
})

exports.router.use("/:token", withSubscription.bind(null, (req) => [
	null,
	req.params.token.replace(/\.+$/, "")
]))

exports.router.get("/:token", function(req, res) {
	var {subscription} = req

	res.redirect(302, req.baseUrl + "?" + Qs.stringify({
		"update-token": subscription.update_token
	}))
})

function parse(obj) {
	var attrs = {}

	if ("delete" in obj)
		attrs.delete = _.parseBoolean(obj.delete)

	if ("new_interest" in obj)
		attrs.new_interest = _.parseBoolean(obj.new_interest)
	if ("signable_interest" in obj)
		attrs.signable_interest = _.parseBoolean(obj.signable_interest)
	if ("event_interest" in obj)
		attrs.event_interest = _.parseBoolean(obj.event_interest)
	if ("comment_interest" in obj)
		attrs.comment_interest = _.parseBoolean(obj.comment_interest)

	return attrs
}

function withSubscription(get, req, res, next) {
	var [uuid, token] = get(req)

	// Cannot hash the token as it's needed for emailing, but could XOR it with
	// something secret to reduce timing leaks.
	req.subscription = subscriptionsDb.read(sql`
		SELECT * FROM initiative_subscriptions
		WHERE initiative_uuid ${uuid ? sql`= ${uuid}` : sql`IS NULL`}
		AND update_token = ${String(token)}
		AND confirmed_at IS NOT NULL
		LIMIT 1
	`)

	if (req.subscription) return void next()

	return void res.status(404).render("error_page.jsx", {
		title: req.t("SUBSCRIPTION_NOT_FOUND_TITLE"),
		body: req.t("SUBSCRIPTION_NOT_FOUND_BODY")
	})
}

function tokenize(subscription) {
	return Qs.stringify({
		initiative: subscription.initiative_uuid || undefined,
		"update-token": subscription.update_token,
	})
}

function updateSubscriptions(subscriptions, form) {
	var attrsByInitiativeUuid = _.mapValues(_.filterValues(form, (_a, id) => (
		id == "null" || id.indexOf("-") >= 0
	)), parse)

	return subscriptions.map(function(subscription) {
		var attrs = attrsByInitiativeUuid[subscription.initiative_uuid]
		if (attrs == null) return subscription
		if (attrs.delete) return subscriptionsDb.delete(subscription), null

		if (subscription.initiative_uuid) {
			attrs.new_interest = false
			attrs.signable_interest = false
		}

		return subscriptionsDb.update(subscription, {
			__proto__: attrs,
			updated_at: new Date
		})
	}).filter(Boolean)
}
