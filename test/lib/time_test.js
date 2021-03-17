var Time = require("root/lib/time")

describe("Time", function() {
	describe(".parseIsoDate", function() {
		it("must parse ISO 8601 date string", function() {
			var time = Time.parseIsoDate("2015-06-18")
			time.must.eql(new Date(2015, 5, 18))
		})

		it("must throw given an invalid date", function() {
			var err
			try { Time.parseIsoDate("2015-06-18Z") }
			catch (ex) { err = ex }
			err.must.be.an.error(SyntaxError, /date/i)
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

		it("must throw given an invalid date-time", function() {
			var err
			try { Time.parseIsoDateTime("2015-06-18T13:37:42XYZ") }
			catch (ex) { err = ex }
			err.must.be.an.error(SyntaxError, /time/i)
		})
	})
})
