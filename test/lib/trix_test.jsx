/** @jsx Jsx */
var Jsx = require("j6pack")
var Trix = require("root/lib/trix")
var URL = "http://example.com"

var BLOCK_BREAK = {
	"type": "string",
	"attributes": {"blockBreak": true},
	"string": "\n"
}

describe("Trix", function() {
	describe(".render", function() {
		require("root/test/time")()

		it("must render given no blocks", function() {
			Trix.render([]).must.eql([])
		})

		it("must render a text block as paragraph", function() {
			Trix.render([{
				"text": [
					{"type": "string", "attributes": {}, "string": "Hello, world!"},
					BLOCK_BREAK
				],

				"attributes": []
			}]).must.eql([
				<p>Hello, world!</p>
			])
		})

		it("must render two paragraphs in one text block", function() {
			Trix.render([{
				"text": [{
					"type": "string",
					"attributes": {},
					"string": "Hello, world!\n\nHow are you?"
				}, BLOCK_BREAK],

				"attributes": []
			}]).must.eql(<>
				<p>Hello, world!</p>
				<p>How are you?</p>
			</>)
		})

		// I'm not sure this can actually happen as the editor seems to merge
		// adjacent text blocks, but better be safe.
		it("must render two paragraphs in adjacent text blocks", function() {
			Trix.render([{
				"text": [{
					"type": "string",
					"attributes": {},
					"string": "Hello, world!"
				}, BLOCK_BREAK],

				"attributes": []
			}, {
				"text": [{
					"type": "string",
					"attributes": {},
					"string": "\nHow are you?"
				}, BLOCK_BREAK],

				"attributes": []
			}]).must.eql(<>
				<p>Hello, world!</p>
				<p>How are you?</p>
			</>)
		})

		it("must render two paragraphs separated by three newlines", function() {
			Trix.render([{
				"text": [{
					"type": "string",
					"attributes": {},
					"string": "Hello, world!\n\n\nHow are you?"
				}, BLOCK_BREAK],

				"attributes": []
			}]).must.eql(<>
				<p>Hello, world!</p>
				<p>How are you?</p>
			</>)
		})

		it("must not render an empty text block", function() {
			Trix.render([{"text": [BLOCK_BREAK], "attributes": []}]).must.eql([])
		})

		it("must render bold", function() {
			Trix.render([{
				"text": [
					{"type": "string", "attributes": {}, "string": "Hello, "},
					{"type": "string", "attributes": {"bold": true}, "string": "world"},
					{"type": "string", "attributes": {}, "string": "!"},
					BLOCK_BREAK
				],

				"attributes": []
			}]).must.eql([
				<p>Hello, <strong>world</strong>!</p>
			])
		})

		it("must render italic", function() {
			Trix.render([{
				"text": [
					{"type": "string", "attributes": {}, "string": "Hello, "},
					{"type": "string", "attributes": {"italic": true}, "string": "world"},
					{"type": "string", "attributes": {}, "string": "!"},
					BLOCK_BREAK
				],

				"attributes": []
			}]).must.eql([
				<p>Hello, <em>world</em>!</p>
			])
		})

		it("must render strike", function() {
			Trix.render([{
				"text": [
					{"type": "string", "attributes": {}, "string": "Hello, "},
					{"type": "string", "attributes": {"strike": true}, "string": "world"},
					{"type": "string", "attributes": {}, "string": "!"},
					BLOCK_BREAK
				],

				"attributes": []
			}]).must.eql([
				<p>Hello, <s>world</s>!</p>
			])
		})

		;[
			"http://example.com",
			"https://example.com",
			"mailto:user@example.com"
		].forEach(function(url) {
			it(`must render link to ${url}`, function() {
				Trix.render([{
					"text": [
						{"type": "string", "attributes": {}, "string": "Hello, "},
						{"type": "string", "attributes": {"href": url}, "string": "world"},
						{"type": "string", "attributes": {}, "string": "!"},
						BLOCK_BREAK
					],

					"attributes": []
				}]).must.eql([
					<p>Hello, <a href={url}>world</a>!</p>
				])
			})
		})

		it("must render text with all attributes", function() {
			Trix.render([{
				"text": [
					{"type": "string", "attributes": {}, "string": "Hello, "},
					{"type": "string", "attributes": {
						"italic": true,
						"bold": true,
						"strike": true
					}, "string": "world"},
					{"type": "string", "attributes": {}, "string": "!"},
					BLOCK_BREAK
				],

				"attributes": []
			}]).must.eql([
				<p>Hello, <strong><em><s>world</s></em></strong>!</p>
			])
		})

		;["javascript:alert(1)", "magnet:foobar"].forEach(function(url) {
			it(`must render link to ${url} in title`, function() {
				Trix.render([{
					"text": [
						{"type": "string", "attributes": {}, "string": "Hello, "},
						{"type": "string", "attributes": {"href": url}, "string": "world"},
						{"type": "string", "attributes": {}, "string": "!"},
						BLOCK_BREAK
					],

					"attributes": []
				}]).must.eql([
					<p>Hello, <a title={url}>world</a>!</p>
				])
			})
		})

		it("must render a heading", function() {
			Trix.render([{
				"text": [
					{"type": "string", "attributes": {}, "string": "Hello, world!"},
					BLOCK_BREAK
				],

				"attributes": ["heading1"]
			}]).must.eql([
				<h1>Hello, world!</h1>
			])
		})

		it("must render a heading given tag name", function() {
			Trix.render([{
				"text": [
					{"type": "string", "attributes": {}, "string": "Hello, world!"},
					BLOCK_BREAK
				],

				"attributes": ["heading1"]
			}], {heading: "h2"}).must.eql([
				<h2>Hello, world!</h2>
			])
		})

		it("must render a heading with bold word", function() {
			Trix.render([{
				"text": [
					{"type": "string", "attributes": {}, "string": "Hello, "},
					{"type": "string", "attributes": {"bold": true}, "string": "world"},
					{"type": "string", "attributes": {}, "string": "!"},
					BLOCK_BREAK
				],

				"attributes": ["heading1"]
			}]).must.eql([
				<h1>Hello, <strong>world</strong>!</h1>
			])
		})

		it("must render heading with one newline", function() {
			Trix.render([{
				"text": [{
					"type": "string",
					"attributes": {},
					"string": "Hello, world!\nHow are you?"
				}, BLOCK_BREAK],

				"attributes": ["heading1"]
			}]).must.eql([
				<h1>Hello, world!{"\n"}How are you?</h1>
			])
		})

		it("must render heading with two newlines", function() {
			Trix.render([{
				"text": [{
					"type": "string",
					"attributes": {},
					"string": "Hello, world!\n\nHow are you?"
				}, BLOCK_BREAK],

				"attributes": ["heading1"]
			}]).must.eql([
				<h1>Hello, world!{"\n\n"}How are you?</h1>
			])
		})

		it("must render heading with three newlines", function() {
			Trix.render([{
				"text": [{
					"type": "string",
					"attributes": {},
					"string": "Hello, world!\n\n\nHow are you?"
				}, BLOCK_BREAK],

				"attributes": ["heading1"]
			}]).must.eql([
				<h1>Hello, world!{"\n\n"}How are you?</h1>
			])
		})

		it("must render a heading and text separated by newline", function() {
			Trix.render([{
				"text": [
					{"type": "string", "attributes": {}, "string": "My idea"},
					BLOCK_BREAK
				],

				"attributes": ["heading1"]
			}, {
				"text": [
					{"type": "string", "attributes": {}, "string": "\nHello, world!"},
					BLOCK_BREAK
				],

				"attributes": []
			}]).must.eql(<>
				<h1>My idea</h1>
				<p>Hello, world!</p>
			</>)
		})

		// Headings seem the only block types that are not merged together.
		// That's probably also why headings can't in turn have quotes, codes or
		// lists in them.
		it("must render two adjacent headings", function() {
			Trix.render([{
				"text": [
					{"type": "string", "attributes": {}, "string": "Hello, world!"},
					BLOCK_BREAK
				],

				"attributes": ["heading1"]
			}, {
				"text": [
					{"type": "string", "attributes": {}, "string": "How are you?"},
					BLOCK_BREAK
				],

				"attributes": ["heading1"]
			}]).must.eql(<>
				<h1>Hello, world!</h1>
				<h1>How are you?</h1>
			</>)
		})

		it("must render quote", function() {
			Trix.render([{
				"text": [
					{"type": "string", "attributes": {}, "string": "Hello, world!"},
					BLOCK_BREAK
				],

				"attributes": ["quote"]
			}]).must.eql([
				<blockquote><p>Hello, world!</p></blockquote>
			])
		})

		it("must render quote with two levels", function() {
			Trix.render([{
				"text": [
					{"type": "string", "attributes": {}, "string": "Hello, world!"},
					BLOCK_BREAK
				],

				"attributes": ["quote", "quote"]
			}]).must.eql([
				<blockquote><blockquote><p>Hello, world!</p></blockquote></blockquote>
			])
		})

		// Quotes can nest other blocks, hence they can be adjacent.
		it("must render two adjacent quotes", function() {
			Trix.render([{
				"text": [
					{"type": "string", "attributes": {}, "string": "Hello, world!"},
					BLOCK_BREAK
				],

				"attributes": ["quote"]
			}, {
				"text": [
					{"type": "string", "attributes": {}, "string": "How are you?"},
					BLOCK_BREAK
				],

				"attributes": ["quote"]
			}]).must.eql([
				<blockquote>
					<p>Hello, world!</p>
					<p>How are you?</p>
				</blockquote>
			])
		})

		it("must render code", function() {
			Trix.render([{
				"text": [
					{"type": "string", "attributes": {}, "string": "Hello, world!"},
					BLOCK_BREAK
				],

				"attributes": ["code"]
			}]).must.eql([
				<pre>Hello, world!</pre>
			])
		})

		// You can't really create two adjacent code blocks in the editor because
		// you can't nest other blocks in code.
		it("must render two adjacent codes", function() {
			Trix.render([{
				"text": [
					{"type": "string", "attributes": {}, "string": "Hello, world!"},
					BLOCK_BREAK
				],

				"attributes": ["code"]
			}, {
				"text": [
					{"type": "string", "attributes": {}, "string": "How are you?"},
					BLOCK_BREAK
				],

				"attributes": ["code"]
			}]).must.eql(<>
				<pre>Hello, world!</pre>
				<pre>How are you?</pre>
			</>)
		})

		it("must render link in code", function() {
			Trix.render([{
				"text": [
					{"type": "string", "attributes": {}, "string": "Hello, "},
					{"type": "string", "attributes": {"href": URL}, "string": "world"},
					{"type": "string", "attributes": {}, "string": "!"},
					BLOCK_BREAK
				],

				"attributes": ["code"]
			}]).must.eql([
				<pre>Hello, <a href={URL}>world</a>!</pre>
			])
		})

		it("must render bullet list", function() {
			Trix.render([{
				"text": [
					{"type": "string", "attributes": {}, "string": "Alice"},
					BLOCK_BREAK
				],

				"attributes": ["bulletList", "bullet"]
			}, {
				"text": [
					{"type": "string", "attributes": {}, "string": "Bob"},
					BLOCK_BREAK
				],

				"attributes": ["bulletList", "bullet"]
			}, {
				"text": [
					{"type": "string", "attributes": {}, "string": "Charlie"},
					BLOCK_BREAK
				],

				"attributes": ["bulletList", "bullet"]
			}]).must.eql([
				<ul>
					<li>Alice</li>
					<li>Bob</li>
					<li>Charlie</li>
				</ul>
			])
		})

		it("must render bullet list with one newlines", function() {
			Trix.render([{
				"text": [{
					"type": "string",
					"attributes": {},
					"string": "Hello, world!\nHow are you?"
				}, BLOCK_BREAK],


				"attributes": ["bulletList", "bullet"]
			}]).must.eql([
				<ul>
					<li>Hello, world!{"\n"}How are you?</li>
				</ul>
			])
		})

		it("must render bullet list with two newlines", function() {
			Trix.render([{
				"text": [{
					"type": "string",
					"attributes": {},
					"string": "Hello, world!\n\nHow are you?"
				}, BLOCK_BREAK],


				"attributes": ["bulletList", "bullet"]
			}]).must.eql([
				<ul>
					<li>Hello, world!{"\n\n"}How are you?</li>
				</ul>
			])
		})

		it("must render bullet list with three newlines", function() {
			Trix.render([{
				"text": [{
					"type": "string",
					"attributes": {},
					"string": "Hello, world!\n\n\nHow are you?"
				}, BLOCK_BREAK],


				"attributes": ["bulletList", "bullet"]
			}]).must.eql([
				<ul>
					<li>Hello, world!{"\n\n"}How are you?</li>
				</ul>
			])
		})

		it("must render bullet list with nested bullet list", function() {
			Trix.render([{
				"text": [
					{"type": "string", "attributes": {}, "string": "Alice"},
					BLOCK_BREAK
				],

				"attributes": ["bulletList", "bullet"]
			}, {
				"text": [
					{"type": "string", "attributes": {}, "string": "Alice's Alpha"},
					BLOCK_BREAK
				],

				"attributes": ["bulletList", "bullet", "bulletList", "bullet"]
			}, {
				"text": [
					{"type": "string", "attributes": {}, "string": "Alice's Bravo"},
					BLOCK_BREAK
				],

				"attributes": ["bulletList", "bullet", "bulletList", "bullet"]
			}, {
				"text": [
					{"type": "string", "attributes": {}, "string": "Bob"},
					BLOCK_BREAK
				],

				"attributes": ["bulletList", "bullet"]
			}]).must.eql([
				<ul>
					<li>
						Alice

						<ul>
							<li>Alice's Alpha</li>
							<li>Alice's Bravo</li>
						</ul>
					</li>

					<li>Bob</li>
				</ul>
			])
		})

		it("must render bullet list with nested number list", function() {
			Trix.render([{
				"text": [
					{"type": "string", "attributes": {}, "string": "Alice"},
					BLOCK_BREAK
				],

				"attributes": ["bulletList", "bullet"]
			}, {
				"text": [
					{"type": "string", "attributes": {}, "string": "Alice's Alpha"},
					BLOCK_BREAK
				],

				"attributes": ["bulletList", "bullet", "numberList", "number"]
			}, {
				"text": [
					{"type": "string", "attributes": {}, "string": "Alice's Bravo"},
					BLOCK_BREAK
				],

				"attributes": ["bulletList", "bullet", "numberList", "number"]
			}, {
				"text": [
					{"type": "string", "attributes": {}, "string": "Bob"},
					BLOCK_BREAK
				],

				"attributes": ["bulletList", "bullet"]
			}]).must.eql([
				<ul>
					<li>
						Alice

						<ol>
							<li>Alice's Alpha</li>
							<li>Alice's Bravo</li>
						</ol>
					</li>

					<li>Bob</li>
				</ul>
			])
		})

		// This is not exactly intended to be supported by the editor, but a state
		// that it can get into when you unindent the parent list item of a nested
		// list.
		it("must render nested bullet list without parent", function() {
			Trix.render([{
				"text": [
					{"type": "string", "attributes": {}, "string": "Alice's Alpha"},
					BLOCK_BREAK
				],

				"attributes": ["bulletList", "bullet", "bulletList", "bullet"]
			}, {
				"text": [
					{"type": "string", "attributes": {}, "string": "Alice's Bravo"},
					BLOCK_BREAK
				],

				"attributes": ["bulletList", "bullet", "bulletList", "bullet"]
			}, {
				"text": [
					{"type": "string", "attributes": {}, "string": "Bob"},
					BLOCK_BREAK
				],

				"attributes": ["bulletList", "bullet"]
			}]).must.eql([
				<ul>
					<li>
						<ul>
							<li>Alice's Alpha</li>
							<li>Alice's Bravo</li>
						</ul>
					</li>

					<li>Bob</li>
				</ul>
			])
		})

		it("must render number list", function() {
			Trix.render([{
				"text": [
					{"type": "string", "attributes": {}, "string": "Alice"},
					BLOCK_BREAK
				],

				"attributes": ["numberList", "number"]
			}, {
				"text": [
					{"type": "string", "attributes": {}, "string": "Bob"},
					BLOCK_BREAK
				],

				"attributes": ["numberList", "number"]
			}, {
				"text": [
					{"type": "string", "attributes": {}, "string": "Charlie"},
					BLOCK_BREAK
				],

				"attributes": ["numberList", "number"]
			}]).must.eql([
				<ol>
					<li>Alice</li>
					<li>Bob</li>
					<li>Charlie</li>
				</ol>
			])
		})

		it("must render number list with one newlines", function() {
			Trix.render([{
				"text": [{
					"type": "string",
					"attributes": {},
					"string": "Hello, world!\nHow are you?"
				}, BLOCK_BREAK],


				"attributes": ["numberList", "number"]
			}]).must.eql([
				<ol>
					<li>Hello, world!{"\n"}How are you?</li>
				</ol>
			])
		})

		it("must render number list with two newlines", function() {
			Trix.render([{
				"text": [{
					"type": "string",
					"attributes": {},
					"string": "Hello, world!\n\nHow are you?"
				}, BLOCK_BREAK],


				"attributes": ["numberList", "number"]
			}]).must.eql([
				<ol>
					<li>Hello, world!{"\n\n"}How are you?</li>
				</ol>
			])
		})

		it("must render number list with three newlines", function() {
			Trix.render([{
				"text": [{
					"type": "string",
					"attributes": {},
					"string": "Hello, world!\n\n\nHow are you?"
				}, BLOCK_BREAK],


				"attributes": ["numberList", "number"]
			}]).must.eql([
				<ol>
					<li>Hello, world!{"\n\n"}How are you?</li>
				</ol>
			])
		})

		it("must render number list with nested number list", function() {
			Trix.render([{
				"text": [
					{"type": "string", "attributes": {}, "string": "Alice"},
					BLOCK_BREAK
				],

				"attributes": ["numberList", "number"]
			}, {
				"text": [
					{"type": "string", "attributes": {}, "string": "Alice's Alpha"},
					BLOCK_BREAK
				],

				"attributes": ["numberList", "number", "numberList", "number"]
			}, {
				"text": [
					{"type": "string", "attributes": {}, "string": "Alice's Bravo"},
					BLOCK_BREAK
				],

				"attributes": ["numberList", "number", "numberList", "number"]
			}, {
				"text": [
					{"type": "string", "attributes": {}, "string": "Bob"},
					BLOCK_BREAK
				],

				"attributes": ["numberList", "number"]
			}]).must.eql([
				<ol>
					<li>
						Alice

						<ol>
							<li>Alice's Alpha</li>
							<li>Alice's Bravo</li>
						</ol>
					</li>

					<li>Bob</li>
				</ol>
			])
		})

		it("must render number list with nested bullet list", function() {
			Trix.render([{
				"text": [
					{"type": "string", "attributes": {}, "string": "Alice"},
					BLOCK_BREAK
				],

				"attributes": ["numberList", "number"]
			}, {
				"text": [
					{"type": "string", "attributes": {}, "string": "Alice's Alpha"},
					BLOCK_BREAK
				],

				"attributes": ["numberList", "number", "bulletList", "bullet"]
			}, {
				"text": [
					{"type": "string", "attributes": {}, "string": "Alice's Bravo"},
					BLOCK_BREAK
				],

				"attributes": ["numberList", "number", "bulletList", "bullet"]
			}, {
				"text": [
					{"type": "string", "attributes": {}, "string": "Bob"},
					BLOCK_BREAK
				],

				"attributes": ["numberList", "number"]
			}]).must.eql([
				<ol>
					<li>
						Alice

						<ul>
							<li>Alice's Alpha</li>
							<li>Alice's Bravo</li>
						</ul>
					</li>

					<li>Bob</li>
				</ol>
			])
		})

		it("must render bullet list with quotes", function() {
			Trix.render([{
				"text": [
					{"type": "string", "attributes": {}, "string": "Alice"},
					BLOCK_BREAK
				],

				"attributes": ["bulletList", "bullet", "quote"]
			}, {
				"text": [
					{"type": "string", "attributes": {}, "string": "Bob"},
					BLOCK_BREAK
				],

				"attributes": ["bulletList", "bullet", "quote"]
			}, {
				"text": [
					{"type": "string", "attributes": {}, "string": "Charlie"},
					BLOCK_BREAK
				],

				"attributes": ["bulletList", "bullet", "quote"]
			}]).must.eql([
				<ul>
					<li><blockquote><p>Alice</p></blockquote></li>
					<li><blockquote><p>Bob</p></blockquote></li>
					<li><blockquote><p>Charlie</p></blockquote></li>
				</ul>
			])
		})

		it("must ignore attachments", function() {
			Trix.render([{
				"text": [
					{"type": "string", "attributes": {}, "string": "Hello, "},

					{
						"type": "attachment",
						"attributes": {},
						"attachment": {
							contentType: "image",
							height: 800,
							width: 600,
							url: "http://example.com/image.jpg"
						}
					},

					{"type": "string", "attributes": {}, "string": "world!"},
					BLOCK_BREAK
				],

				"attributes": []
			}]).must.eql([
				<p>Hello, world!</p>
			])
		})

		it("must err given unknown inline type", function() {
			var err
			try {
				Trix.render([{
					"text": [
						{"type": "foo", "attributes": {}, "foo": "Hello, world!"},
						BLOCK_BREAK
					],

					"attributes": []
				}])
			}
			catch (ex) { err = ex }
			err.must.be.an.error(TypeError, "Invalid inline type: foo")
		})
	})
})
