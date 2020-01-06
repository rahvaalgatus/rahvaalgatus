var Config = require("root/config")
var DateFns = require("date-fns")
var differenceInCalendarDays = DateFns.differenceInCalendarDays
var MIN_DEADLINE_DAYS = Config.minDeadlineDays
var MAX_DEADLINE_DAYS = Config.maxDeadlineDays

exports.can = function(perm, topic) {
	return topic.permission.level == perm
}

exports.hasDiscussionEnded = function(now, topic) {
	return (
		topic.status == "closed" ||
		new Date(topic.endsAt) <= now
	)
}

exports.daysInDiscussion = function(topic) {
	return differenceInCalendarDays(topic.endsAt, topic.createdAt) + 1
}

exports.canEdit = function(topic) {
	return exports.can("admin", topic) || exports.can("edit", topic)
}

exports.canEditBody = function(topic) {
	return exports.canEdit(topic) && topic.status == "inProgress"
}

exports.canCreateEvents = function(topic) {
	return exports.can("admin", topic) && (
		topic.status == "voting" ||
		topic.status == "followUp"
	)
}

exports.canInvite = function(topic) {
	return (
		topic.status == "inProgress" &&
		exports.can("admin", topic)
	)
}

exports.isPublic = function(topic) {
	return topic.visibility === "public"
}

// Publish for public discussion.
exports.canPublish = function(topic) {
	return (
		topic.status == "inProgress" &&
		topic.visibility == "private" &&
		exports.can("admin", topic)
	)
}

exports.canUpdateDiscussionDeadline = function(topic) {
	return (
		topic.status == "inProgress" &&
		topic.visibility == "public" &&
		exports.can("admin", topic)
	)
}

exports.canUpdateVoteDeadline = function(topic) {
	return (
		topic.status == "voting" &&
		topic.visibility == "public" &&
		exports.can("admin", topic)
	)
}

// Propose for voting.
exports.canPropose = function(now, topic) {
	// NOTE: This currently allows people to create an initiative and hold it
	// hidden until the required number of days pass. Waiting for a solution.
	var createdAt = topic.createdAt
	var min = DateFns.addDays(DateFns.startOfDay(createdAt), MIN_DEADLINE_DAYS)

	return (
		topic.status == "inProgress" &&
		exports.isPublic(topic) &&
		exports.can("admin", topic) &&
		(now >= min || hasTag(topic, "fast-track"))
	)
}

exports.canSendToParliament = function(topic, initiative, signatureCount) {
	return (
		initiative.destination == "parliament" &&
		initiative.phase == "sign" &&

		exports.can("admin", topic) && (
			signatureCount >= Config.votesRequired ||
			signatureCount >= 1 && initiative.has_paper_signatures
		)
	)
}

exports.canDelete = function(initiative) {
	return initiative.status == "inProgress" && exports.can("admin", initiative)
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

function hasTag(topic, tag) {
	return topic.categories && topic.categories.includes(tag)
}
