var Config = require("root/config")
var VOTES_REQUIRED = Config.votesRequired

exports.hasDiscussionEnded = function(initiative) {
	return new Date(initiative.endsAt) <= Date.now()
}

exports.hasVoteEnded = function(initiative) {
	return new Date(initiative.vote.endsAt) <= Date.now()
}

exports.isSuccessful = function(initiative) {
	return exports.countSignatures("Yes", initiative) >= VOTES_REQUIRED
}

exports.countSignatures = function(value, initiative) {
	var option = initiative.vote.options.rows.find((opt) => opt.value === value)
	return option && option.voteCount || 0
}

exports.findOptionId = function(value, initiative) {
	var option = initiative.vote.options.rows.find((opt) => opt.value === value)
	return option && option.id || null
}
