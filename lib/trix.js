var _ = require("root/lib/underscore")
var Jsx = require("j6pack")
var EMPTY_ARR = Array.prototype
exports.isBlankString = isBlankString

// There's not much documentation on the document format. The glossary merely
// mentions the existence of a few terms.
//
// https://github.com/basecamp/trix/wiki/Glossary
exports.render = function(blocks, opts) {
	var isSafeUrl = opts && opts.isSafeUrl || isHttpOrMailUrl
	var headingTagName = opts && opts.heading || "h1"
	return _.flatten(walk(blocks, renderBlock, renderText))

	function renderBlock(attr, children) {
		switch (attr) {
			case "heading1":
				return Jsx(headingTagName, null, _.intersperse(children, "\n\n"))

			case undefined: return Jsx("p", null, children)
			case "quote": return Jsx("blockquote", null, children)
			case "code": return Jsx("pre", null, children)
			case "bulletList": return Jsx("ul", null, children)
			case "numberList": return Jsx("ol", null, children)

			case "bullet":
			case "number": return children.map((els) => (
				Jsx("li", null, els.reduce(function(els, el) {
					if (_.isArray(els[0]) && _.isArray(el)) els.push("\n\n")
					els.push(el)
					return els
				}, []))
			))

			default: throw new SyntaxError("Unknown block attribute: " + attr)
		}
	}

	function renderText(attrs, text) {
		if (attrs.strike) text = Jsx("s", null, [text])
		if (attrs.italic) text = Jsx("em", null, [text])
		if (attrs.bold) text = Jsx("strong", null, [text])

		if (attrs.href) text = Jsx("a", isSafeUrl(attrs.href)
			? {href: attrs.href}
			: {title: attrs.href},
			[text]
		)

		return text
	}
}

exports.length = function(blocks) {
	return _.sum(walk(blocks, countBlock, countText))

	function countBlock(attr, children) {
		switch (attr) {
			case "bullet":
			case "number": return _.sum(children.map(countChildren))
			default: return countChildren(children)
		}
	}

	function countChildren(children) {
		return _.reduce(children, (sum, child) => (
			sum + (_.isArray(child) ? _.sum(child) : child)
		), 0)
	}

	function countText(_attrs, text) { return text.length }
}

function walk(blocks, renderBlock, renderText) {
	return _.flatten(groupAndRenderBlocks(blocks, {withParagraphs: true}))

	// Trix encodes nested text blocks (like quotes, lists) not as trees, but as
	// a flat list of blocks with attributes following nesting. A list in a quote
	// will therefore have attributes of ["quote", "bulletList"].
	function groupAndRenderBlocks(blocks, {withParagraphs}) {
		var groups = _.groupAdjacent(blocks, (a, b) => (
			a.attributes[0] == b.attributes[0] &&
			a.attributes[0] != "heading1" &&
			a.attributes[0] != "code"
		))

		return _.flatten(groups.map(function(blocks) {
			var attr = blocks[0].attributes[0]
			blocks = blocks.map(dropAttribute)
			var allTextChildren = blocks.every((b) => b.attributes.length == 0)

			var children
			if (attr == "bullet" || attr == "number")
				children = _.groupAdjacent(blocks, (_a, b) => (
					b.attributes[0] == "bulletList" ||
					b.attributes[0] == "numberList"
				)).map((group) => groupAndRenderBlocks(group, {withParagraphs: false}))
			else
				children = !allTextChildren
					? groupAndRenderBlocks(blocks, {withParagraphs: attr != "code"})
					: _.flatten(blocks.map(renderTextBlock))

			switch (attr) {
				case "heading1":
				case "code":
				case "bulletList":
				case "numberList":
				case "bullet":
				case "number": return [renderBlock(attr, children)]

				case "quote": return [renderBlock(attr, allTextChildren
					? children.map(renderBlock.bind(null, undefined))
					: children)]

				case undefined:
					if (children.every(isEmpty)) return EMPTY_ARR
					if (!withParagraphs) return children
					return children.map(renderBlock.bind(null, undefined))

				default: throw new SyntaxError("Unknown block attribute: " + attr)
			}
		}))
	}

	// Text blocks are parsed into paragraphs by splitting on two consecutive
	// newlines as Trix lacks a concept of a paragraph. The paragraph contents is
	// left as an array of lines.
	function renderTextBlock(block) {
		return block.text.reduce(function(paragraphs, text, i) {
			var {type} = text
			if (isBlockBreak(text)) return paragraphs
			if (type == "attachment") return paragraphs
			if (type != "string") throw new TypeError("Invalid inline type: " + type)

			var texts = text.string.split(/\n\n+/g)
			if (i == 0) texts[0] = texts[0].trimLeft()
			texts = texts.map((t) => renderText(text.attributes, t))

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

function isBlankString(obj) {
	return obj.text && obj.text.every((text) => (
		text.type == "string" && /^\s*$/.test(text.string)
	)) && obj.attributes.length == 0
}

function isEmpty(array) { return array.length == 0 }
