var Crypto = require("crypto")
var SqliteError = require("root/lib/sqlite_error")
var ValidUser = require("root/test/valid_user")
var db = require("root/db/users_db")

describe("UsersDb", function() {
	require("root/test/db")()

	describe(".create", function() {
		it("must throw given duplicate country and personal ids", function*() {
			var attrs = {country: "EE", personal_id: "38706181337"}
			yield db.create(new ValidUser(attrs))

			var err
			try { yield db.create(new ValidUser(attrs)) } catch (ex) { err = ex }
			err.must.be.an.error(SqliteError)
			err.code.must.equal("constraint")
			err.type.must.equal("unique")
			err.columns.must.eql(["country", "personal_id"])
		})

		it("must throw given shorter country", function*() {
			var err
			try { yield db.create(new ValidUser({country: "E"})) }
			catch (ex) { err = ex }
			err.must.be.an.error(SqliteError)
			err.code.must.equal("constraint")
			err.type.must.equal("check")
			err.constraint.must.equal("users_country_length")
		})

		it("must throw given longer country", function*() {
			var err
			try { yield db.create(new ValidUser({country: "EST"})) }
			catch (ex) { err = ex }
			err.must.be.an.error(SqliteError)
			err.code.must.equal("constraint")
			err.type.must.equal("check")
			err.constraint.must.equal("users_country_length")
		})

		it("must throw given lowercase country", function*() {
			var err
			try {
				yield db.create(new ValidUser({country: "ee"}))
			} catch (ex) { err = ex }
			err.must.be.an.error(SqliteError)
			err.code.must.equal("constraint")
			err.type.must.equal("check")
			err.constraint.must.equal("users_country_uppercase")
		})

		it("must throw given empty personal_id", function*() {
			var err
			try {
				yield db.create(new ValidUser({personal_id: ""}))
			} catch (ex) { err = ex }
			err.must.be.an.error(SqliteError)
			err.code.must.equal("constraint")
			err.type.must.equal("check")
			err.constraint.must.equal("users_personal_id_length")
		})

		it("must throw given country without personal_id", function*() {
			var err
			try {
				yield db.create(new ValidUser({
					country: "EE",
					personal_id: null
				}))
			} catch (ex) { err = ex }
			err.must.be.an.error(SqliteError)
			err.code.must.equal("constraint")
			err.type.must.equal("check")
			err.constraint.must.equal("users_country_and_personal_id")
		})

		it("must throw given personal_id without country", function*() {
			var err
			try {
				yield db.create(new ValidUser({
					country: null,
					personal_id: "38706181337"
				}))
			} catch (ex) { err = ex }
			err.must.be.an.error(SqliteError)
			err.code.must.equal("constraint")
			err.type.must.equal("check")
			err.constraint.must.equal("users_country_and_personal_id")
		})

		it("must create user without country and personal_id but email",
			function*() {
			yield db.create(new ValidUser({
				country: null,
				personal_id: null,
				email: "user@example.com",
				email_confirmed_at: new Date,
				unconfirmed_email: null
			}))
		})

		it("must create user without country and personal_id but unconfirmed_email",
			function*() {
			yield db.create(new ValidUser({
				country: null,
				personal_id: null,
				email: null,
				unconfirmed_email: "user@example.com",
				email_confirmation_token: Crypto.randomBytes(12)
			}))
		})

		it("must throw given no personal_id nor email", function*() {
			var err
			try {
				yield db.create(new ValidUser({
					country: null,
					personal_id: null,
					email: null,
					unconfirmed_email: null
				}))
			} catch (ex) { err = ex }
			err.must.be.an.error(SqliteError)
			err.code.must.equal("constraint")
			err.type.must.equal("check")
			err.constraint.must.equal("users_personal_id_or_email")
		})

		it("must throw given personal_id without official_name", function*() {
			var err
			try {
				yield db.create(new ValidUser({
					country: "EE",
					personal_id: "38706181337",
					official_name: null
				}))
			} catch (ex) { err = ex }
			err.must.be.an.error(SqliteError)
			err.code.must.equal("constraint")
			err.type.must.equal("check")
			err.constraint.must.equal("users_personal_id_and_official_name")
		})

		it("must throw given official_name without personal_id", function*() {
			var err
			try {
				yield db.create(new ValidUser({
					country: null,
					personal_id: null,
					official_name: "John Smith"
				}))
			} catch (ex) { err = ex }
			err.must.be.an.error(SqliteError)
			err.code.must.equal("constraint")
			err.type.must.equal("check")
			err.constraint.must.equal("users_personal_id_and_official_name")
		})

		it("must throw given empty name", function*() {
			var err
			try { yield db.create(new ValidUser({name: ""})) }
			catch (ex) { err = ex }
			err.must.be.an.error(SqliteError)
			err.code.must.equal("constraint")
			err.type.must.equal("check")
			err.constraint.must.equal("users_name_length")
		})

		it("must throw given empty official_name", function*() {
			var err
			try { yield db.create(new ValidUser({official_name: ""})) }
			catch (ex) { err = ex }
			err.must.be.an.error(SqliteError)
			err.code.must.equal("constraint")
			err.type.must.equal("check")
			err.constraint.must.equal("users_official_name_length")
		})

		it("must throw given email without @-sign", function*() {
			var err
			try {
				yield db.create(new ValidUser({
					email: "user-at-example.com",
					email_confirmed_at: new Date
				}))
			}
			catch (ex) { err = ex }
			err.must.be.an.error(SqliteError)
			err.code.must.equal("constraint")
			err.type.must.equal("check")
			err.constraint.must.equal("users_email_format")
		})

		it("must throw given email with no user", function*() {
			var err
			try {
				yield db.create(new ValidUser({
					email: "@example.com",
					email_confirmed_at: new Date
				}))
			}
			catch (ex) { err = ex }
			err.must.be.an.error(SqliteError)
			err.code.must.equal("constraint")
			err.type.must.equal("check")
			err.constraint.must.equal("users_email_format")
		})

		it("must throw given email with no domain", function*() {
			var err
			try {
				yield db.create(new ValidUser({
					email: "user@",
					email_confirmed_at: new Date
				}))
			}
			catch (ex) { err = ex }
			err.must.be.an.error(SqliteError)
			err.code.must.equal("constraint")
			err.type.must.equal("check")
			err.constraint.must.equal("users_email_format")
		})

		it("must throw given duplicate email", function*() {
			var user = yield db.create(new ValidUser({
				email: "user@example.com",
				email_confirmed_at: new Date
			}))

			var err
			try {
				yield db.create(new ValidUser({
					email: user.email,
					email_confirmed_at: new Date
				}))
			}
			catch (ex) { err = ex }
			err.must.be.an.error(SqliteError)
			err.code.must.equal("constraint")
			err.type.must.equal("unique")
			err.columns.must.eql(["email"])
		})

		it("must throw given unconfirmed_email without @-sign", function*() {
			var err
			try {
				yield db.create(new ValidUser({
					unconfirmed_email: "user-at-example.com",
					email_confirmation_token: Crypto.randomBytes(12)
				}))
			}
			catch (ex) { err = ex }
			err.must.be.an.error(SqliteError)
			err.code.must.equal("constraint")
			err.type.must.equal("check")
			err.constraint.must.equal("users_unconfirmed_email_format")
		})

		it("must throw given unconfirmed_email with no user", function*() {
			var err
			try {
				yield db.create(new ValidUser({
					unconfirmed_email: "@example.com",
					email_confirmation_token: Crypto.randomBytes(12)
				}))
			}
			catch (ex) { err = ex }
			err.must.be.an.error(SqliteError)
			err.code.must.equal("constraint")
			err.type.must.equal("check")
			err.constraint.must.equal("users_unconfirmed_email_format")
		})

		it("must throw given unconfirmed_email with no domain", function*() {
			var err
			try {
				yield db.create(new ValidUser({
					unconfirmed_email: "user@",
					email_confirmation_token: Crypto.randomBytes(12)
				}))
			}
			catch (ex) { err = ex }
			err.must.be.an.error(SqliteError)
			err.code.must.equal("constraint")
			err.type.must.equal("check")
			err.constraint.must.equal("users_unconfirmed_email_format")
		})

		it("must not throw given duplicate unconfirmed_email", function*() {
			var user = yield db.create(new ValidUser({
				unconfirmed_email: "user@example.com",
				email_confirmation_token: Crypto.randomBytes(12)
			}))

			yield db.create(new ValidUser({
				unconfirmed_email: user.unconfirmed_email,
				email_confirmation_token: Crypto.randomBytes(12)
			}))
		})

		it("must not throw given email with email_confirmed_at", function*() {
			yield db.create(new ValidUser({
				email: "user@example.com",
				email_confirmed_at: new Date
			}))
		})

		it("must throw given email without email_confirmed_at", function*() {
			var err
			try {
				yield db.create(new ValidUser({
					email: "user@example.com",
					email_confirmed_at: null
				}))
			}
			catch (ex) { err = ex }
			err.must.be.an.error(SqliteError)
			err.code.must.equal("constraint")
			err.type.must.equal("check")
			err.constraint.must.equal("users_email_confirmed")
		})

		it("must throw given email_confirmed_at without email", function*() {
			var err
			try {
				yield db.create(new ValidUser({
					email: null,
					email_confirmed_at: new Date
				}))
			}
			catch (ex) { err = ex }
			err.must.be.an.error(SqliteError)
			err.code.must.equal("constraint")
			err.type.must.equal("check")
			err.constraint.must.equal("users_email_confirmed")
		})

		it("must not throw given unconfirmed_email without email", function*() {
			yield db.create(new ValidUser({
				unconfirmed_email: "user@example.com",
				email_confirmation_token: Crypto.randomBytes(12)
			}))
		})

		it("must throw given unconfirmed_email without confirmation_token",
			function*() {
			var err
			try {
				yield db.create(new ValidUser({
					unconfirmed_email: "mary@example.com",
					email_confirmation_token: null
				}))
			}
			catch (ex) { err = ex }
			err.must.be.an.error(SqliteError)
			err.code.must.equal("constraint")
			err.type.must.equal("check")
			err.constraint.must.equal("users_unconfirmed_email_token")
		})

		it("must throw given confirmation_token without unconfirmed_email",
			function*() {
			var err
			try {
				yield db.create(new ValidUser({
					unconfirmed_email: null,
					email_confirmation_token: Crypto.randomBytes(12)
				}))
			}
			catch (ex) { err = ex }
			err.must.be.an.error(SqliteError)
			err.code.must.equal("constraint")
			err.type.must.equal("check")
			err.constraint.must.equal("users_unconfirmed_email_token")
		})

		it("must not throw given unidentical email and unconfirmed_email",
			function*() {
			yield db.create(new ValidUser({
				email: "john@example.com",
				email_confirmed_at: new Date,
				unconfirmed_email: "mary@example.com",
				email_confirmation_token: Crypto.randomBytes(12)
			}))
		})

		it("must throw given identical email and unconfirmed_email", function*() {
			var err
			try {
				yield db.create(new ValidUser({
					email: "john@example.com",
					email_confirmed_at: new Date,
					unconfirmed_email: "john@example.com",
					email_confirmation_token: Crypto.randomBytes(12)
				}))
			}
			catch (ex) { err = ex }
			err.must.be.an.error(SqliteError)
			err.code.must.equal("constraint")
			err.type.must.equal("check")
			err.constraint.must.equal("users_email_and_unconfirmed_email_different")
		})

		it("must throw given email_confirmation_token", function*() {
			var user = yield db.create(new ValidUser({
				unconfirmed_email: "user@example.com",
				email_confirmation_token: Crypto.randomBytes(12)
			}))

			var err
			try {
				yield db.create(new ValidUser({
					unconfirmed_email: user.unconfirmed_email,
					email_confirmation_token: user.email_confirmation_token
				}))
			}
			catch (ex) { err = ex }
			err.must.be.an.error(SqliteError)
			err.code.must.equal("constraint")
			err.type.must.equal("unique")
			err.columns.must.eql(["email_confirmation_token"])
		})

		it("must throw given longer language", function*() {
			var err
			try { yield db.create(new ValidUser({language: "est"})) }
			catch (ex) { err = ex }
			err.must.be.an.error(SqliteError)
			err.code.must.equal("constraint")
			err.type.must.equal("check")
			err.constraint.must.equal("users_language_length")
		})

		it("must throw given uppercase language", function*() {
			var err
			try {
				yield db.create(new ValidUser({language: "ET"}))
			} catch (ex) { err = ex }
			err.must.be.an.error(SqliteError)
			err.code.must.equal("constraint")
			err.type.must.equal("check")
			err.constraint.must.equal("users_language_lowercase")
		})
	})
})
