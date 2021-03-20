var SqliteError = require("root/lib/sqlite_error")
var ValidAuthentication = require("root/test/valid_authentication")
var db = require("root/db/authentications_db")

describe("AuthenticationsDb", function() {
	require("root/test/db")()

	describe(".create", function() {
		it("must permit duplicate country and personal ids", function*() {
			yield db.create(new ValidAuthentication({
				country: "EE",
				personal_id: "38706181337"
			}))

			yield db.create(new ValidAuthentication({
				country: "EE",
				personal_id: "38706181337"
			}))
		})

		it("must throw given duplicate tokens", function*() {
			var auth = yield db.create(new ValidAuthentication)

			var err
			try { yield db.create(new ValidAuthentication({token: auth.token})) }
			catch (ex) { err = ex }
			err.must.be.an.error(SqliteError)
			err.code.must.equal("constraint")
			err.type.must.equal("unique")
			err.columns.must.eql(["token"])
		})

		it("must throw given longer country", function*() {
			var err
			try { yield db.create(new ValidAuthentication({country: "EST"})) }
			catch (ex) { err = ex }
			err.must.be.an.error(SqliteError)
			err.code.must.equal("constraint")
			err.type.must.equal("check")
			err.constraint.must.equal("authentications_country_length")
		})

		it("must throw given lowercase country", function*() {
			var err
			try { yield db.create(new ValidAuthentication({country: "ee"})) }
			catch (ex) { err = ex }
			err.must.be.an.error(SqliteError)
			err.code.must.equal("constraint")
			err.type.must.equal("check")
			err.constraint.must.equal("authentications_country_uppercase")
		})
	})
})
