var O = require("oolong")
var Qs = require("qs")
var Https = require("https")
var Config = require("root/config")
var concat = Array.prototype.concat.bind(Array.prototype)
var fetch = require("./fetch")
var getRows = O.property("rows")
var PARTNER_ID = Config.apiPartnerId
var PARTNER_IDS = concat(Config.apiPartnerId, O.keys(Config.partners))

var api = require("fetch-defaults")(fetch, Config.apiUrl, {
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

api = require("fetch-parse")(api, {json: true, "text/html": true})
api = require("fetch-throw")(api)
api = require("./fetch/fetch_nodeify")(api)
exports = module.exports = api

// If not requesting per-status, limit applies to the entire returned set.
// Saving us from pagination for now.
exports.readInitiativesWithStatus = function(status) {
	return exports("/api/topics?" + querify({
		include: ["vote", "event"],
		limit: 100,
		statuses: status,
		sourcePartnerId: PARTNER_IDS,
	})).then(getBody).then(getRows)
}

exports.readInitiative = function(id) {
	var res = exports(`/api/topics/${id}?include[]=vote&include[]=event`)
	return res.then(getBody)
}

exports.translateError = function(t, body) {
	var msg = t(keyifyError(body.status.code))
	if (msg == null && body.status.message) msg = body.status.message
	if (msg == null && body.errors) msg = O.values(body.errors).join(" ")
	return msg
}

function keyifyError(citizenCode) { return `MSG_ERROR_${citizenCode}_VOTE` }
function getBody(res) { return res.body.data }
function querify(qs) { return Qs.stringify(qs, {arrayFormat: "brackets"}) }
