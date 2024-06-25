var _ = require("root/lib/underscore")
var Config = require("root").config
var ValidSignatureTrustee =
	require("root/test/valid_initiative_signature_trustee")
var signatureTrusteesDb = require("root/db/initiative_signature_trustees_db")
var sql = require("sqlate")
var {serializePersonalId} = require("root/lib/user")
var LOCAL_GOVERNMENTS = require("root/lib/local_governments")

describe("AdminDestinationsController", function() {
	require("root/test/adm")()
	require("root/test/db")()
	require("root/test/time")()
	require("root/test/email")()
	require("root/test/fixtures").csrf()

	describe("GET /", function() {
		require("root/test/fixtures").admin()

		it("must render", function*() {
			var res = yield this.request("/destinations")
			res.statusCode.must.equal(200)
			res.headers["content-type"].must.equal("text/html; charset=utf-8")
		})
	})

	Object.keys(LOCAL_GOVERNMENTS).forEach(function(dest) {
		describe(`GET /${dest}`, function() {
			require("root/test/fixtures").admin()

			it("must render", function*() {
				var res = yield this.request("/destinations/" + dest)
				res.statusCode.must.equal(200)
				res.headers["content-type"].must.equal("text/html; charset=utf-8")
			})
		})
	})

	describe("GET /nonexistent", function() {
		require("root/test/fixtures").admin()

		it("must respond with 404 ", function*() {
			var res = yield this.request("/destinations/nonexistent")
			res.statusCode.must.equal(404)
			res.headers["content-type"].must.equal("text/plain")
		})
	})

	describe("POST /:destination/signature-trustees", function() {
		require("root/test/fixtures").admin()
		require("root/test/time")()

		it("must create new signature trustee", function*() {
			var res = yield this.request("/destinations/tallinn/signature-trustees", {
				method: "POST",
				form: {"personal-id": "38706181337", name: "John Smith"}
			})

			res.statusCode.must.equal(302)
			res.statusMessage.must.equal("Signature Trustee Created")

			res.headers.location.must.equal(
				"/destinations/tallinn#signature-trustees"
			)

			var trustees = signatureTrusteesDb.search(sql`
				SELECT * FROM initiative_signature_trustees
			`)

			trustees.must.eql([new ValidSignatureTrustee({
				id: trustees[0].id,
				initiative_destination: "tallinn",
				country: "EE",
				personal_id: "38706181337",
				name: "John Smith",
				created_by_id: this.user.id
			})])
		})

		it("must err given personal id of another admin", function*() {
			Config.admins[serializePersonalId({
				country: "EE",
				personal_id: "38706181337"
			})] = []

			var res = yield this.request("/destinations/tallinn/signature-trustees", {
				method: "POST",
				form: {"personal-id": "38706181337", name: "John Smith"}
			})

			res.statusCode.must.equal(409)
			res.statusMessage.must.equal("Admin Cannot Be Signature Trustee")
			res.headers["content-type"].must.equal("text/plain")

			signatureTrusteesDb.search(sql`
				SELECT * FROM initiative_signature_trustees
			`).must.be.empty()
		})
	})

	describe("DELETE /:destination/signature-trustees/:id", function() {
		require("root/test/fixtures").admin()
		require("root/test/time")()

		it("must delete signature trustee", function*() {
			var trustee = signatureTrusteesDb.create(new ValidSignatureTrustee({
				initiative_destination: "tallinn",
				created_by_id: this.user.id
			}))

			var path = "/destinations/tallinn/signature-trustees/" + trustee.id
			var res = yield this.request(path, {method: "DELETE"})

			res.statusCode.must.equal(302)
			res.statusMessage.must.equal("Signature Trustee Deleted")

			res.headers.location.must.equal(
				"/destinations/tallinn#signature-trustees"
			)

			signatureTrusteesDb.search(sql`
				SELECT * FROM initiative_signature_trustees
			`).must.eql([_.assign(trustee, {
				deleted_at: new Date,
				deleted_by_id: this.user.id
			})])
		})

		it("must not delete other signature trustees", function*() {
			var otherTrustee = signatureTrusteesDb.create(new ValidSignatureTrustee({
				initiative_destination: "tallinn",
				created_by_id: this.user.id
			}))

			var trustee = signatureTrusteesDb.create(new ValidSignatureTrustee({
				initiative_destination: "tallinn",
				created_by_id: this.user.id
			}))

			var path = "/destinations/tallinn/signature-trustees/" + trustee.id
			var res = yield this.request(path, {method: "DELETE"})

			res.statusCode.must.equal(302)
			res.statusMessage.must.equal("Signature Trustee Deleted")

			signatureTrusteesDb.search(sql`
				SELECT * FROM initiative_signature_trustees
			`).must.eql([otherTrustee, _.assign(trustee, {
				deleted_at: new Date,
				deleted_by_id: this.user.id
			})])
		})
	})
})
