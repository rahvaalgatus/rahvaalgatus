var _ = require("root/lib/underscore")
var Path = require("path")
var Router = require("express").Router
var Initiative = require("root/lib/initiative")
var HttpError = require("standard-http-error")
var Sqlite = require("root/lib/sqlite")
var Http = require("root/lib/http")
var InitiativesController = require("../initiatives_controller")
var subscriptionsDb = require("root/db/initiative_subscriptions_db")
var next = require("co-next")
var randomHex = require("root/lib/crypto").randomHex
var sql = require("sqlate")
var sendEmail = require("root").sendEmail
var renderEmail = require("root/lib/i18n").email
var parseSubscription =
	require("root/controllers/subscriptions_controller").parse

exports.router = Router({mergeParams: true})

exports.router.use("/", function(req, _res, next) {
	var initiative = req.initiative

	if (!Initiative.isPublic(initiative))
		next(new HttpError(403, "Initiative Not Public"))
	else
		next()
})

exports.router.post("/", next(function*(req, res) {
	var initiative = req.initiative
	var email = req.body.email

	if (!_.isValidEmail(email))
		return void res.status(422).render("form_error_page.jsx", {
			errors: [req.t("INVALID_EMAIL")]
		})

	var subscription
	try {
		subscription = yield subscriptionsDb.create({
			initiative_uuid: initiative.id,
			email: email,
			confirmation_token: randomHex(8),
			created_at: new Date,
			created_ip: req.ip,
			updated_at: new Date
		})
	}
	catch (ex) {
		if (Sqlite.isUniqueError(ex))
			subscription = yield subscriptionsDb.read(sql`
				SELECT * FROM initiative_subscriptions
				WHERE (initiative_uuid, email) = (${initiative.id}, ${email})
			`)

		else throw ex
	}

	if (
		subscription.confirmation_sent_at == null ||
		new Date - subscription.confirmation_sent_at >= 3600 * 1000
	) {
		var initiativeUrl = Http.link(req, Path.dirname(req.baseUrl))
		var subscriptionsUrl = Http.link(req, req.baseUrl)

		if (subscription.confirmed_at) {
			yield sendEmail({
				to: email,

				subject: req.t("ALREADY_SUBSCRIBED_TO_INITIATIVE_TITLE", {
					initiativeTitle: initiative.title
				}),

				text: renderEmail(req.lang, "ALREADY_SUBSCRIBED_TO_INITIATIVE_BODY", {
					url: subscriptionsUrl + "/" + subscription.update_token,
					initiativeTitle: initiative.title,
					initiativeUrl: initiativeUrl
				})
			})
		}
		else {
			var token = subscription.confirmation_token

			yield sendEmail({
				to: email,

				subject: req.t("CONFIRM_INITIATIVE_SUBSCRIPTION_TITLE", {
					initiativeTitle: initiative.title
				}),

				text: renderEmail(req.lang, "CONFIRM_INITIATIVE_SUBSCRIPTION_BODY", {
					url: subscriptionsUrl + "/new?confirmation_token=" + token,
					initiativeTitle: initiative.title,
					initiativeUrl: initiativeUrl
				})
			})
		}

		yield subscriptionsDb.update(subscription, {
			confirmation_sent_at: new Date,
			updated_at: new Date
		})
	}

	res.flash("notice", req.t("CONFIRM_INITIATIVE_SUBSCRIPTION"))
	res.redirect(303, Path.dirname(req.baseUrl))
}))

exports.router.get("/new", next(function*(req, res, next) {
	var initiative = req.initiative

	var subscription = yield subscriptionsDb.read(sql`
		SELECT * FROM initiative_subscriptions
		WHERE initiative_uuid = ${initiative.id}
		AND confirmation_token = ${req.query.confirmation_token}
		LIMIT 1
	`)

	if (subscription) {
		if (!subscription.confirmed_at)
			yield subscriptionsDb.update(subscription, {
				confirmed_at: new Date,
				confirmation_sent_at: null,
				updated_at: new Date
			})
		
		res.flash("notice", req.t("CONFIRMED_INITIATIVE_SUBSCRIPTION"))
		res.redirect(303, Path.dirname(req.baseUrl))
	}
	else {
		res.statusCode = 404
		res.statusMessage = "Invalid Confirmation Token"
		res.flash("error",
			req.t("INVALID_INITIATIVE_SUBSCRIPTION_CONFIRMATION_TOKEN"))

		InitiativesController.read(req, res, next)
	}
}))

exports.router.use("/:token", next(function*(req, res, next) {
	req.subscription = yield subscriptionsDb.read(sql`
		SELECT * FROM initiative_subscriptions
		WHERE initiative_uuid = ${req.initiative.id}
		AND update_token = ${req.params.token}
		LIMIT 1
	`)

	if (req.subscription) return void next()

	res.statusCode = 404

	return void res.render("error_page.jsx", {
		title: req.t("SUBSCRIPTION_NOT_FOUND_TITLE"),
		body: req.t("SUBSCRIPTION_NOT_FOUND_BODY")
	})
}))

exports.router.get("/:token", function(req, res) {
	res.render("initiatives/subscriptions/read_page.jsx", {
		subscription: req.subscription
	})
})

exports.router.put("/:token", next(function*(req, res) {
	yield subscriptionsDb.update(req.subscription, {
		__proto__: parseSubscription(req.body),
		updated_at: new Date
	})

	res.flash("notice", req.t("INITIATIVE_SUBSCRIPTION_UPDATED"))
	res.redirect(303, req.baseUrl + req.url)
}))

exports.router.delete("/:token", next(function*(req, res) {
	var initiative = req.initiative
	var subscription = req.subscription

	yield subscriptionsDb.execute(sql`
		DELETE FROM initiative_subscriptions
		WHERE initiative_uuid = ${initiative.id}
		AND update_token = ${subscription.update_token}
	`)

	res.flash("notice", req.t("INITIATIVE_SUBSCRIPTION_DELETED"))
	res.redirect(303, Path.dirname(req.baseUrl))
}))
