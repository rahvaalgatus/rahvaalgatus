var O = require("oolong")
var Sqlite3 = require("sqlite3")
var denodeify = require("denodeify")
var isArray = Array.isArray
var PARAMS_ERR = "Params must be an object or an array: "
module.exports = Db

function Db(path) {
	var sqlite = new Sqlite3.Database(path, Sqlite3.OPEN_READWRITE)
	sqlite.serialize()

	this.sqlite = sqlite
	this._search = denodeify(sqlite.all.bind(sqlite))
	this._read = denodeify(sqlite.get.bind(sqlite))
	this._create = denodeify(sqlite.run.bind(sqlite))
	this._update = this._create
	this._delete = this._create
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
	var res = this._create(sql, O.values(obj))
	return res.then(this.read.bind(this, getLastInsert(table)))
}

Db.prototype.update = function(sql, params) {
	return execute(this._update, sql, params)
}

Db.prototype.delete = function(sql, params) {
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
