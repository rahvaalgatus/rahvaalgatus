var O = require("oolong")
var Config = require("root/config")
var formatTime = require("date-fns/format")
var LANGUAGES = Config.languages
var DEFAULT_LANGUAGE = Config.language
exports.interpolate = interpolate

// Clear prototype for easy "a in b" checks.
var STRINGS = O.create(
	null,
	O.object(LANGUAGES, (lang) => require(`./i18n/${lang}`)),
	{xx: O.map(require(`./i18n/${DEFAULT_LANGUAGE}`), (_value, key) => key)}
)

exports.STRINGS = STRINGS

// While functions failing silently is bad in general, this returns null for
// non-existent keys to allow chaining `t("ERR_504") || t("ERR_500")`. Useful
// primarily for displaying generic errors if more specific ones don't exist.
exports.t = function(lang, key, props) {
	var text = STRINGS[lang][key] || STRINGS[DEFAULT_LANGUAGE][key]
	return text == null ? null : props == null ? text : interpolate(text, props)
}

exports.formatDate = function(format, date) {
	switch (format) {
		case "numeric": return formatTime(date, "D.MM.YYYY")
		case "iso": return formatTime(date, "YYYY-MM-DD")
		default: throw new RangeError("Invalid format: " + format)
	}
}

exports.formatTime = function(format, time) {
	switch (format) {
		case "numeric": return formatTime(time, "D.MM.YYYY HH:mm")
		default: throw new RangeError("Invalid format: " + format)
	}
}

function interpolate(string, props) {
	return string.replace(/\{\{(\w+)\}\}/g, function(_match, key) {
		return props[key]
	})
}
