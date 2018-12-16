var Router = require("express").Router
var next = require("co-next")
var Config = require("root/config")
var mailchimp = require("root/lib/mailchimp")
var INTEREST_IN_ALL_ID = Config.mailchimpInterestInAllId

exports.router = Router({mergeParams: true})

exports.router.post("/", next(function*(req, res) {
	try { yield mailchimp.subscribe(INTEREST_IN_ALL_ID, req.body.email, req.ip) }
	catch (ex) {
		if (!mailchimp.isMailchimpEmailError(ex)) throw ex

		return void res.status(422).render("422", {
			errors: [req.t("INVALID_EMAIL")]
		})
	}

	res.flash("notice", req.t("SUBSCRIBED_TO_INITIATIVES"))
	res.redirect(303, "/")
}))
