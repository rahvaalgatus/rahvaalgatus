var _ = require("./underscore")
var DateFns = require("date-fns")
var ISO8601_YEAR_MONTH = /^(\d\d\d\d)-(\d\d)$/
var ISO8601_DATE = /^(\d\d\d\d)-(\d\d)-(\d\d)$/
var ISO8601_DATE_TIME = /^\d\d\d\d-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z?$/

exports.YearMonth = YearMonth

function YearMonth(year, month) {
	if (year instanceof Date) {
		month = year.getMonth() + 1
		year = year.getFullYear()
	}

	this.ym = year * 12 + (month - 1)
}

YearMonth.prototype.valueOf = function() { return this.ym }

YearMonth.prototype.addMonths = function(n) {
	return _.create(YearMonth.prototype, {ym: this.ym + n})
}

YearMonth.prototype.toDate = function() {
	return new Date(this.year, this.month - 1, 1)
}

YearMonth.prototype.toString = function() {
	return _.padStart(this.year, 4, "0") + "-" + _.padStart(this.month, 2, "0")
}

YearMonth.now = function() { return new YearMonth(new Date) }

YearMonth.parse = function(iso8601) {
	var match = ISO8601_YEAR_MONTH.exec(iso8601)
	if (match == null) return null
	return new YearMonth(+match[1], +match[2])
}

Object.defineProperty(YearMonth.prototype, "year", {
	get: function() { return Math.floor(this.ym / 12) },
	configurable: true
})

Object.defineProperty(YearMonth.prototype, "month", {
	get: function() { return (this.ym % 12) + 1 },
	configurable: true
})

exports.parse = function(string) {
	var time = DateFns.parse(string)
	return isNaN(time) ? null : time
}

exports.parseIsoDate = function(iso8601) {
	var match = ISO8601_DATE.exec(iso8601)
	if (match == null) return null
	return new Date(+match[1], +match[2] - 1, +match[3])
}

exports.parseIsoDateTime = function(iso8601) {
	if (!ISO8601_DATE_TIME.test(iso8601)) return null
	return DateFns.parse(iso8601)
}

exports.isSameDate = DateFns.isSameDay
