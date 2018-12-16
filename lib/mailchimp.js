var Config = require("root/config")
var md5 = require("root/lib/crypto").md5
var serializeAuth = require("root/lib/http").serializeAuth
var fetch = require("./fetch")
var API_KEY = Config.mailchimpApiKey
var URL = "https://" + API_KEY.match(/-(\w+)$/)[1] + ".api.mailchimp.com"

var api = require("fetch-defaults")(fetch, URL, {
	timeout: 10000,
	headers: {
		Authorization: "Basic " + serializeAuth("", API_KEY),
		Accept: "application/json"
	}
})

api = require("fetch-parse")(api, {json: true})
api = require("fetch-throw")(api)
module.exports = api
api.subscribe = subscribe
api.isMailchimpEmailError = isMailchimpEmailError

function subscribe(interestId, email, ipAddr) {
	var emailHash = md5(email.toLowerCase())

	return api(`/3.0/lists/${Config.mailchimpListId}/members/${emailHash}`, {
		method: "PUT",
		json: {
			email_address: email,
			status_if_new: "pending",
			interests: {[interestId]: true},
			ip_signup: ipAddr
		}
	})
}

function isMailchimpEmailError(err) {
	return err.code == 400 && (
		err.response.body.errors &&
		err.response.body.errors.some((e) => e.field == "email_address") ||
		/email address/.test(err.response.body.detail)
	)
}
