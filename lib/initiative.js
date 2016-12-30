var Config = require("root/config")
var DateFns = require("date-fns")
var VOTES_REQUIRED = Config.votesRequired

exports.can = function(perm, initiative) {
	return initiative.permission.level == perm
}

exports.hasDiscussionEnded = function(initiative) {
	return new Date(initiative.endsAt) <= Date.now()
}

exports.hasVoteEnded = function(initiative) {
	return new Date(initiative.vote.endsAt) <= Date.now()
}

exports.isSuccessful = function(initiative) {
	return exports.countSignatures("Yes", initiative) >= VOTES_REQUIRED
}

exports.isEditable = function(initiative) {
	return (
		initiative.status == "inProgress" &&
		(exports.can("admin", initiative) || exports.can("edit", initiative))
	)
}

exports.isPublishable = function(initiative) {
	return (
		initiative.status == "inProgress" &&
		initiative.visibility == "private" &&
		exports.can("admin", initiative)
	)
}

exports.isSignable = function(initiative) {
	return initiative.status == "voting"
}

exports.isParliamentable = function(initiative) {
	return (
		initiative.status == "voting" &&
		exports.can("admin", initiative) &&
		exports.isSuccessful(initiative)
	)
}

exports.countSignatures = function(value, initiative) {
	var option = initiative.vote.options.rows.find((opt) => opt.value === value)
	return option && option.voteCount || 0
}

exports.findOptionId = function(value, initiative) {
	var option = initiative.vote.options.rows.find((opt) => opt.value === value)
	return option && option.id || null
}

exports.isDeadlineOk = function(now, deadline) {
	var today = DateFns.startOfDay(now)
	var min = DateFns.addDays(today, 3)
	var max = DateFns.addDays(today, 366)
	return min <= deadline && deadline < max
}
