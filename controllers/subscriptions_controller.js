var _ = require("root/lib/underscore")
var Http = require("root/lib/http")
var Router = require("express").Router
var Sqlite = require("root/lib/sqlite")
var next = require("co-next")
var Config = require("root/config")
var randomHex = require("root/lib/crypto").randomHex
var sendEmail = require("root").sendEmail
var db = require("root/db/initiative_subscriptions_db")
var sql = require("sqlate")

exports.router = Router({mergeParams: true})

exports.router.post("/", next(function*(req, res) {
	var email = req.body.email

	if (!_.isValidEmail(email)) return void res.status(422).render("422", {
		errors: [req.t("INVALID_EMAIL")]
	})

	var subscription
	try {
		subscription = yield db.create({
			email: email,
			confirmation_token: randomHex(8),
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

	if (!subscription.confirmed_at && !subscription.confirmation_sent_at) {
		var token = subscription.confirmation_token

		yield sendEmail({
			to: email,

			subject: req.t("CONFIRM_INITIATIVES_SUBSCRIPTION_TITLE"),

			text: req.t("CONFIRM_INITIATIVES_SUBSCRIPTION_BODY", {
				url: Http.link(req, req.baseUrl + "/new?confirmation_token=" + token),
				siteUrl: Config.url
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
		AND confirmation_token = ${req.query.confirmation_token}
		LIMIT 1
	`)

	if (subscription) {
		if (!subscription.confirmed_at)
			yield db.update(subscription, {
				confirmed_at: new Date,
				confirmation_sent_at: null,
				updated_at: new Date
			})
		
		res.flash("notice", req.t("CONFIRMED_INITIATIVES_SUBSCRIPTION"))
		res.redirect(303, "/")
	}
	else {
		res.statusCode = 404
		res.statusMessage = "Invalid Confirmation Token"

		res.render("404_page.jsx", {
			body: req.t("INVALID_INITIATIVES_SUBSCRIPTION_CONFIRMATION_TOKEN")
		})
	}
}))
