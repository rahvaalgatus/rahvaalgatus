/** @jsx Jsx */
var _ = require("root/lib/underscore")
var Jsx = require("j6pack")
var Initiative = require("root/lib/initiative")
var MediaType = require("medium-type")
var ValidText = require("root/test/valid_initiative_text")
var Config = require("root").config
var I18n = require("root/lib/i18n")
var demand = require("must")
var outdent = require("root/lib/outdent")
var {newTrixDocument} = require("root/test/fixtures")
var {TRIX_BLANK_DOCUMENT} = require("root/test/fixtures")
var TRIX_TYPE = new MediaType("application/vnd.basecamp.trix+json")
var TRIX_SECTIONS_TYPE =
	new MediaType("application/vnd.rahvaalgatus.trix-sections+json")

describe("Initiative", function() {
	describe(".slug", function() {
		_.each({
			"Hello, world": "hello-world",
			"Hello, world!": "hello-world",
			" hello world ": "hello-world",
			"  hello  world  ": "hello-world",
			"1 + 2": "1+2",
			"1  +  2": "1+2",
			"hello-world": "hello-world",
			"hello>world": "hello-world",
			"hello<world": "hello-world",
			"hello/world": "hello-world",
			"hello|world": "hello-world",
			"hello+world": "hello+world",
			"õilsad ööbikud": "õilsad-ööbikud",
			"hello  world": "hello-world",
			"hello #world": "hello-world",
			"hello (world)": "hello-world",
			"hello [world]": "hello-world",
			"hello {world}": "hello-world",
			"hello <world>": "hello-world",
			"hello ^world": "hello-world",
			"hello world?": "hello-world",
			"hello. world": "hello-world",
			"hello% world": "hello-world",
			"hello; world": "hello-world",
			"hello „world”": "hello-world",
			"hello “world”": "hello-world",
			"hello 'world'": "hello-world",
			"hello \"world\"": "hello-world",
			"!?": null,
		}, function(to, from) {
			it(`must slugify "${from}"`, function() {
				demand(Initiative.slug(from)).be.equal(to)
			})
		})
	})

	describe(".slugUrl", function() {
		it("must serialize id with slug", function() {
			Initiative.slugUrl({
				id: 42,
				slug: "hello-world"
			}).must.equal(Config.url + "/initiatives/42-hello-world")
		})

		it("must encode slug", function() {
			Initiative.slugUrl({
				id: 42,
				slug: "hello/world"
			}).must.equal(Config.url + "/initiatives/42-hello%2Fworld")
		})

		it("must serialize id without slug if null", function() {
			Initiative.slugUrl({
				id: 42,
				slug: null
			}).must.equal(Config.url + "/initiatives/42")
		})

		it("must serialize id without slug if empty", function() {
			Initiative.slugUrl({
				id: 42,
				slug: ""
			}).must.equal(Config.url + "/initiatives/42")
		})
	})

	describe(".slugPath", function() {
		it("must serialize id with slug", function() {
			Initiative.slugPath({
				id: 42,
				slug: "hello-world"
			}).must.equal("/initiatives/42-hello-world")
		})

		it("must encode slug", function() {
			Initiative.slugPath({
				id: 42,
				slug: "hello/world"
			}).must.equal("/initiatives/42-hello%2Fworld")
		})

		it("must serialize id without slug if null", function() {
			Initiative.slugPath({id: 42, slug: null}).must.equal("/initiatives/42")
		})

		it("must serialize id without slug if empty", function() {
			Initiative.slugPath({id: 42, slug: ""}).must.equal("/initiatives/42")
		})
	})

	describe(".renderForParliament", function() {
		it("must render Trix text", function() {
			var text = new ValidText({
				content: newTrixDocument("Hello, world!"),
				content_type: TRIX_TYPE,
				language: "en"
			})

			Initiative.renderForParliament(text).must.equal(<html lang="en">
				<head>
					<meta charset="utf-8" />
					<title>{text.title}</title>
					<style>{outdent`
						body {
							white-space: pre-wrap;
						}
					`}</style>
				</head>

				<body>
					<h1>{text.title}</h1>
					<p>Hello, world!</p>
				</body>
			</html>.toString("doctype"))
		})

		it("must render Trix text with headings", function() {
			var text = new ValidText({
				content: [{
					"text": [{"type": "string", "attributes": {}, "string": "My Idea"}],
					"attributes": ["heading1"]
				}, {
					"text": [{"type": "string", "attributes": {}, "string": "Hello!"}],
					"attributes": []
				}],

				content_type: TRIX_TYPE
			})

			Initiative.renderForParliament(text).must.equal(<html lang="et">
				<head>
					<meta charset="utf-8" />
					<title>{text.title}</title>
					<style>{outdent`
						body {
							white-space: pre-wrap;
						}
					`}</style>
				</head>

				<body>
					<h1>{text.title}</h1>
					<h2>My Idea</h2>
					<p>Hello!</p>
				</body>
			</html>.toString("doctype"))
		})

		it("must render Trix text sections in text's language", function() {
			var text = new ValidText({
				content_type: TRIX_SECTIONS_TYPE,
				language: "en",

				content: {
					summary: newTrixDocument("World."),
					problem: newTrixDocument("Bad world."),
					solution: newTrixDocument("Make better.")
				}
			})

			Initiative.renderForParliament(text).must.equal(<html lang="en">
				<head>
					<meta charset="utf-8" />
					<title>{text.title}</title>
					<style>{outdent`
						body {
							white-space: pre-wrap;
						}
					`}</style>
				</head>

				<body>
					<h1>{text.title}</h1>
					<big><p>World.</p></big>

					<h2>{I18n.t("en", "initiative_page.text.sections.problem")}</h2>
					<p>Bad world.</p>

					<h2>{I18n.t("en", "initiative_page.text.sections.solution")}</h2>
					<p>Make better.</p>
				</body>
			</html>.toString("doctype"))
		})

		it("must render Trix text sections with headings", function() {
			var text = new ValidText({
				content: {
					summary: [{
						"text": [{"type": "string", "attributes": {}, "string": "My Idea"}],
						"attributes": ["heading1"]
					}, {
						"text": [{"type": "string", "attributes": {}, "string": "World."}],
						"attributes": []
					}],

					problem: [{
						"text": [{
							"type": "string",
							"attributes": {},
							"string": "My Problem"
						}],
						"attributes": ["heading1"]
					}, {
						"text": [{
							"type": "string",
							"attributes": {},
							"string": "Bad world."
						}],
						"attributes": []
					}],

					solution: [{
						"text": [{
							"type": "string",
							"attributes": {},
							"string": "My Solution"
						}],
						"attributes": ["heading1"]
					}, {
						"text": [{
							"type": "string",
							"attributes": {},
							"string": "Make better."
						}],
						"attributes": []
					}]
				},

				content_type: TRIX_SECTIONS_TYPE,
				language: "en"
			})

			Initiative.renderForParliament(text).must.equal(<html lang="en">
				<head>
					<meta charset="utf-8" />
					<title>{text.title}</title>
					<style>{outdent`
						body {
							white-space: pre-wrap;
						}
					`}</style>
				</head>

				<body>
					<h1>{text.title}</h1>

					<big>
						<h3>My Idea</h3>
						<p>World.</p>
					</big>

					<h2>{I18n.t("en", "initiative_page.text.sections.problem")}</h2>
					<h3>My Problem</h3>
					<p>Bad world.</p>

					<h2>{I18n.t("en", "initiative_page.text.sections.solution")}</h2>
					<h3>My Solution</h3>
					<p>Make better.</p>
				</body>
			</html>.toString("doctype"))
		})

		it("must render Trix text sections with blank sections", function() {
			var text = new ValidText({
				content_type: TRIX_SECTIONS_TYPE,
				language: "en",

				content: {
					summary: TRIX_BLANK_DOCUMENT,
					problem: TRIX_BLANK_DOCUMENT,
					solution: TRIX_BLANK_DOCUMENT
				}
			})

			Initiative.renderForParliament(text).must.equal(<html lang="en">
				<head>
					<meta charset="utf-8" />
					<title>{text.title}</title>
					<style>{outdent`
						body {
							white-space: pre-wrap;
						}
					`}</style>
				</head>

				<body><h1>{text.title}</h1></body>
			</html>.toString("doctype"))
		})

		it("must render CitizenOS HTML", function() {
			var html = outdent`
				<!DOCTYPE HTML>
				<html>
					<body>
						<h1>Vote for Peace</h1>
						<p>Rest in peace!</p>
					</body>
				</html>
			`

			var text = new ValidText({
				content_type: "application/vnd.citizenos.etherpad+html",
				content: html
			})

			Initiative.renderForParliament(text).must.equal(html)
		})
	})
})
