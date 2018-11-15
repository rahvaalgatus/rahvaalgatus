var O = require("oolong")
var Sqlite3 = require("sqlite3")
var denodeify = require("denodeify")
var isArray = Array.isArray
var PARAMS_ERR = "Params must be an array: "
module.exports = Db

function Db(path) {
	var sqlite = new Sqlite3.Database(path, Sqlite3.OPEN_READWRITE)
	sqlite.serialize()

	this.sqlite = sqlite
	this._search = denodeify(sqlite.all.bind(sqlite))
	this._read = denodeify(sqlite.get.bind(sqlite))
	this._create = denodeify(sqlite.run.bind(sqlite))
	this._delete = denodeify(sqlite.run.bind(sqlite))
}

Db.prototype.search = function(sql, params) {
	return execute(this._search, sql, params)
}

Db.prototype.read = function(sql, params) {
	return execute(this._read, sql, params)
}

Db.prototype.create = function(table, obj) {
	if (O.isEmpty(obj)) throw new RangeError("Cannot insert empty object")

	var columns = O.keys(obj)
	var sql = "INSERT INTO \"" + table + "\" (" + columns.join(", ") + ")"
	sql += " VALUES (?" + new Array(columns.length).join(", ?") + ")"
	return this._create(sql, O.values(obj))
}

Db.prototype.delete = function(sql, params) {
	return execute(this._delete, sql, params)
}

function execute(fn, sql, params) {
	if (params != null && !isArray(params))
		throw new TypeError(PARAMS_ERR + params)

	return fn(sql, params)
}
