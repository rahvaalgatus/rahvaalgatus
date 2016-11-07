var Config = require("root/config")
var VOTES_REQUIRED = Config.votesRequired

exports.hasEnded = function(initiative) {
	return new Date(initiative.endsAt) <= Date.now()
}

exports.isSuccessful = function(initiative) {
	return exports.countSignatures(initiative, "Yes") >= VOTES_REQUIRED
}

exports.countSignatures = function(initiative, value) {
	var row = initiative.vote.options.rows.find((row) => row.value === value)
	return row && row.voteCount || 0
}
