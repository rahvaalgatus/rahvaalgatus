var _ = require("lodash")
var formatDate = require("root/lib/i18n").formatDate
var formatDateTime = require("root/lib/i18n").formatDateTime
var formatBytes = require("root/lib/i18n").formatBytes

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

	describe(".formatBytes", function() {
		_.each({
			0: "0B",
			1: "1B",
			16: "16B",
			1024: "1KiB",
			2048: "2KiB",
			2560: "2.5KiB",
			15360: "15KiB",
			65536: "64KiB",
			[Math.pow(2, 10)]: "1KiB",
			[10 * Math.pow(2, 10)]: "10KiB",
			[Math.pow(2, 20)]: "1MiB",
			[10 * Math.pow(2, 20)]: "10MiB",
			[Math.pow(2, 30)]: "1GiB",
			[10 * Math.pow(2, 30)]: "10GiB",
			[Math.pow(2, 40)]: "1TiB",
			[10 * Math.pow(2, 40)]: "10TiB",
			[Math.pow(2, 50)]: "1PiB",
			[10 * Math.pow(2, 50)]: "10PiB",
			[Math.pow(2, 60)]: "1EiB",
			[10 * Math.pow(2, 60)]: "10EiB",
			[Math.pow(2, 70)]: "1ZiB",
			[10 * Math.pow(2, 70)]: "10ZiB",
			[Math.pow(2, 80)]: "1YiB",
			[10 * Math.pow(2, 80)]: "10YiB",
			[Math.pow(2, 90)]: "1024YiB",
		}, function(string, bytes) {
			it(`must format ${bytes} bytes as ${string}`, function() {
				formatBytes(Number(bytes)).must.equal(string)
			})
		})
	})
})
