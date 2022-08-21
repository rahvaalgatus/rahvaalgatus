var SqliteError = require("root/lib/sqlite_error")
var sql = require("sqlate")
var sqlite = require("root").sqlite

describe("Sqlite", function() {
	describe("errors", function() {
		beforeEach(function() { sqlite(sql`BEGIN`) })
		afterEach(function() { sqlite(sql`ROLLBACK`) })

		it("must parse foreign key constraint error", function() {
			sqlite(sql`CREATE TEMPORARY TABLE cars (
				id INTEGER PRIMARY KEY NOT NULL,
				name TEXT NOT NULL
			)`)

			sqlite(sql`CREATE TEMPORARY TABLE drivers (
				name TEXT NOT NULL,
				car_id INTEGER NOT NULL,

				FOREIGN KEY (car_id) REFERENCES cars (id)
			)`)

			sqlite(sql`INSERT INTO cars (name) VALUES ('Lada')`)
			sqlite(sql`INSERT INTO drivers (name, car_id) VALUES ('John', 1)`)

			var err
			try { sqlite(sql`DELETE FROM cars`) } catch (ex) { err = ex }
			err.must.be.an.error(SqliteError, "FOREIGN KEY constraint failed")
			err.code.must.equal("constraint")
			err.type.must.equal("foreign_key")
		})

		it("must parse check constraint error", function() {
			sqlite(sql`CREATE TEMPORARY TABLE drivers (
				name TEXT NOT NULL,

				CONSTRAINT name_length CHECK (length(name) > 0)
			)`)

			var err
			try { sqlite(sql`INSERT INTO drivers (name) VALUES ('')`) }
			catch (ex) { err = ex }
			err.must.be.an.error(SqliteError, "CHECK constraint failed: name_length")
			err.code.must.equal("constraint")
			err.type.must.equal("check")
			err.constraint.must.equal("name_length")
		})

		it("must parse unique column constraint error", function() {
			sqlite(sql`CREATE TEMPORARY TABLE drivers (
				name TEXT NOT NULL UNIQUE
			)`)

			sqlite(sql`INSERT INTO drivers (name) VALUES ('John')`)

			var err
			try { sqlite(sql`INSERT INTO drivers (name) VALUES ('John')`) }
			catch (ex) { err = ex }

			err.must.be.an.error(
				SqliteError,
				"UNIQUE constraint failed: drivers.name"
			)

			err.code.must.equal("constraint")
			err.type.must.equal("unique")
			err.table.must.equal("drivers")
			err.columns.must.eql(["name"])
		})

		it("must parse unique columns constraint error", function() {
			sqlite(sql`CREATE TEMPORARY TABLE drivers (
				name TEXT NOT NULL,
				age INTEGER NOT NULL,

				UNIQUE (name, age)
			)`)

			sqlite(sql`INSERT INTO drivers (name, age) VALUES ('John', 13)`)

			var err
			try { sqlite(sql`INSERT INTO drivers (name, age) VALUES ('John', 13)`) }
			catch (ex) { err = ex }

			err.must.be.an.error(
				SqliteError,
				"UNIQUE constraint failed: drivers.name, drivers.age"
			)

			err.code.must.equal("constraint")
			err.type.must.equal("unique")
			err.table.must.equal("drivers")
			err.columns.must.eql(["name", "age"])
		})

		it("must parse primary key unique constraint error", function() {
			sqlite(sql`CREATE TEMPORARY TABLE drivers (
				id INTEGER PRIMARY KEY NOT NULL,
				name TEXT NOT NULL
			)`)

			sqlite(sql`INSERT INTO drivers (id, name) VALUES (42, 'John')`)

			var err
			try { sqlite(sql`INSERT INTO drivers (id, name) VALUES (42, 'Mary')`) }
			catch (ex) { err = ex }

			err.must.be.an.error(SqliteError, "UNIQUE constraint failed: drivers.id")
			err.code.must.equal("constraint")
			err.type.must.equal("unique")
			err.table.must.equal("drivers")
			err.columns.must.eql(["id"])
		})

		it("must parse unique index constraint error", function() {
			sqlite(sql`CREATE TEMPORARY TABLE drivers (
				name TEXT
			)`)

			sqlite(sql`
				CREATE UNIQUE INDEX index_drivers_on_name
				ON drivers (COALESCE(name, ''))
			`)

			sqlite(sql`INSERT INTO drivers (name) VALUES ('John')`)

			var err
			try { sqlite(sql`INSERT INTO drivers (name) VALUES ('John')`) }
			catch (ex) { err = ex }

			err.must.be.an.error(
				SqliteError,
				"UNIQUE constraint failed: index 'index_drivers_on_name'"
			)

			err.code.must.equal("constraint")
			err.type.must.equal("unique")
			err.index.must.equal("index_drivers_on_name")
		})

		it("must parse unique index constraint error with compund column",
			function() {
			sqlite(sql`CREATE TEMPORARY TABLE drivers (
				name TEXT NOT NULL,
				age INTEGER
			)`)

			sqlite(sql`
				CREATE UNIQUE INDEX index_drivers_on_name_and_age
				ON drivers (name, COALESCE(age, ''))
			`)

			sqlite(sql`INSERT INTO drivers (name, age) VALUES ('John', 13)`)

			var err
			try { sqlite(sql`INSERT INTO drivers (name, age) VALUES ('John', 13)`) }
			catch (ex) { err = ex }

			err.must.be.an.error(
				SqliteError,
				"UNIQUE constraint failed: index 'index_drivers_on_name_and_age'"
			)

			err.code.must.equal("constraint")
			err.type.must.equal("unique")
			err.index.must.equal("index_drivers_on_name_and_age")
		})
	})
})
