var O = require("oolong")
var Http = require("http")
var Https = require("https")
var Config = require("root/config")
var HttpAgent = (Config.apiUrl.match(/^https:/) ? Https : Http).Agent
var fetch = require("./fetch")
var PARTNER_ID = Config.apiPartnerId
var UA = require("root/config").userAgent

var api = require("fetch-defaults")(fetch, Config.apiUrl, {
	timeout: 10000,

	headers: {
		Accept: "application/json",
		"User-Agent": UA,
		"X-Partner-Id": PARTNER_ID
	},

	agent: process.env.ENV === "test" ? null : new HttpAgent({
		keepAlive: true,
		keepAliveMsecs: 10000,
		maxSockets: 30
	})
})

api = require("fetch-parse")(api, {json: true, "text/html": true})
api = require("fetch-throw")(api)
api = require("./fetch/fetch_nodeify")(api)
exports = module.exports = api

exports.translateError = function(t, body) {
	var msg = t(keyifyError(body.status.code))
	if (msg == null && body.status.message) msg = body.status.message
	if (msg == null && body.errors) msg = O.values(body.errors).join(" ")
	return msg
}

function keyifyError(citizenCode) { return `MSG_ERROR_${citizenCode}_VOTE` }
