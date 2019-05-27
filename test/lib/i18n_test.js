var formatDate = require("root/lib/i18n").formatDate
var formatDateTime = require("root/lib/i18n").formatDateTime

describe("I18n", function() {
	describe(".formatDate", function() {
		describe("iso", function() {
			it("must format time in local time", function() {
				var time = new Date(2015, 5, 18, 13, 37, 42, 666)
				formatDate("iso", time).must.equal("2015-06-18")
			})

			it("must format time with leading zeros", function() {
				formatDate("iso", new Date(666, 5, 1)).must.equal("0666-06-01")
			})
		})

		describe("numeric", function() {
			it("must format time in local time", function() {
				var time = new Date(2015, 5, 18, 13, 37, 42, 666)
				formatDate("numeric", time).must.equal("18.06.2015")
			})

			it("must format time with leading zeros expect on date", function() {
				formatDate("numeric", new Date(666, 5, 1)).must.equal("1.06.0666")
			})
		})
	})

	describe(".formatDateTime", function() {
		describe("numeric", function() {
			it("must format date in local time", function() {
				var time = new Date(2015, 5, 18, 13, 37, 42, 666)
				formatDateTime("numeric", time).must.equal("18.06.2015\xa013:37")
			})
		})
	})
})
