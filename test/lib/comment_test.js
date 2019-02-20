var outdent = require("root/lib/outdent")
var htmlify = require("root/lib/comment").htmlify

describe("Comment", function() {
	describe(".htmlify", function() {
		it("must escape HTML tags", function() {
			var html = htmlify("Hello, <b>John!</b>")
			html.must.equal("Hello, &lt;b&gt;John!&lt;/b&gt;")
		})

		it("must linkify", function() {
			htmlify("Hello http://example.com!").must.equal(outdent`
				Hello <a href="http://example.com" class="link" rel="external noopener">http://example.com</a>!
			`)
		})

		it("must highlight curseword", function() {
			var html = htmlify("Hello, nahhui!")
			html.must.equal(`Hello, <span class="curse">nahhui</span>!`)
		})

		it("must highlight curseword in mixed caps", function() {
			var html = htmlify("Hello, NahHui!")
			html.must.equal(`Hello, <span class="curse">NahHui</span>!`)
		})

		it("must highlight cursewords", function() {
			var html = htmlify("Hello, nahhui & nahhui!")
			html.must.equal(`Hello, <span class="curse">nahhui</span> &amp; <span class="curse">nahhui</span>!`)
		})

		it("must not highlight curseword within another word", function() {
			var html = htmlify("Hello, kanahhuimtykk!")
			html.must.equal(`Hello, kanahhuimtykk!`)
		})

		it("must not highlight link with curseword", function() {
			htmlify("Hello http://nahhui.example.com!").must.equal(outdent`
				Hello <a href="http://nahhui.example.com" class="link" rel="external noopener">http://nahhui.example.com</a>!
			`)
		})
	})
})
