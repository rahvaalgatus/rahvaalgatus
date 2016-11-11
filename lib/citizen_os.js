var Https = require("https")
var Config = require("root/config")
var defaults = require("fetch-defaults")
var parseify = require("./request/request_parseify")
var throwify = require("fetch-throw")
var nodeify = require("./request/request_nodeify")

var agent = new Https.Agent({
	keepAlive: true,
	keepAliveMsecs: 10000,
	maxSockets: 30
})

var request = require("./fetch")
request = defaults(request, Config.apiUrl, {agent: agent})
request = parseify(request)
request = throwify(request)
request = nodeify(request)
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
