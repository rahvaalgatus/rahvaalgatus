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
	return exports(`/api/topics/${id}`).then(function(res) {
		var initiative = res.body.data

		if (initiative.vote.id) {
			var voteId = initiative.vote.id
			var vote = exports(`/api/topics/${initiative.id}/votes/${voteId}`)
			return vote.then((res) => ({__proto__: initiative, vote: res.body.data}))
		}
		else return initiative
	})
}
