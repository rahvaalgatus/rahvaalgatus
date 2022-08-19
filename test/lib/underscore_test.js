var _ = require("root/lib/underscore")

describe("Underscore", function() {
  describe(".assign", function() {
    it("must not pollute __proto__", function() {
      var john = {name: "John"}
      _.assign(john, JSON.parse("{\"__proto__\": {\"age\": 42}}"))
      // eslint-disable-next-line no-proto
      john.__proto__.must.eql({age: 42})
      john.must.not.have.property("age")
      Object.prototype.must.not.have.property("age")
    })
  })

  describe(".merge", function() {
    it("must not pollute __proto__", function() {
      var john = {name: "John"}
      _.merge(john, JSON.parse("{\"__proto__\": {\"age\": 42}}"))
      // eslint-disable-next-line no-proto
      john.__proto__.must.eql({age: 42})
      john.must.not.have.property("age")
      Object.prototype.must.not.have.property("age")
    })
  })
})
