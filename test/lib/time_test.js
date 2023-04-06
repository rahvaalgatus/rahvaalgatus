var Time = require("root/lib/time")
var demand = require("must")

describe("Time", function() {
	describe(".parseIsoDate", function() {
		it("must parse ISO 8601 date string", function() {
			var time = Time.parseIsoDate("2015-06-18")
			time.must.eql(new Date(2015, 5, 18))
		})

		it("must return null given an invalid date", function() {
			demand(Time.parseIsoDate("2015-06-18Z")).be.null()
		})
	})

	describe(".parseIsoDateTime", function() {
		it("must parse ISO 8601 date-time string in local time", function() {
			var time = Time.parseIsoDateTime("2015-06-18T13:37:42")
			time.must.eql(new Date(2015, 5, 18, 13, 37, 42))
		})

		it("must parse ISO 8601 date-time string with milliseconds in local time",
			function() {
			var time = Time.parseIsoDateTime("2015-06-18T13:37:42.666")
			time.must.eql(new Date(2015, 5, 18, 13, 37, 42, 666))
		})

		it("must parse ISO 8601 date-time string in UTC", function() {
			var time = Time.parseIsoDateTime("2015-06-18T13:37:42Z")
			time.must.eql(new Date(Date.UTC(2015, 5, 18, 13, 37, 42)))
		})

		it("must return null given an invalid date-time", function() {
			demand(Time.parseIsoDateTime("2015-06-18T13:37:42XYZ")).be.null()
		})
	})
})
