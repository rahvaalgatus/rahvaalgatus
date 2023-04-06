var DateFns = require("date-fns")
var ISO8601_DATE = /^(\d\d\d\d)-(\d\d)-(\d\d)$/
var ISO8601_DATE_TIME = /^\d\d\d\d-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z?$/

exports.parse = function(string) {
	var time = DateFns.parse(string)
	return isNaN(time) ? null : time
}

exports.parseIsoDate = function(date) {
	var match = ISO8601_DATE.exec(date)
	if (match == null) return null
	return new Date(+match[1], +match[2] - 1, +match[3])
}

exports.parseIsoDateTime = function(time) {
	if (!ISO8601_DATE_TIME.test(time)) return null
	return DateFns.parse(time)
}

exports.isSameDate = DateFns.isSameDay
