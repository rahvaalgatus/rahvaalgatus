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

		it("must parse SQLITE_CONSTRAINT with UNIQUE", function() {
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
