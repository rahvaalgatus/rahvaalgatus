var _ = require("./underscore")
var Sqlite3 = require("better-sqlite3")
var {Sql} = require("sqlate")
var Perf = require("perf_hooks").performance
var SqliteError = require("./sqlite_error")
var MediaType = require("medium-type")
var sql = require("sqlate")
var lastQueryId = 0

module.exports = function(path, opts) {
	var sqlite = new Sqlite3(path, {fileMustExist: opts == null || !opts.create})
	sqlite.pragma("foreign_keys = ON")
	sqlite.pragma("journal_mode = WAL")
	sqlite.pragma("busy_timeout = 5000")

	var db = execute.bind(null, sqlite, {verbose: opts && opts.verbose})
	db.pragma = sqlite.pragma.bind(sqlite)

	db.prepare = function(sql) {
		return new Statement(sqlite.prepare(sql), {verbose: opts && opts.verbose})
	}

	db.transact = transactSync.bind(null, db)
	db.batch = sqlite.exec.bind(sqlite)
	db.close = sqlite.close.bind(sqlite)
	return db
}

function Statement(statement, opts) {
	this.statement = statement
	this.verbose = opts && opts.verbose
}

Statement.prototype.__defineGetter__("reader", function() {
	return this.statement.reader
})

Statement.prototype.all = function(params) {
	var fn = this.statement.all.bind(this.statement, params.map(serialize))
	try { return this.verbose ? profile(this.statement, fn) : fn() }
	catch (e) { throw e instanceof Sqlite3.SqliteError ? new SqliteError(e) : e }
}

Statement.prototype.get = function(params) {
	var fn = this.statement.get.bind(this.statement, params.map(serialize))
	try { return this.verbose ? profile(this.statement, fn) : fn() }
	catch (e) { throw e instanceof Sqlite3.SqliteError ? new SqliteError(e) : e }
}

Statement.prototype.run = function(params) {
	var fn = this.statement.run.bind(this.statement, params.map(serialize))
	try { return this.verbose ? profile(this.statement, fn) : fn() }
	catch (e) { throw e instanceof Sqlite3.SqliteError ? new SqliteError(e) : e }
}

Statement.prototype.iterate = function(params) {
	try { return this.statement.iterate(params.map(serialize)) }
	catch (e) { throw e instanceof Sqlite3.SqliteError ? new SqliteError(e) : e }
}

function execute(sqlite, opts, sql) {
	if (!(sql instanceof Sql)) throw new TypeError("Not Sql: " + sql)

	// Better-Sqlite3 throws if you use `all` on a statement that doesn't return
	// anything.
	var statement = new Statement(sqlite.prepare(String(sql)), opts)
	var params = sql.parameters
	return statement.reader ? statement.all(params) : statement.run(params)
}

function transactSync(sqlite, fn) {
	sqlite(sql`SAVEPOINT transacting`)
	try { return fn() }
	catch (err) { sqlite(sql`ROLLBACK TO transacting`); throw err }
	finally { sqlite(sql`RELEASE transacting`) }
}

function serialize(value) {
	if (typeof value == "boolean") return Number(value)
	if (value instanceof Date) return value.toISOString()
	if (value instanceof MediaType) return value.toString()
	return value
}

function trimSql(text) {
	text = _.outdent(text)
  text = text.replace(/^\n/, "")
  text = text.replace(/\n$/, "")
  return text
}

function profile(statement, query) {
	var id = ++lastQueryId
	var now = Perf.now()

	try { return query() } finally { console.warn(
		"Query #%d took %sms:\n%s",
		id,
		(Perf.now() - now).toFixed(3),
		trimSql(statement.source).replace(/^/gm, "\t")
	) }
}
