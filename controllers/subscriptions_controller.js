var _ = require("root/lib/underscore")
var Http = require("root/lib/http")
var Router = require("express").Router
var Sqlite = require("root/lib/sqlite")
var sendEmail = require("root").sendEmail
var renderEmail = require("root/lib/i18n").email
var next = require("co-next")
var db = require("root/db/initiative_subscriptions_db")
var sql = require("sqlate")
exports.parse = parse

exports.router = Router({mergeParams: true})

exports.router.post("/", next(function*(req, res) {
	var email = req.body.email

	if (!_.isValidEmail(email))
		return void res.status(422).render("form_error_page.jsx", {
			errors: [req.t("INVALID_EMAIL")]
		})

	var subscription
	try {
		subscription = yield db.create({
			email: email,
			created_at: new Date,
			created_ip: req.ip,
			updated_at: new Date
		})
	}
	catch (ex) {
		if (Sqlite.isUniqueError(ex))
			subscription = yield db.read(sql`
				SELECT * FROM initiative_subscriptions
				WHERE initiative_uuid IS NULL AND email = ${email}
			`)

		else throw ex
	}

	if (
		subscription.confirmation_sent_at == null ||
		new Date - subscription.confirmation_sent_at >= 3600 * 1000
	) {
		var token = subscription.update_token

		if (subscription.confirmed_at) {
			yield sendEmail({
				to: email,
				subject: req.t("ALREADY_SUBSCRIBED_TO_INITIATIVES_TITLE"),
				text: renderEmail(req.lang, "ALREADY_SUBSCRIBED_TO_INITIATIVES_BODY", {
					url: Http.link(req, req.baseUrl + "/" + token)
				})
			})
		}
		else yield sendEmail({
			to: email,
			subject: req.t("CONFIRM_INITIATIVES_SUBSCRIPTION_TITLE"),
			text: renderEmail(req.lang, "CONFIRM_INITIATIVES_SUBSCRIPTION_BODY", {
				url: Http.link(req, req.baseUrl + "/new?confirmation_token=" + token)
			})
		})

		yield db.update(subscription, {
			confirmation_sent_at: new Date,
			updated_at: new Date
		})
	}

	res.flash("notice", req.t("CONFIRM_INITIATIVES_SUBSCRIPTION"))
	res.redirect(303, "/")
}))

exports.router.get("/new", next(function*(req, res) {
	var subscription = yield db.read(sql`
		SELECT * FROM initiative_subscriptions
		WHERE initiative_uuid IS NULL
		AND update_token = ${req.query.confirmation_token}
		LIMIT 1
	`)

	if (subscription) {
		if (!subscription.confirmed_at)
			yield db.update(subscription, {
				confirmed_at: new Date,
				updated_at: new Date
			})
		
		res.flash("notice", req.t("CONFIRMED_INITIATIVES_SUBSCRIPTION"))
		res.redirect(303, "/")
	}
	else {
		res.statusCode = 404
		res.statusMessage = "Invalid Confirmation Token"

		res.render("error_page.jsx", {
			body: req.t("INVALID_INITIATIVES_SUBSCRIPTION_CONFIRMATION_TOKEN")
		})
	}
}))

exports.router.use("/:token", next(function*(req, res, next) {
	req.subscription = yield db.read(sql`
		SELECT * FROM initiative_subscriptions
		WHERE initiative_uuid IS NULL
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
	res.render("subscriptions/read_page.jsx", {subscription: req.subscription})
})

exports.router.put("/:token", next(function*(req, res) {
	yield db.update(req.subscription, {
		__proto__: parse(req.body),
		updated_at: new Date
	})

	res.flash("notice", req.t("INITIATIVE_SUBSCRIPTIONS_UPDATED"))
	res.redirect(303, req.baseUrl + req.url)
}))

exports.router.delete("/:token", next(function*(req, res) {
	var subscription = req.subscription

	yield db.execute(sql`
		DELETE FROM initiative_subscriptions
		WHERE initiative_uuid IS NULL
		AND update_token = ${subscription.update_token}
	`)

	res.flash("notice", req.t("INITIATIVES_SUBSCRIPTION_DELETED"))
	res.redirect(303, "/")
}))

function parse(obj) {
	var attrs = {}

	if ("official_interest" in obj)
		attrs.official_interest = _.parseBoolean(obj.official_interest)
	if ("author_interest" in obj)
		attrs.author_interest = _.parseBoolean(obj.author_interest)

	return attrs
}
