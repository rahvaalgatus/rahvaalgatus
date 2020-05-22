var SqliteError = require("root/lib/sqlite_error")
var db = require("root/db/signers_db")

describe("SignersDb", function() {
	require("root/test/db")()

	describe(".create", function() {
		it("must throw given duplicate country and personal ids", function*() {
			var attrs = {
				country: "EE",
				personal_id: "38706181337"
			}

			yield db.create(attrs)

			var err
			try { yield db.create(attrs) } catch (ex) { err = ex }
			err.must.be.an.error(SqliteError)
			err.code.must.equal("constraint")
			err.type.must.equal("unique")
			err.columns.must.eql(["country", "personal_id"])
		})

		it("must permit duplicate anonymized personal ids", function*() {
			var attrs = {country: "EE", personal_id: "3870618"}
			yield db.create(attrs)
			yield db.create(attrs)
		})
	})
})
