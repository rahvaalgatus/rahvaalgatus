var _ = require("root/lib/underscore")
var Initiative = require("root/lib/initiative")
var Config = require("root").config
var demand = require("must")

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
})
