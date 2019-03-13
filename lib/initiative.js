var Url = require("url")
var Config = require("root/config")
var DateFns = require("date-fns")
var differenceInCalendarDays = DateFns.differenceInCalendarDays
var ENV = process.env.ENV
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

exports.daysInDiscussion = function(initiative) {
	return differenceInCalendarDays(initiative.endsAt, initiative.createdAt) + 1
}

exports.hasVoteEnded = function(now, initiative) {
	return initiative.vote && (
		new Date(initiative.vote.endsAt) <= now ||
		initiative.status === "followUp" ||
		initiative.status === "closed"
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

exports.canEdit = function(initiative) {
	return ((
		initiative.status == "inProgress" ||
		initiative.status == "voting"
	) && (exports.can("admin", initiative) || exports.can("edit", initiative)))
}

exports.canEditBody = function(initiative) {
	return exports.canEdit(initiative) && initiative.status == "inProgress"
}

exports.canInvite = function(initiative) {
	return (
		initiative.status == "inProgress" &&
		exports.can("admin", initiative)
	)
}

exports.isPublic = function(initiative) {
	return initiative.visibility === "public"
}

// Publish for public discussion.
exports.canPublish = function(initiative) {
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
exports.canPropose = function(now, initiative) {
	// NOTE: This currently allows people to create an initiative and hold it
	// hidden until the required number of days pass. Waiting for a solution.
	var createdAt = initiative.createdAt
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

exports.isDiscussion = function(initiative) {
	return (
		initiative.status == "inProgress" &&
		initiative.vote == null
	)
}

exports.isInitiative = function(initiative) {
	return !exports.isDiscussion(initiative)
}

exports.canSendToParliament = function(initiative) {
	return (
		initiative.status == "voting" &&
		exports.can("admin", initiative) &&
		exports.isSuccessful(initiative)
	)
}

// There are some initiatives that didn't get a 1000 votes here, but
// nonetheless went to the parliament due to signatures on paper. We can't
// distinguish between them other than by checking if they have events.
exports.isInParliament = function(initiative) {
	return initiative.vote && (
		initiative.status == "followUp" ||
		initiative.status == "closed"
	) && (
		exports.isSuccessful(initiative) ||
		initiative.events.count > 0
	)
}

exports.canDelete = function(initiative) {
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

exports.getEtherpadUrl = function(initiative) {
	var url = initiative.padUrl
	if (Config.etherpadUrl) url = Config.etherpadUrl + Url.parse(url).path
	return url + "&theme=" + ENV
}
