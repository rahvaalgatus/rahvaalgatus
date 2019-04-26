var Sqlite3 = require("sqlite3")
var Sql = require("sqlate").Sql
exports = module.exports = connect
exports.isUniqueError = isUniqueError

function connect(path) {
	var sqlite = new Sqlite3.Database(path, Sqlite3.OPEN_READWRITE)
	sqlite.serialize()

	var db = execute.bind(null, sqlite)
	db.all = withSerializedParameters.bind(null, sqlite.all.bind(sqlite))
	db.get = withSerializedParameters.bind(null, sqlite.get.bind(sqlite))
	db.run = withSerializedParameters.bind(null, sqlite.run.bind(sqlite))
	return db
}

function execute(sqlite, sql) {
	if (!(sql instanceof Sql)) throw new TypeError("Not Sql: " + sql)

	return new Promise((resolve, reject) => (
		sqlite.all(String(sql), sql.parameters, (err, res) => (
			err ? reject(err) : resolve(res)
		))
	))
}

function withSerializedParameters(fn, sql, params, done) {
	fn(sql, params.map(serialize), done)
}

function serialize(value) {
	if (value instanceof Date) return value.toISOString()
	return value
}

function isUniqueError(err) {
	return err.code = "SQLITE_CONSTRAINT" && err.message.indexOf("UNIQUE") >= 0
}
