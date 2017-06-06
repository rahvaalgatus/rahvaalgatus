var Config = require("root/config")
var DateFns = require("date-fns")
var VOTES_REQUIRED = Config.votesRequired
var MIN_DEADLINE_DAYS = Config.minDeadlineDays
var MAX_DEADLINE_DAYS = Config.maxDeadlineDays

exports.can = function(perm, initiative) {
	return initiative.permission.level == perm
}

exports.hasPartnerId = function(id, initiative) {
	return initiative.sourcePartnerId === id
}

exports.hasDiscussionEnded = function(now, initiative) {
	return (
		initiative.status == "closed" ||
		new Date(initiative.endsAt) <= now
	)
}

exports.hasVoteEnded = function(now, initiative) {
	return (
		initiative.status === "followUp" ||
		new Date(initiative.vote.endsAt) <= now
	)
}

exports.isSuccessful = function(initiative) {
	return exports.countSignatures("Yes", initiative) >= VOTES_REQUIRED
}

exports.hasVoteFailed = function(now, initiative) {
	return (
		exports.hasVoteEnded(now, initiative) &&
		!exports.isSuccessful(initiative)
	)
}

exports.hasVote = function(value, initiative) {
	if (initiative.vote == null) return false
	var votes = initiative.vote.options.rows
	return votes.some((opt) => opt.selected && opt.value === value)
}

exports.isEditable = function(initiative) {
	return (
		initiative.status == "inProgress" &&
		(exports.can("admin", initiative) || exports.can("edit", initiative))
	)
}

exports.isInvitable = function(initiative) {
	return (
		initiative.status == "inProgress" &&
		exports.can("admin", initiative)
	)
}

exports.isPublic = function(initiative) {
	return initiative.visibility === "public"
}

// Publish for public discussion.
exports.isPublishable = function(initiative) {
	return (
		initiative.status == "inProgress" &&
		initiative.visibility == "private" &&
		exports.can("admin", initiative)
	)
}

exports.canUpdateDiscussionDeadline = function(initiative) {
	return (
		initiative.status == "inProgress" &&
		initiative.visibility == "public" &&
		exports.can("admin", initiative)
	)
}

exports.canUpdateVoteDeadline = function(initiative) {
	return (
		initiative.status == "voting" &&
		initiative.visibility == "public" &&
		exports.can("admin", initiative)
	)
}

// Propose for voting.
exports.isProposable = function(now, initiative) {
	// NOTE: This currently allows people to create an initiative and hold it
	// hidden until the required number of days pass. Waiting for a solution.
	var createdAt = new Date(initiative.createdAt)
	var min = DateFns.addDays(DateFns.startOfDay(createdAt), MIN_DEADLINE_DAYS)

	return (
		initiative.status == "inProgress" &&
		exports.isPublic(initiative) &&
		exports.can("admin", initiative) &&
		now >= min
	)
}

exports.isVotable = function(now, initiative) {
	return (
		initiative.status == "voting" &&
		!exports.hasVoteEnded(now, initiative)
	)
}

exports.isParliamentable = function(initiative) {
	return (
		initiative.status == "voting" &&
		exports.can("admin", initiative) &&
		exports.isSuccessful(initiative)
	)
}

exports.isFinishable = function(_initiative) {
	return false
}

exports.isDeletable = function(initiative) {
	return (
		initiative.status == "inProgress" &&
		exports.can("admin", initiative)
	)
}

// When an initiative is closed we need heuristics to determine whether it made
// it to the voting or parliament phase.
exports.getUnclosedStatus = function(initiative) {
	switch (initiative.status) {
		case "inProgress":
		case "voting":
		case "followUp": return initiative.status

		case "closed":
			if (initiative.vote && initiative.events.count > 0) return "followUp"
			if (initiative.vote) return "voting"
			return "inProgress"

		default: throw new RangeError("Invalid status: " + initiative.status)
	}
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
	var min = DateFns.addDays(today, MIN_DEADLINE_DAYS)
	var max = DateFns.addDays(today, MAX_DEADLINE_DAYS)
	return min <= deadline && deadline < max
}

exports.getMinDeadline = function(now) {
	var today = DateFns.startOfDay(now)
	return DateFns.addDays(today, MIN_DEADLINE_DAYS)
}

exports.getMaxDeadline = function(now) {
	var today = DateFns.startOfDay(now)
	return DateFns.addDays(today, MAX_DEADLINE_DAYS - 1)
}

exports.isCommentShort = function(comment) {
	return comment.text.length <= 30
}
