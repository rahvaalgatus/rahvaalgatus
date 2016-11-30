var Https = require("https")
var Config = require("root/config")
var request = require("./fetch")

request = require("fetch-defaults")(request, Config.apiUrl, {
	headers: {Accept: "application/json"},

	agent: new Https.Agent({
		keepAlive: true,
		keepAliveMsecs: 10000,
		maxSockets: 30
	}),
})

request = require("fetch-parse")(request, {json: true})
request = require("fetch-throw")(request)
request = require("./fetch/fetch_nodeify")(request)
exports = module.exports = request

exports.readInitiative = function(id) {
	return exports(`/api/topics/${id}?include[]=vote`).then(function(res) {
		return res.body.data
	})
}
