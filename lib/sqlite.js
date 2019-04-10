var O = require("oolong")
var Sqlite3 = require("sqlite3")
var Sql = require("./sql").Sql
var denodeify = require("denodeify")
var TYPE_ERR = "Not an instance of Sql: "
exports = module.exports = Sqlite
exports.escape = escape
exports.isUniqueError = isUniqueError

function Sqlite(path) {
	var sqlite = new Sqlite3.Database(path, Sqlite3.OPEN_READWRITE)
	sqlite.serialize()

	this.sqlite = sqlite
	this._search = denodeify(sqlite.all.bind(sqlite))
	this._read = denodeify(sqlite.get.bind(sqlite))
	this._create = denodeify(sqlite.run.bind(sqlite))
	this._update = this._create
	this._delete = this._create
}

Sqlite.prototype.search = function(sql) {
	if (!(sql instanceof Sql)) throw new TypeError(TYPE_ERR + sql)
	return this._search(sql.sql, sql.params.map(serialize))
}

Sqlite.prototype.read = function(sql) {
	if (!(sql instanceof Sql)) throw new TypeError(TYPE_ERR + sql)
	return this._read(sql.sql, sql.params.map(serialize))
}

Sqlite.prototype.create = function(table, obj) {
	if (O.isEmpty(obj)) throw new RangeError("Cannot insert empty object")

	var columns = O.keys(obj)
	var sql = `INSERT INTO ${escape(table)} (${columns.map(escape).join(", ")})`
	sql += " VALUES (" + bindings(columns) + ")"
	var created = this._create(sql, O.values(obj).map(serialize))

	// Fire off request to last row immediately as others may be interleaved
	// otherwise.
	var last = this._read(getLastInsert(table))
	return created.then(() => last)
}

Sqlite.prototype.update = function(sql) {
	if (!(sql instanceof Sql)) throw new TypeError(TYPE_ERR + sql)
	return this._update(sql.sql, sql.params.map(serialize))
}

Sqlite.prototype.delete = Sqlite.prototype.update

function getLastInsert(table) {
	return `SELECT * FROM ${escape(table)} WHERE oid = last_insert_rowid()`
}

function serialize(value) {
	if (value instanceof Date) return value.toISOString()
	return value
}

function isUniqueError(err) {
	return err.code = "SQLITE_CONSTRAINT" && err.message.indexOf("UNIQUE") >= 0
}

function escape(name) { return '"' + name.replace(/"/g, '""') + '"'}
function bindings(array) { return array.map(() => "?").join(", ") }
