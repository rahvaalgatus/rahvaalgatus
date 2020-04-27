var Config = require("root/config")
var DateFns = require("date-fns")
var MIN_DEADLINE_DAYS = Config.minDeadlineDays
var MAX_DEADLINE_DAYS = Config.maxDeadlineDays

exports.can = function(perm, topic) {
	return topic.permission.level == perm
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

