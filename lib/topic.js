var Config = require("root/config")
var DateFns = require("date-fns")
var MIN_DEADLINE_DAYS = Config.minDeadlineDays
var MAX_DEADLINE_DAYS = Config.maxDeadlineDays

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

exports.normalizeCitizenOsHtml = function(html) {
	// Strip the title that was once used for setting initiative.title.
	html = html.replace(/<h([1-6])>\s*([^<\s][^]*?)<\/h\1>/, "")

	// An initiative with id a2089bf7-9768-42a8-9fd8-e8139b14da47 has one empty
	// <h1></h1> preceding and one following the actual title.
	html = html.replace(/<h([1-6])>\s*<\/h\1>/g, "")

	// Remove linebreaks around headers.
	html = html.replace(/(?:<br>\s*)+(<h[1-6]>)/g, "$1")
	html = html.replace(/(<\/h[1-6]>)(?:\s*<br>)+/g, "$1")

	// Remove multiple consecutive linebreaks and whitespace around them.
	html = html.replace(/(<body>)\s*(?:<br>\s*)*/, "$1")
	html = html.replace(/(?:\s*<br>)*\s*(<\/body>)/, "$1")

	return html
}
