var formatTime = require("date-fns/format")
var DEFAULT_LANGUAGE = "et"

var LANGUAGES = {
	// Clear prototype for easy "a in b" checks.
	__proto__: null,
	et: require("root/public/assets/et"),
	en: require("root/public/assets/en"),
	ru: require("root/public/assets/ru")
}

exports.LANGUAGES = LANGUAGES
exports.DEFAULT_LANGUAGE = DEFAULT_LANGUAGE

// While functions failing silently is bad in general, this returns null for
// non-existent keys to allow chaining `t("ERR_504") || t("ERR_500")`. Useful
// primarily for displaying generic errors if more specific ones don't exist.
exports.t = function(lang, key, props) {
	var text = LANGUAGES[lang][key] || LANGUAGES[DEFAULT_LANGUAGE][key]
	return text == null ? null : props == null ? text : interpolate(text, props)
}

exports.formatDate = function(format, date) {
	switch (format) {
		case "numeric": return formatTime(date, "D.MM.YYYY")
		case "iso": return date.toISOString().slice(0, 10)
		default: throw new RangeError("Invalid format: " + format)
	}
}

exports.formatTime = function(format, time) {
	switch (format) {
		case "numeric": return formatTime(time, "D.MM.YYYY HH:mm")
		default: throw new RangeError("Invalid format: " + format)
	}
}

function interpolate(string, props) {
	return string.replace(/\{\{(\w+)\}\}/g, function(match, key) {
		return props[key]
	})
}
