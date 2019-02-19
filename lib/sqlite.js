var O = require("oolong")
var Sqlite3 = require("sqlite3")
var denodeify = require("denodeify")
var isArray = Array.isArray
var PARAMS_ERR = "Params must be an object or an array: "
exports = module.exports = Sqlite
exports.escape = escape

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

Sqlite.prototype.search = function(sql, params) {
	return execute(this._search, sql, params)
}

Sqlite.prototype.read = function(sql, params) {
	return execute(this._read, sql, params)
}

Sqlite.prototype.create = function(table, obj) {
	if (O.isEmpty(obj)) throw new RangeError("Cannot insert empty object")

	var columns = O.keys(obj).map(escape)
	var sql = "INSERT INTO \"" + table + "\" (" + columns.join(", ") + ")"
	sql += " VALUES (" + bindings(columns) + ")"
	var res = this._create(sql, O.values(obj).map(serialize))
	return res.then(this.read.bind(this, getLastInsert(table)))
}

Sqlite.prototype.update = function(sql, params) {
	return execute(this._update, sql, serializeAll(params))
}

Sqlite.prototype.delete = function(sql, params) {
	return execute(this._delete, sql, params)
}

function execute(fn, sql, params) {
	if (params != null && (!isArray(params) && !O.isPlainObject(params)))
		throw new TypeError(PARAMS_ERR + params)

	return fn(sql, params)
}

function getLastInsert(table) {
	return "SELECT * FROM \"" + table + "\" WHERE oid = last_insert_rowid()"
}

function serialize(value) {
	if (value instanceof Date) return value.toJSON()
	return value
}

function serializeAll(obj) {
	if (Array.isArray(obj)) return obj.map(serialize)
	else return O.map(obj, serialize)
}

function escape(name) { return '"' + name.replace(/"/g, '""') + '"'}
function bindings(array) { return array.map(() => "?").join(", ") }
