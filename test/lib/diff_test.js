var demand = require("must")
var diff = require("root/lib/diff")

describe("diff", function() {
  it("must return undefined if equal", function() {
    demand(diff("a", "a")).be.undefined()
  })

  it("must return 2nd argument if different", function() {
    diff("a", "b").must.equal("b")
  })

  it("must return 2nd argument if only 1st is an object", function() {
    diff({}, "b").must.equal("b")
  })

  it("must return 2nd argument if only 2nd is an object", function() {
    var obj = {}
    diff("a", obj).must.equal(obj)
  })

  it("must return 2nd argument if different only by type", function() {
    diff(0, "0").must.equal("0")
    diff("0", 0).must.equal(0)
  })

	describe("given arrays", function() {
    it("must return undefined if equal", function() {
      demand(diff([1, 2, 3], [1, 2, 3])).be.undefined()
    })

    it("must return value if different in length", function() {
      diff([1, 2, 3, 4], [1, 2, 3]).must.eql([1, 2, 3])
      diff([1, 2, 3], [1, 2, 3, 4]).must.eql([1, 2, 3, 4])
    })

    it("must return value if different", function() {
      diff([1, 2, 3], [1, 2, 4]).must.eql([1, 2, 4])
    })

    it("must return value if different and null", function() {
      diff([1, 2, 3], [1, 2, null]).must.eql([1, 2, null])
    })

    it("must return undefined if value objects equivalent", function() {
			var a = new Date(1987, 5, 18)
			var b = new Date(1987, 5, 18)
      demand(diff([a], [b])).be.undefined()
    })
	})

  describe("given objects", function() {
    it("must return undefined if equal", function() {
      demand(diff({a: 1}, {a: 1})).be.undefined()
    })

    it("must return values different in 2nd object", function() {
      diff({a: 1, b: 2}, {a: 1, b: 3}).must.eql({b: 3})
    })

    it("must return properties different in 2nd object", function() {
      diff({a: 1}, {b: 3}).must.eql({b: 3})
    })

    it("must return value in 2nd if only 1st nested object", function() {
      diff({a: {}}, {a: null}).must.eql({a: null})
    })

    it("must return value in 2nd if only 2nd nested object", function() {
      diff({a: null}, {a: {b: 1}}).must.eql({a: {b: 1}})
    })

    it("must not return equal nested properties", function() {
      var a = {"1": {a: 1}, "2": {a: 1}}
      var b = {"1": {a: 1}, "2": {a: 2}}
      diff(a, b).must.eql({"2": {a: 2}})
    })

    it("must return nested values different in 2nd object", function() {
      var a = {"1": {a: 1, b: 2}, "2": {a: 1, b: 2}}
      var b = {"1": {a: 1, b: 3}, "2": {a: 1, b: 4}}
      diff(a, b).must.eql({"1": {b: 3}, "2": {b: 4}})
    })

    it("must return nested properties only in 2nd object", function() {
      var a = {"1": {a: 1, b: 2}}
      var b = {"2": {a: 1, b: 3}}
      diff(a, b).must.eql({"2": {a: 1, b: 3}})
    })

    it("must return changes in value objects", function() {
      var date = new Date(1987, 5, 18)
      diff({a: 1, b: new Date(2000, 0, 1)}, {a: 1, b: date}).must.eql({b: date})
    })
  })
})
