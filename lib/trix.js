var _ = require("root/lib/underscore")
var Jsx = require("j6pack")
var flatten = Function.apply.bind(Array.prototype.concat, Array.prototype)
var EMPTY_ARR = Array.prototype

// There's not much documentation on the document format. The glossary merely
// mentions the existence of a few terms.
//
// https://github.com/basecamp/trix/wiki/Glossary
exports.render = function(blocks, opts) {
	var isSafeUrl = opts && opts.isSafeUrl || isHttpOrMailUrl
	var headingTagName = opts && opts.heading || "h1"
	return flatten(groupAndRender(blocks, {withParagraphs: true}))

	function groupAndRender(blocks, {withParagraphs}) {
		var groups = _.groupAdjacent(blocks, (a, b) => (
			a.attributes[0] == b.attributes[0] &&
			a.attributes[0] != "heading1" &&
			a.attributes[0] != "code"
		))

		return groups.map(function(blocks) {
			var attr = blocks[0].attributes[0]
			blocks = blocks.map(dropAttribute)
			var childrenHaveAttrs = blocks.some((b) => b.attributes.length > 0)

			var children
			if (attr == "bullet" || attr == "number")
				children = _.groupAdjacent(blocks, (_a, b) => (
					b.attributes[0] == "bulletList" ||
					b.attributes[0] == "numberList"
				)).map((group) => groupAndRender(group, {withParagraphs: false}))
			else
				children = childrenHaveAttrs
					? groupAndRender(blocks, {withParagraphs: attr != "code"})
					: flatten(blocks.map(renderParagraphs))

			switch (attr) {
				case "heading1":
					return Jsx(headingTagName, null, _.intersperse(children, "\n\n"))

				case "quote":
					if (!childrenHaveAttrs)
						children = children.map(Jsx.bind(null, "p", null))
					return Jsx("blockquote", null, children)

				case "code": return Jsx("pre", null, children)
				case "bulletList": return Jsx("ul", null, children)
				case "numberList": return Jsx("ol", null, children)

				case "bullet":
				case "number": return children.map((c) => Jsx("li", null, [c]))

				case undefined:
					if (children.every(isEmpty)) return EMPTY_ARR
					if (withParagraphs) return children.map(Jsx.bind(null, "p", null))
					else return children

				default: throw new SyntaxError("Unknown block attribute: " + attr)
			}
		}, [])
	}

	function renderParagraphs(block) {
		return block.text.reduce(function(paragraphs, text, i) {
			var type = text.type
			if (isBlockBreak(text)) return paragraphs
			if (type == "attachment") return paragraphs
			if (type != "string") throw new TypeError("Invalid inline type: " + type)

			var texts = text.string.split(/\n\n+/g)
			if (i == 0) texts[0] = texts[0].trimLeft()

			if (text.attributes.strike)
				texts = texts.map((t) => Jsx("s", null, [t]))
			if (text.attributes.italic)
				texts = texts.map((t) => Jsx("em", null, [t]))
			if (text.attributes.bold)
				texts = texts.map((t) => Jsx("strong", null, [t]))
			if (text.attributes.href)
				texts = texts.map((t) => Jsx("a", isSafeUrl(text.attributes.href) ? {
					href: text.attributes.href
				} : {title: text.attributes.href}, [t]))

			_.last(paragraphs).push(texts[0])
			texts.slice(1).forEach((p) => paragraphs.push([p]))
			return paragraphs
		}, [[]])
	}
}

function dropAttribute(block) {
	return _.defaults({attributes: block.attributes.slice(1)}, block)
}

function isBlockBreak(text) {
	return text.attributes.blockBreak && text.string == "\n"
}

function isHttpOrMailUrl(url) {
	return (
		url.startsWith("http://") ||
		url.startsWith("https://") ||
		url.startsWith("mailto:")
	)
}

function isEmpty(array) { return array.length == 0 }
