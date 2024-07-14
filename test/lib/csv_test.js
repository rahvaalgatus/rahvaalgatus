var Csv = require("root/lib/csv")

describe("Csv", function() {
	describe(".serialize", function() {
		it("must serialize undefined as empty", function() {
			Csv.serialize([0, undefined, 2]).must.equal("0,,2")
		})

		it("must serialize null as empty", function() {
			Csv.serialize([0, null, 2]).must.equal("0,,2")
		})

		it("must serialize booleans", function() {
			Csv.serialize([true, false]).must.equal("true,false")
		})

		it("must serialize numbers", function() {
			Csv.serialize([-1, 0, 1]).must.equal("-1,0,1")
		})

		it("must serialize strings", function() {
			Csv.serialize(["hello", "world"]).must.equal("hello,world")
		})

		it("must serialize strings with embedded spaces", function() {
			Csv.serialize(["hello, ", "world"]).must.equal("\"hello, \",world")
		})

		it("must serialize strings with embedded newlines", function() {
			Csv.serialize(["hello\n", "world"]).must.equal("\"hello\n\",world")
		})

		it("must serialize strings with embedded carriage returns", function() {
			Csv.serialize(["hello\r", "world"]).must.equal("\"hello\r\",world")
		})
	})
})
