var Sql = require("root/lib/sql").Sql
var sql = require("root/lib/sql")

describe("sql", function() {
	it("must parse SQL into placeholders and parameters", function() {
		var s = sql`SELECT * FROM initiatives WHERE id = ${42} AND name = ${"John"}`

		s.must.eql(new Sql(
			"SELECT * FROM initiatives WHERE id = ? AND name = ?",
			[42, "John"]
		))
	})

	it("must parse SQL when interpolating an array", function() {
		var s = sql`SELECT * FROM initiatives WHERE (id, name) = ${[42, "John"]}`

		s.must.eql(new Sql(
			"SELECT * FROM initiatives WHERE (id, name) = (?, ?)",
			[42, "John"]
		))
	})

	it("must parse SQL when interpolating an array only one level", function() {
		var name = ["John", "Smith"]
		var s = sql`SELECT * FROM initiatives WHERE (id, name) = ${[42, name]}`

		s.must.eql(new Sql(
			"SELECT * FROM initiatives WHERE (id, name) = (?, ?)",
			[42, ["John", "Smith"]]
		))
	})
})
