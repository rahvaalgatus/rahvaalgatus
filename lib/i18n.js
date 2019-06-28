var _ = require("root/lib/underscore")
var Config = require("root/config")
var Fs = require("fs")
var slash = require("path").join
var formatDateTime = require("date-fns/format")
var parseMarkdown = require("marked")
var LOCALES = __dirname + "/../locales"
var LANGUAGES = Config.languages
var DEFAULT_LANGUAGE = Config.language
var MARKDOWNS = _.object(LANGUAGES, () => ({}))
var SPAN_DASH = "​—​"
exports.interpolate = interpolate

// Clear prototype for easy "a in b" checks.
var STRINGS = _.create(
	null,
	_.object(LANGUAGES, (lang) => require(`./i18n/${lang}`)),
	{xx: _.mapValues(require(`./i18n/${DEFAULT_LANGUAGE}`), (_value, key) => key)}
)

exports.STRINGS = STRINGS

var EMAIL_PROPS = {
	siteUrl: Config.url,
	twitterUrl: Config.twitterUrl,
	facebookUrl: Config.facebookUrl,
	unsubscribeUrl: "{{unsubscribeUrl}}"
}

// While functions failing silently is bad in general, this returns null for
// non-existent keys to allow chaining `t("ERR_504") || t("ERR_500")`. Useful
// primarily for displaying generic errors if more specific ones don't exist.
exports.t = t

exports.email = function(lang, key, props) {
	return t(lang, key, _.create(EMAIL_PROPS, props))
}

exports.markdown = function(lang, key) {
	if (lang == "xx") return slash("locales", "*", key + ".md")
	var html = MARKDOWNS[lang][key]
	if (html != null) return html
	return MARKDOWNS[lang][key] = readMarkdown(slash(LOCALES, lang, key + ".md"))
}

exports.formatDate = function(format, date) {
	switch (format) {
		case "numeric": return formatDateTime(date, "D.MM.YYYY")
		case "date-month": return formatDateTime(date, "D.MM")
		case "iso": return formatDateTime(date, "YYYY-MM-DD")
		default: throw new RangeError("Invalid format: " + format)
	}
}

exports.formatDateSpan = function(format, a, b) {
	switch (format) {
		case "numeric":
			if (a.getFullYear() == b.getFullYear()) return (
				exports.formatDate("date-month", a) +
				SPAN_DASH +
				exports.formatDate("numeric", b)
			)
			else return (
				exports.formatDate("numeric", a) +
				SPAN_DASH +
				exports.formatDate("numeric", b)
			)

		default: throw new RangeError("Invalid format: " + format)
	}
}

exports.formatTime = function(format, time) {
	switch (format) {
		case "iso": return formatDateTime(time, "HH:mm")
		default: throw new RangeError("Invalid format: " + format)
	}
}

exports.formatDateTime = function(format, time) {
	switch (format) {
		case "numeric": return formatDateTime(time, "D.MM.YYYY HH:mm")
		default: throw new RangeError("Invalid format: " + format)
	}
}

function t(lang, key, props) {
	var text = STRINGS[lang][key] || STRINGS[DEFAULT_LANGUAGE][key]
	return text == null ? null : props == null ? text : interpolate(text, props)
}

function interpolate(string, props) {
	return string.replace(/\{\{(\w+)\}\}/g, function(_match, key) {
		return props[key]
	})
}

function readMarkdown(path) {
	return parseMarkdown(Fs.readFileSync(path, "utf8"), {
		gfm: true,
		headerIds: false,
		breaks: true
	})
}
