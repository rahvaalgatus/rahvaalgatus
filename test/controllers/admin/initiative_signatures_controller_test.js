var _ = require("root/lib/underscore")
var Qs = require("qs")
var Config = require("root").config
var ValidUser = require("root/test/valid_user")
var ValidInitiative = require("root/test/valid_initiative")
var ValidSignature = require("root/test/valid_signature")
var ValidCitizenosSignature = require("root/test/valid_citizenos_signature")
var Csv = require("root/lib/csv")
var SignaturesController =
	require("root/controllers/admin/initiative_signatures_controller")
var parseHtml = require("root/test/html").parse
var {serializePersonalId} = require("root/lib/user")
var usersDb = require("root/db/users_db")
var initiativesDb = require("root/db/initiatives_db")
var signaturesDb = require("root/db/initiative_signatures_db")
var citizenosSignaturesDb =
	require("root/db/initiative_citizenos_signatures_db")
var CSV_TYPE = "text/csv; charset=utf-8"
var {COLUMNS} = SignaturesController
var {UNRESTRICTED_COLUMNS} = SignaturesController

describe("AdminInitiativeSignaturesController", function() {
	require("root/test/adm")()
	require("root/test/db")()
	require("root/test/time")(Date.UTC(2015, 5, 18))
	require("root/test/fixtures").csrf()

	describe("GET /", function() {
		describe("when admin without signatures permission", function() {
			require("root/test/fixtures").admin()

			it("must respond", function*() {
				var res = yield this.request("/signatures")
				res.statusCode.must.equal(403)
				res.statusMessage.must.equal("No Signatures Permission")
			})
		})

		describe("when admin with signatures permission", function() {
			require("root/test/fixtures").admin({permissions: ["signatures"]})

			it("must respond and enable unrestricted columns", function*() {
				var res = yield this.request("/signatures")
				res.statusCode.must.equal(200)
				res.headers["content-type"].must.equal("text/html; charset=utf-8")

				var dom = parseHtml(res.body)
				var form = dom.querySelector(".options-form")
				var checkboxes = form.querySelectorAll("input[name='columns[]']")
				checkboxes = _.indexBy(checkboxes, (el) => el.value)

				COLUMNS.forEach(function(column) {
					checkboxes[column].disabled.must.equal(
						!UNRESTRICTED_COLUMNS.includes(column)
					)
				})
			})

			it("must respond and enable restricted columns if permitted",
				function*() {
				Config.admins = {[serializePersonalId(this.user)]: [
					"signatures",
					"signatures-with-restricted-columns"
				]}

				var res = yield this.request("/signatures")
				res.statusCode.must.equal(200)
				res.headers["content-type"].must.equal("text/html; charset=utf-8")

				var dom = parseHtml(res.body)
				var form = dom.querySelector(".options-form")
				var checkboxes = form.querySelectorAll("input[name='columns[]']")
				checkboxes = _.indexBy(checkboxes, (el) => el.value)

				COLUMNS.forEach(function(column) {
					checkboxes[column].disabled.must.be.false()
				})
			})
		})
	})

	describe(`GET / for ${CSV_TYPE}`, function() {
		require("root/test/fixtures").admin({permissions: ["signatures"]})

		beforeEach(function() { this.author = usersDb.create(new ValidUser) })

		it("must respond with CSV header if no signatures", function*() {
			var res = yield this.request("/signatures.csv")
			res.statusCode.must.equal(200)
			res.headers["content-type"].must.equal(CSV_TYPE)

			res.body.must.equal([
				"date",
				"initiative_id",
				"initiative_uuid",
				"initiative_title",
				"initiative_destination"
			].join(",") + "\n")
		})

		it("must respond with CSV header if no signatures and restricted columns if permitted", function*() {
			Config.admins = {[serializePersonalId(this.user)]: [
				"signatures",
				"signatures-with-restricted-columns"
			]}

			var res = yield this.request("/signatures.csv")
			res.statusCode.must.equal(200)
			res.headers["content-type"].must.equal(CSV_TYPE)

			res.body.must.equal([
				"date",
				"initiative_id",
				"initiative_uuid",
				"initiative_title",
				"initiative_destination",
				"sex",
				"age_range",
				"method",
				"location"
			].join(",") + "\n")
		})

		it("must respond with CSV of anonymized signatures with restricted columns if permitted", function*() {
			Config.admins = {[serializePersonalId(this.user)]: [
				"signatures",
				"signatures-with-restricted-columns"
			]}

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
				"initiative_id",
				"initiative_uuid",
				"initiative_title",
				"initiative_destination",
				"sex",
				"age_range",
				"method",
				"location"
			].join(","))

			lines.slice(1).sort().must.eql([
				Csv.serialize([
					"2010-06-18",
					initiativeA.id,
					initiativeA.uuid,
					initiativeA.title,
					"parliament",
					"male",
					"35–44",
					"",
					""
				]),

				Csv.serialize([
					"2011-07-19",
					initiativeB.id,
					initiativeB.uuid,
					initiativeB.title,
					"parliament",
					"female",
					"25–34",
					"",
					""
				]),

				Csv.serialize([
					"2012-08-20",
					initiativeA.id,
					initiativeA.uuid,
					initiativeA.title,
					"parliament",
					"male",
					"18–24",
					"id-card",
					""
				]),

				Csv.serialize([
					"2013-09-21",
					initiativeB.id,
					initiativeB.uuid,
					initiativeB.title,
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
