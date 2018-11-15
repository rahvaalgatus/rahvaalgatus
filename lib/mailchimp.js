var Config = require("root/config")
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
