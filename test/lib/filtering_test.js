var _ = require("root/lib/underscore")
var Qs = require("qs")
var Filtering = require("root/lib/filtering")
var Range = require("strange")
var {COMPARATOR_SUFFIXES} = Filtering

describe("Filtering", function() {
	describe(".parseFilters", function() {
		describe("into single", function() {
			_.each({
				"foo=bar": {foo: "bar"},
				"foo=bar&foo=baz": {foo: "baz"},
				"foo[]=bar": {foo: "bar"},
				"foo[]=bar&foo[]=baz": {foo: "baz"}
			}, function(filters, query) {
				it("must parse " + query, function() {
					parseFilters({foo: true}, query).must.eql(filters)
				})
			})

			_.without(_.values(COMPARATOR_SUFFIXES), "").forEach(function(suffix) {
				it(`must ignore foo${suffix}=bar`, function() {
					parseFilters({foo: true}, `foo${suffix}=bar`).must.eql({})
				})
			})
		})

		it("must parse name=john&age=42 into singles", function() {
			parseFilters({name: true, age: true}, "name=john&age=42").must.eql({
				name: "john",
				age: "42"
			})
		})

		describe("into array", function() {
			_.each({
				"foo=bar": {foo: ["bar"]},
				"foo=bar&foo=baz": {foo: ["bar", "baz"]},
				"foo[]=bar": {foo: ["bar"]},
				"foo[]=bar&foo[]=baz": {foo: ["bar", "baz"]}
			}, function(filters, query) {
				it("must parse " + query, function() {
					parseFilters({foo: "array"}, query).must.eql(filters)
				})
			})

			_.without(_.values(COMPARATOR_SUFFIXES), "").forEach(function(suffix) {
				it(`must ignore foo${suffix}=bar`, function() {
					parseFilters({foo: "array"}, `foo${suffix}=bar`).must.eql({})
				})
			})
		})

		it("must parse name=john&age=42 into arrays", function() {
			parseFilters({
				name: "array",
				age: "array"
			}, "name[]=john&age[]=42").must.eql({
				name: ["john"],
				age: ["42"]
			})
		})

		describe("into range", function() {
			_.each({
				"foo=bar": {foo: new Range("bar", "bar", "[]")},
				"foo=bar&foo=baz": {foo: new Range("baz", "baz", "[]")},
				"foo<<=bar": {foo: new Range(null, "bar", "[)")},
				"foo<<=bar&foo<<=car": {foo: new Range(null, "car", "[)")},
				"foo<=bar": {foo: new Range(null, "bar", "[]")},
				"foo<=bar&foo<=car": {foo: new Range(null, "car", "[]")},
				"foo>>=bar": {foo: new Range("bar", null, "(]")},
				"foo>>=bar&&foo>>=aar": {foo: new Range("aar", null, "(]")},
				"foo>=bar": {foo: new Range("bar", null, "[]")},
				"foo>=bar&foo>=aar": {foo: new Range("aar", null, "[]")},
				"foo[]=bar": {foo: new Range("bar", "bar", "[]")},
				"foo[]=bar&foo[]=baz": {foo: new Range("baz", "baz", "[]")},
				"foo>=bar&foo<=tar": {foo: new Range("bar", "tar", "[]")},
				"foo>=bar&foo<<=tar": {foo: new Range("bar", "tar", "[)")},
				"foo>>=bar&foo<<=tar": {foo: new Range("bar", "tar", "()")},
				"foo>>=bar&foo<=tar": {foo: new Range("bar", "tar", "(]")},
				"foo>=bar&foo<=tar&foo=car": {foo: new Range("car", "car", "[]")}
			}, function(filters, query) {
				it("must parse " + query, function() {
					parseFilters({foo: "range"}, query).must.eql(filters)
				})
			})
		})
	})

	describe(".serializeFilters", function() {
		it("must serialize single", function() {
			serializeFilters({
				foo: "bar"
			}).must.equal("foo=bar")
		})

		it("must serialize array", function() {
			serializeFilters({
				foo: ["bar", "baz"]
			}).must.equal("foo%5B%5D=bar&foo%5B%5D=baz")
		})

		it("must serialize inclusive-inclusive range", function() {
			serializeFilters({
				foo: new Range("bar", "baz", "[]")
			}).must.equal("foo%3E=bar&foo%3C=baz")
		})

		it("must serialize exclusive-inclusive range", function() {
			serializeFilters({
				foo: new Range("bar", "baz", "(]")
			}).must.equal("foo%3E%3E=bar&foo%3C=baz")
		})

		it("must serialize inclusive-exclusive range", function() {
			serializeFilters({
				foo: new Range("bar", "baz", "[)")
			}).must.equal("foo%3E=bar&foo%3C%3C=baz")
		})

		it("must serialize exclusive-exclusive range", function() {
			serializeFilters({
				foo: new Range("bar", "baz", "()")
			}).must.equal("foo%3E%3E=bar&foo%3C%3C=baz")
		})

		it("must serialize point range", function() {
			serializeFilters({
				foo: new Range("bar", "bar", "[]")
			}).must.equal("foo=bar")
		})

		it("must serialize point range with exclusive left-bound", function() {
			serializeFilters({
				foo: new Range("bar", "bar", "(]")
			}).must.equal("foo%3E%3E=bar&foo%3C=bar")
		})

		it("must serialize point range with exclusive right-bound", function() {
			serializeFilters({
				foo: new Range("bar", "bar", "[)")
			}).must.equal("foo%3E=bar&foo%3C%3C=bar")
		})

		it("must serialize point range with exclusive bounds", function() {
			serializeFilters({
				foo: new Range("bar", "bar", "()")
			}).must.equal("foo%3E%3E=bar&foo%3C%3C=bar")
		})

		it("must serialize open-inclusive range with null", function() {
			serializeFilters({
				foo: new Range(null, "baz", "[]")
			}).must.equal("foo%3C=baz")
		})

		it("must serialize open-inclusive range with -Infinity", function() {
			serializeFilters({
				foo: new Range(-Infinity, "baz", "[]")
			}).must.equal("foo%3C=baz")
		})

		it("must serialize inclusive-open range with null", function() {
			serializeFilters({
				foo: new Range("bar", null, "[]")
			}).must.equal("foo%3E=bar")
		})

		it("must serialize inclusive-open range with Infinity", function() {
			serializeFilters({
				foo: new Range("bar", Infinity, "[]")
			}).must.equal("foo%3E=bar")
		})

		it("must not serialize open range with null", function() {
			serializeFilters({
				foo: new Range(null, null, "[]")
			}).must.equal("")
		})

		it("must not serialize open range with Infinity", function() {
			serializeFilters({
				foo: new Range(-Infinity, Infinity, "[]")
			}).must.equal("")
		})
	})
})

function parseFilters(spec, query) {
	return Filtering.parseFilters(spec, Qs.parse(query))
}

function serializeFilters(filters) {
	return Qs.stringify(Filtering.serializeFilters(filters), {
		arrayFormat: "brackets"
	})
}
