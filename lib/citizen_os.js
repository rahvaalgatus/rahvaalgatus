var O = require("oolong")
var Https = require("https")
var Config = require("root/config")
var concat = Array.prototype.concat.bind(Array.prototype)
var request = require("./fetch")
var PARTNER_ID = Config.apiPartnerId
var PARTNER_IDS = concat(Config.apiPartnerId, O.keys(Config.partners))

request = require("fetch-defaults")(request, Config.apiUrl, {
	timeout: 10000,

	headers: {
		Accept: "application/json",
		"X-Partner-Id": PARTNER_ID
	},

	agent: process.env.ENV === "test" ? null : new Https.Agent({
		keepAlive: true,
		keepAliveMsecs: 10000,
		maxSockets: 30
	})
})

request = require("fetch-parse")(request, {json: true, "text/html": true})
request = require("fetch-throw")(request)
request = require("./fetch/fetch_nodeify")(request)
exports = module.exports = request

exports.readInitiatives =	function() {
	return {
		discussions: exports.readInitiativesWithStatus("inProgress"),
		votings: exports.readInitiativesWithStatus("voting"),
		processes: exports.readInitiativesWithStatus("followUp"),
		finished: Promise.resolve(Array.prototype)
	}
}

// If not requesting per-status, limit applies to the entire returned set.
// Saving us from pagination for now.
exports.readInitiativesWithStatus = function(status) {
	var path = "/api/topics"
	path += "?" + PARTNER_IDS.map((id) => `sourcePartnerId[]=${id}`).join("&")
	path += "&include[]=vote"
	path += "&limit=100"
	path += `&statuses=${status}`
	return exports(path).then((res) => res.body.data.rows)
}

exports.readInitiative = function(id) {
	return exports(`/api/topics/${id}?include[]=vote`).then(getBody)
}

exports.translateError = function(t, body) {
	var msg = t(keyifyError(body.status.code))
	if (msg == null && body.status.message) msg = body.status.message
	if (msg == null && body.errors) msg = O.values(body.errors).join(" ")
	return msg
}

function keyifyError(citizenCode) { return `MSG_ERROR_${citizenCode}_VOTE` }
function getBody(res) { return res.body.data }
