var _ = require("root/lib/underscore")
var Path = require("path")
var {Router} = require("express")
var Http = require("root/lib/http")
var HttpError = require("standard-http-error")
var InitiativesController = require("../initiatives_controller")
var SqliteError = require("root/lib/sqlite_error")
var subscriptionsDb = require("root/db/initiative_subscriptions_db")
var next = require("co-next")
var sql = require("sqlate")
var {sendEmail} = require("root")
var {rateLimit} = require("root/controllers/subscriptions_controller")
var renderEmail = require("root/lib/i18n").email

exports.router = Router({mergeParams: true})

exports.router.post("/", rateLimit, next(function*(req, res) {
	if (req.body["e-mail"]) throw new HttpError(403, "Suspicion of Automation")

	var {user} = req
	var {initiative} = req
	var {email} = req.body

	if (!_.isValidEmail(email))
		return void res.status(422).render("form_error_page.jsx", {
			errors: [req.t("INVALID_EMAIL")]
		})

	var subscription
	try {
		// Not subscribing to comments by default as we presume people want to
		// follow the initiative's progress rather than comments. Some popular or
		// controversial initiatives have had a lot of comment activity that
		// doesn't seem to interest most followers, as can be seen from
		// unsubscriptions or explicit subscription tweaking following comment
		// surges.
		subscription = subscriptionsDb.create({
			initiative_uuid: initiative.uuid,
			email: email,
			created_at: new Date,
			created_ip: req.ip,
			updated_at: new Date,
			event_interest: true
		})
	}
	catch (err) {
		if (err instanceof SqliteError && err.type == "unique")
			subscription = subscriptionsDb.read(sql`
				SELECT * FROM initiative_subscriptions
				WHERE (initiative_uuid, email) = (${initiative.uuid}, ${email})
			`)

		else throw err
	}

	if (
		user &&
		user.email &&
		_.caseInsensitiveEquals(user.email, subscription.email)
	) {
		subscriptionsDb.update(subscription, {
			confirmed_at: subscription.confirmed_at || new Date,
			event_interest: true,
			updated_at: new Date
		})

		res.flash("notice", req.t("CONFIRMED_INITIATIVE_SUBSCRIPTION"))
	}
	else if (
		subscription.confirmation_sent_at == null ||
		new Date - subscription.confirmation_sent_at >= 3600 * 1000
	) {
		var initiativeUrl = Http.link(req, Path.dirname(req.baseUrl))
		var subscriptionsUrl = Http.link(req, req.baseUrl)
		var token = subscription.update_token

		if (subscription.confirmed_at) {
			yield sendEmail({
				to: email,

				subject: req.t("ALREADY_SUBSCRIBED_TO_INITIATIVE_TITLE", {
					initiativeTitle: initiative.title
				}),

				text: renderEmail(req.lang, "ALREADY_SUBSCRIBED_TO_INITIATIVE_BODY", {
					url: subscriptionsUrl + "/" + token,
					initiativeTitle: initiative.title,
					initiativeUrl: initiativeUrl
				})
			})
		}
		else yield sendEmail({
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

		subscriptionsDb.update(subscription, {confirmation_sent_at: new Date})
		res.flash("notice", req.t("CONFIRM_INITIATIVE_SUBSCRIPTION"))
	}
	else res.flash("notice", req.t("CONFIRM_INITIATIVE_SUBSCRIPTION"))

	res.statusMessage = "Subscribing"
	res.redirect(303, Path.dirname(req.baseUrl))
}))

exports.router.get("/new", function(req, res, next) {
	var {initiative} = req

	var subscription = subscriptionsDb.read(sql`
		SELECT * FROM initiative_subscriptions
		WHERE initiative_uuid = ${initiative.uuid}
		AND update_token = ${req.query.confirmation_token}
		LIMIT 1
	`)

	if (subscription) {
		if (!subscription.confirmed_at)
			subscriptionsDb.update(subscription, {
				confirmed_at: new Date,
				confirmation_sent_at: null,
				updated_at: new Date
			})

		res.flash("notice", req.t("CONFIRMED_INITIATIVE_SUBSCRIPTION"))
		res.redirect(303, req.baseUrl + "/" + subscription.update_token)
	}
	else {
		res.statusCode = 404
		res.statusMessage = "Invalid Confirmation Token"
		res.flash("error",
			req.t("INVALID_INITIATIVE_SUBSCRIPTION_CONFIRMATION_TOKEN"))

		InitiativesController.read(req, res, next)
	}
})

exports.router.use("/:token", function(req, res, next) {
	var {initiative} = req

	// Cannot hash the token as it's needed for emailing, but could XOR it with
	// something secret to reduce timing leaks.
	req.subscription = subscriptionsDb.read(sql`
		SELECT * FROM initiative_subscriptions
		WHERE initiative_uuid = ${initiative.uuid}
		AND update_token = ${req.params.token.replace(/\.+$/, "")}
	`)

	if (req.subscription) return void next()

	res.statusCode = 404

	return void res.render("error_page.jsx", {
		title: req.t("SUBSCRIPTION_NOT_FOUND_TITLE"),
		body: req.t("SUBSCRIPTION_NOT_FOUND_BODY")
	})
})

exports.router.get("/:token", function(req, res) {
	var {subscription} = req
	var path = "/subscriptions"
	path += "?initiative=" + subscription.initiative_uuid
	path += "&update-token=" + subscription.update_token
	path += "#subscription-" + subscription.initiative_uuid
	res.redirect(302, path)
})
