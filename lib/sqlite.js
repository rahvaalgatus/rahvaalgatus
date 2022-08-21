var Sqlite3 = require("better-sqlite3")
var {Sql} = require("sqlate")
var SqliteError = require("./sqlite_error")
var MediaType = require("medium-type")

module.exports = function(path, opts) {
	var sqlite = new Sqlite3(path, {fileMustExist: opts == null || !opts.create})
	sqlite.pragma("foreign_keys = ON")
	sqlite.pragma("busy_timeout = 5000")

	var db = execute.bind(null, sqlite)
	db.pragma = sqlite.pragma.bind(sqlite)
	db.prepare = function(sql) { return new Statement(sqlite.prepare(sql)) }
	db.batch = sqlite.exec.bind(sqlite)
	db.close = sqlite.close.bind(sqlite)
	return db
}

function Statement(statement) {
	this.statement = statement
}

Statement.prototype.__defineGetter__("reader", function() {
	return this.statement.reader
})

Statement.prototype.all = function(params) {
	try { return this.statement.all(params.map(serialize)) }
	catch (e) { throw e instanceof Sqlite3.SqliteError ? new SqliteError(e) : e }
}

Statement.prototype.get = function(params) {
	try { return this.statement.get(params.map(serialize)) }
	catch (e) { throw e instanceof Sqlite3.SqliteError ? new SqliteError(e) : e }
}

Statement.prototype.run = function(params) {
	try { return this.statement.run(params.map(serialize)) }
	catch (e) { throw e instanceof Sqlite3.SqliteError ? new SqliteError(e) : e }
}

Statement.prototype.iterate = function(params) {
	try { return this.statement.iterate(params.map(serialize)) }
	catch (e) { throw e instanceof Sqlite3.SqliteError ? new SqliteError(e) : e }
}

function execute(sqlite, sql) {
	if (!(sql instanceof Sql)) throw new TypeError("Not Sql: " + sql)

	// Better-Sqlite3 throws if you use `all` on a statement that doesn't return
	// anything.
	var statement = new Statement(sqlite.prepare(String(sql)))
	var params = sql.parameters
	return statement.reader ? statement.all(params) : statement.run(params)
}

function serialize(value) {
	if (typeof value == "boolean") return Number(value)
	if (value instanceof Date) return value.toISOString()
	if (value instanceof MediaType) return value.toString()
	return value
}
