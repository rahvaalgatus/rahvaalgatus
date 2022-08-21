var outdent = require("root/lib/outdent")
var linkify = require("root/lib/linkify")

describe("linkify", function() {
	it("must escape HTML tags", function() {
		var html = linkify("Hello, <b>John!</b>")
		html.must.equal("Hello, &lt;b&gt;John!&lt;/b&gt;")
	})

	it("must escape HTML tags over multiple lines", function() {
		linkify(outdent`
			Hello, <b>John!</b>
			How <script>alert(1)</script> you?
		`).must.equal(outdent`
			Hello, &lt;b&gt;John!&lt;/b&gt;
			How &lt;script&gt;alert(1)&lt;/script&gt; you?
		`)
	})

	describe("given HTTP URL", function() {
		;[
			"http://example.com",
			"http://example.com:8080",

			// Path
			"http://example.com/foo'bar",
			"http://example.com/foo_bar",
			"http://example.com/",
			"http://example.com/foo_bar/",
			"http://example.com//",
			"http://example.com/foo//bar",
			"http://example.com/~foo",
			"http://example.com/@foo",

			// Query string
			"http://example.com/?foo=bar",
			"http://example.com?foo=bar",
			"http://example.com?foo=bar&baz=bax",

			// Fragment
			"http://example.com/#foo=bar",
			"http://example.com#foo=bar",

			"https://example.com",
			"http://example.abcdefghijklmnopqrstuvwxyz",
		].forEach(function(url) {
			it("must link " + url, function() {
				var href = url.replace(/&/g, "&amp;")

				linkify(`Hello ${url}!`).must.equal(outdent`
					Hello <a href="${href}" class="link" rel="external noopener">${href}</a>!
				`)
			})
		})

		it("must link inside parentheses", function() {
			var html = linkify("Hi (See more at http://example.com).")
			html.must.equal(outdent`
				Hi (See more at <a href="http://example.com" class="link" rel="external noopener">http://example.com</a>).
			`)
		})

		it("must link multiple URLs", function() {
			linkify(outdent`
				- See more at http://example.com
				- Alternatively at http://example.org
			`).must.equal(outdent`
				- See more at <a href="http://example.com" class="link" rel="external noopener">http://example.com</a>
				- Alternatively at <a href="http://example.org" class="link" rel="external noopener">http://example.org</a>
			`)
		})

		it("must escape HTML within a URL", function() {
			var html = linkify("http://exa<script>mple.com")
			html.must.equal("http://exa&lt;script&gt;mple.com")
		})
	})

	describe("given email address", function() {
		;[
			"user@example.com",
			"user-name@example-domain.com"
		].forEach(function(email) {
			it("must link " + email, function() {
				linkify(`Hello ${email}!`).must.equal(outdent`
					Hello <a href="mailto:${email}" class="link">${email}</a>!
				`)
			})
		})
	})
})
