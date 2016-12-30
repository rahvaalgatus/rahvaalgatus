var O = require("oolong")
var Https = require("https")
var Config = require("root/config")
var request = require("./fetch")

request = require("fetch-defaults")(request, Config.apiUrl, {
	headers: {Accept: "application/json"},

	agent: process.env.ENV === "test" ? null : new Https.Agent({
		keepAlive: true,
		keepAliveMsecs: 10000,
		maxSockets: 30
	}),
})

request = require("fetch-parse")(request, {json: true, "text/html": true})
request = require("fetch-throw")(request)
request = require("./fetch/fetch_nodeify")(request)
exports = module.exports = request

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
