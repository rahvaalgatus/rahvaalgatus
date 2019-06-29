var Sqlite3 = require("sqlite3")
var Sql = require("sqlate").Sql
var SqliteError = require("./sqlite_error")

module.exports = function(path) {
	var sqlite = new Sqlite3.Database(path, Sqlite3.OPEN_READWRITE)
	sqlite.serialize()

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
	return value
}

function isSqliteError(err) { return /^SQLITE_/.test(err.code) }
function parseError(e) { return isSqliteError(e) ? new SqliteError(e) : e}
