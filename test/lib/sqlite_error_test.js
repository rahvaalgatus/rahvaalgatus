var SqliteError = require("root/lib/sqlite_error")

describe("SqliteError", function() {
	describe("new", function() {
		it("must parse SQLITE_CONSTRAINT with CHECK", function() {
			var msg = "SQLITE_CONSTRAINT: CHECK constraint failed: comments_title"
			var sqlite = new Error(msg)
			sqlite.code = "SQLITE_CONSTRAINT"
			sqlite.errno = 19

			var err = new SqliteError(sqlite)
			err.code.must.equal("constraint")
			err.type.must.equal("check")
			err.constraint.must.equal("comments_title")
		})

		it("must parse SQLITE_CONSTRAINT with UNIQUE compound primary key",
			function() {
			var msg = "SQLITE_CONSTRAINT: UNIQUE constraint failed: models.parent_id, models.country, models.personal_id"
			var sqlite = new Error(msg)
			sqlite.code = "SQLITE_CONSTRAINT"
			sqlite.errno = 19

			var err = new SqliteError(sqlite)
			err.code.must.equal("constraint")
			err.type.must.equal("unique")
			err.table.must.equal("models")
			err.columns.must.eql(["parent_id", "country", "personal_id"])
		})

		it("must parse SQLITE_CONSTRAINT with UNIQUE column", function() {
			var msg = "SQLITE_CONSTRAINT: UNIQUE constraint failed: models.email"
			var sqlite = new Error(msg)
			sqlite.code = "SQLITE_CONSTRAINT"
			sqlite.errno = 19

			var err = new SqliteError(sqlite)
			err.code.must.equal("constraint")
			err.type.must.equal("unique")
			err.table.must.equal("models")
			err.columns.must.eql(["email"])
		})

		it("must parse SQLITE_CONSTRAINT with UNIQUE index", function() {
			var msg = "SQLITE_CONSTRAINT: UNIQUE constraint failed: index 'emails'"
			var sqlite = new Error(msg)
			sqlite.code = "SQLITE_CONSTRAINT"
			sqlite.errno = 19

			var err = new SqliteError(sqlite)
			err.code.must.equal("constraint")
			err.type.must.equal("unique")
			err.index.must.equal("emails")
		})
	})
})
