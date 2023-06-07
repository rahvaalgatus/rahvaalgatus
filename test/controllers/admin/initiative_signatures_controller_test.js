var Qs = require("qs")
var Config = require("root").config
var ValidUser = require("root/test/valid_user")
var ValidInitiative = require("root/test/valid_initiative")
var ValidSignature = require("root/test/valid_signature")
var ValidCitizenosSignature = require("root/test/valid_citizenos_signature")
var Csv = require("root/lib/csv")
var usersDb = require("root/db/users_db")
var initiativesDb = require("root/db/initiatives_db")
var signaturesDb = require("root/db/initiative_signatures_db")
var citizenosSignaturesDb =
	require("root/db/initiative_citizenos_signatures_db")
var CSV_TYPE = "text/csv; charset=utf-8"

describe("AdminInitiativeSignaturesController", function() {
	require("root/test/adm")()
	require("root/test/db")()
	require("root/test/time")(Date.UTC(2015, 5, 18))
	require("root/test/fixtures").csrf()

	describe("GET /", function() {
		require("root/test/fixtures").user({
			country: Config.adminPersonalIds[0].slice(0, 2),
			personal_id: Config.adminPersonalIds[0].slice(2)
		})

		it("must respond", function*() {
			var res = yield this.request("/signatures")
			res.statusCode.must.equal(200)
			res.headers["content-type"].must.equal("text/html; charset=utf-8")
		})
	})

	describe(`GET / for ${CSV_TYPE}`, function() {
		require("root/test/fixtures").user({
			country: Config.adminPersonalIds[0].slice(0, 2),
			personal_id: Config.adminPersonalIds[0].slice(2)
		})

		beforeEach(function() { this.author = usersDb.create(new ValidUser) })

		it("must respond with CSV header if no signatures", function*() {
			var res = yield this.request("/signatures.csv")
			res.statusCode.must.equal(200)
			res.headers["content-type"].must.equal(CSV_TYPE)

			res.body.must.equal([
				"date",
				"initiative_uuid",
				"initiative_destination",
				"sex",
				"age_range",
				"method",
				"location"
			].join(",") + "\n")
		})

		it("must respond with CSV of anonymized signatures", function*() {
			var initiativeA = initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				phase: "sign"
			}))

			var initiativeB = initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				phase: "parliament"
			}))

			citizenosSignaturesDb.create([
				new ValidCitizenosSignature({
					initiative_uuid: initiativeA.uuid,
					created_at: new Date(2010, 5, 18),
					personal_id: "37006180338"
				}),

				new ValidCitizenosSignature({
					initiative_uuid: initiativeB.uuid,
					created_at: new Date(2011, 6, 19),
					personal_id: "48006180338"
				})
			])

			signaturesDb.create([
				new ValidSignature({
					initiative_uuid: initiativeA.uuid,
					created_at: new Date(2012, 7, 20),
					personal_id: "39006180338"
				}),

				new ValidSignature({
					initiative_uuid: initiativeB.uuid,
					created_at: new Date(2013, 8, 21),
					personal_id: "60006180338"
				})
			])

			var res = yield this.request("/signatures.csv?" + Qs.stringify({
				from: "2010-01-01"
			}))

			res.statusCode.must.equal(200)
			res.headers["content-type"].must.equal(CSV_TYPE)

			var lines = res.body.trimEnd().split("\n")

			lines[0].must.equal([
				"date",
				"initiative_uuid",
				"initiative_destination",
				"sex",
				"age_range",
				"method",
				"location"
			].join(","))

			lines.slice(1).sort().must.eql([
				Csv.serialize([
					"2010-06-18",
					initiativeA.uuid,
					"parliament",
					"male",
					"35–44",
					"",
					""
				]),

				Csv.serialize([
					"2011-07-19",
					initiativeB.uuid,
					"parliament",
					"female",
					"25–34",
					"",
					""
				]),

				Csv.serialize([
					"2012-08-20",
					initiativeA.uuid,
					"parliament",
					"male",
					"18–24",
					"id-card",
					""
				]),

				Csv.serialize([
					"2013-09-21",
					initiativeB.uuid,
					"parliament",
					"female",
					"< 16",
					"id-card",
					""
				])
			])
		})
	})
})
