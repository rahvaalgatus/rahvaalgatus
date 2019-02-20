var Linkify = require("./linkify")
var map = Function.call.bind(Array.prototype.map)
var CURSEWORDS = require("root/lib/i18n/et").CURSEWORDS.split("\n")
var CURSING = new RegExp("\\b(?:" + CURSEWORDS.map(mixCase).join("|") + ")\\b")

exports.htmlify = Linkify.new([
	[Linkify.URL, Linkify.link],
	[CURSING, curse]
])

function curse(text) {
	return "<span class=\"curse\">" + Linkify.escapeHtml(text) + "</span>"
}

function mixCase(wrd) {
	return map(wrd, (c) => "[" + c.toLowerCase() + c.toUpperCase() + "]").join("")
}
