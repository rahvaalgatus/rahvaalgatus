var formatTime = require("date-fns/format")

var LANGUAGES = {
	et: require("root/public/assets/et"),
	en: require("root/public/assets/en"),
	ru: require("root/public/assets/ru")
}

exports.LANGUAGES = LANGUAGES

// While functions failing silently is bad in general, this returns null for
// non-existent keys to allow chaining `t("ERR_504") || t("ERR_500")`. Useful
// primarily for displaying generic errors if more specific ones don't exist.
exports.t = function(lang, key, props) {
	var text = LANGUAGES[lang][key]
	return text == null ? null : props == null ? text : interpolate(text, props)
}

exports.formatDate = function(format, time) {
	switch (format) {
		case "numeric": return formatTime(time, "D.MM.YYYY")
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
