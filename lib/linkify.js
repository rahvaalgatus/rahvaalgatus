// Intentionally ignoring otherwise permitted parentheses in URLs to not have to
// keep track of parentheses pairs that people use in texts.
var URL = /https?:\/\/(?:www\.)?[-a-zA-Z0-9@:;%._+~#=*]{2,256}\.[a-z]{2,4}\b[-a-zA-Z0-9@:;%_+.~#?&/=*']*/g
var LINK_ATTRS = "class=\"link\" rel=\"external noopener\""

module.exports = function(text) {
	var match
	var html = []
	var i = 0
	URL.lastIndex = 0

	while (match = URL.exec(text)) {
		var url = match[0]
		var at = match.index
		html.push(escape(text.slice(i, at)))

		var link = "<a href=\"" + escapeAttr(url) + "\" " + LINK_ATTRS + ">"
		link += escape(url)
		link += "</a>"
		html.push(link)

		i = at + url.length
	}

	html.push(escape(text.slice(i)))
	return html.join("")
}

function escape(text) {
	text = text.replace(/&/g, "&amp;")
	text = text.replace(/</g, "&lt;")
	text = text.replace(/>/g, "&gt;")
	return text
}

function escapeAttr(attr) { return attr.replace(/"/g, "&quot;") }
