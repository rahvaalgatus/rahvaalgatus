var O = require("oolong")
var Heaven = require("heaven")
var EMPTY_OBJ_PROMISE = Promise.resolve({})
var escape = require("./sqlite").escape
module.exports = SqliteHeaven

function SqliteHeaven(model, sqlite, table) {
	Heaven.call(model)
	this.sqlite = sqlite
	this.table = table
}

SqliteHeaven.prototype = Object.create(Heaven.prototype, {
	constructor: {value: SqliteHeaven, configurable: true, writeable: true}
})

SqliteHeaven.prototype.idColumn = "id"

SqliteHeaven.prototype._read = function(query) {
	var sql = "SELECT * FROM " + this.table

	switch (this.typeof(query)) {
		case "number":
		case "string": return this.sqlite.read(
			sql + " WHERE " + escape(this.idColumn) + " = ?",
			[query]
		)

		case "array": return this.sqlite.search(
			sql + " WHERE " + escape(this.idColumn) + " IN (" + bindings(query) + ")",
			query
		)

		default: throw new TypeError("Bad Query: " + query)
	}
}

SqliteHeaven.prototype._create = function(attrs) {
	return Promise.all(
		attrs.map(this.sqlite.create.bind(this.sqlite, this.table))
	)
}

SqliteHeaven.prototype.update = function(query, attrs) {
	var sql = "UPDATE " + this.table
	sql += " SET " + O.keys(attrs).map((key) => escape(key) + " = ?").join(", ")
	var values = O.values(attrs)

	switch (this.typeof(query)) {
		case "model":
			query = this.identify(query)
			// Fallthrough.

		case "number":
		case "string":
			if (O.isEmpty(attrs)) return EMPTY_OBJ_PROMISE
			sql += " WHERE " + escape(this.idColumn) + " = ?"
			return this.sqlite.update(sql, values.concat(query))

		default: throw new TypeError("Bad Query: " + query)
	}
}

function bindings(array) { return array.map(() => "?").join(", ") }
