var formatTime = require("date-fns/format")

var LANGS = {
	et: require("root/public/assets/et"),
	en: require("root/public/assets/en"),
	ru: require("root/public/assets/ru")
}

exports.t = function(lang, key, props) {
	var text = LANGS[lang][key]
	return props == null ? text : interpolate(text, props)
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
