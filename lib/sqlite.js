var Sqlite3 = require("sqlite3")
var Sql = require("sqlate").Sql
var SqliteError = require("./sqlite_error")
var MediaType = require("medium-type")

module.exports = function(path, mode) {
	if (mode == null) mode = Sqlite3.OPEN_READWRITE
	var sqlite = new Sqlite3.Database(path, mode)
	sqlite.serialize()
	sqlite.run("PRAGMA foreign_keys = ON")
	sqlite.run("PRAGMA busy_timeout = 5000")

	var db = execute.bind(null, sqlite)
	db.all = withSerializedParameters.bind(null, sqlite.all.bind(sqlite))
	db.get = withSerializedParameters.bind(null, sqlite.get.bind(sqlite))
	db.run = withSerializedParameters.bind(null, sqlite.run.bind(sqlite))
	db.batch = sqlite.exec.bind(sqlite)
	return db
}

function execute(sqlite, sql) {
	if (!(sql instanceof Sql)) throw new TypeError("Not Sql: " + sql)

	return new Promise((resolve, reject) => (
		sqlite.all(String(sql), sql.parameters.map(serialize), (err, res) => (
			err ? reject(parseError(err)) : resolve(res)
		))
	))
}

function withSerializedParameters(fn, sql, params, done) {
	fn(sql, params.map(serialize), (err, res) => (
		done(err && parseError(err), res)
	))
}

function serialize(value) {
	if (value instanceof Date) return value.toISOString()
	if (value instanceof MediaType) return value.toString()
	return value
}

function isSqliteError(err) { return /^SQLITE_/.test(err.code) }
function parseError(e) { return isSqliteError(e) ? new SqliteError(e) : e}
