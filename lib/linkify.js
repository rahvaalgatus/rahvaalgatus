var _ = require("root/lib/underscore")
// Intentionally ignoring otherwise permitted parentheses in URLs to not have to
// keep track of parentheses pairs that people use in texts.
var URL = /\bhttps?:\/\/[-a-zA-Z0-9@:;%._+~#=*]{1,256}\.[a-z]{1,63}\b[-a-zA-Z0-9@:;%_+.~#?&/=*']*/i
var EMAIL = /\b[-a-zA-Z0-9@:;%._+~#=*]{1,256}@[-a-zA-Z0-9@:;%._+~#=*]{1,256}\.[a-z]{1,63}\b/i
var URL_ATTRS = "class=\"link\" rel=\"external noopener\""
var EMAIL_ATTRS = "class=\"link\""

exports = module.exports = create([[URL, linkUrl], [EMAIL, linkEmail]])
exports.new = create
exports.URL = URL
exports.linkUrl = linkUrl
exports.escapeHtml = escapeHtml
exports.escapeAttr = escapeAttr

function create(matchers) {
	var regexps = matchers.map(_.first).map((r) => "(" + r.source + ")")
	var regexp = new RegExp(regexps.join("|"), "g")
	return replace.bind(null, regexp, matchers.map(_.second))
}

function replace(regexp, handlers, text) {
	var match
	var html = []
	var last = 0
	regexp.lastIndex = 0

	while (match = regexp.exec(text)) {
		var at = match.index
		html.push(escapeHtml(text.slice(last, at)))

		for (var i = 0; i < handlers.length; ++i) {
			if (!match[i + 1]) continue
			html.push(handlers[i](match[i + 1]))
			break
		}

		last = at + match[0].length
	}

	html.push(escapeHtml(text.slice(last)))
	return html.join("")
}

function linkUrl(url) {
	var html = "<a href=\"" + escapeAttr(url) + "\" " + URL_ATTRS + ">"
	html += escapeHtml(url)
	html += "</a>"
	return html
}

function linkEmail(email) {
	var html = "<a href=\"mailto:" + escapeAttr(email) + "\" " + EMAIL_ATTRS + ">"
	html += escapeHtml(email)
	html += "</a>"
	return html
}

function escapeHtml(text) {
	text = text.replace(/&/g, "&amp;")
	text = text.replace(/</g, "&lt;")
	text = text.replace(/>/g, "&gt;")
	return text
}

function escapeAttr(text) {
	text = text.replace(/&/g, "&amp;")
	text = text.replace(/"/g, "&quot;")
	return text
}
