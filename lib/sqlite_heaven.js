var O = require("oolong")
var Heaven = require("heaven")
var Sql = require("./sql").Sql
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
	var sql = "SELECT * FROM " + this.table + " WHERE " + escape(this.idColumn)

	switch (this.typeof(query)) {
		case "number":
		case "string": return this.sqlite.read(new Sql(sql + " = ?", [query]))

		case "array": return this.sqlite.search(
			new Sql(sql + " IN (" + bindings(query) + ")", query)
		)

		case "sql": return this.sqlite.search(query)
		default: throw new TypeError("Bad Query: " + query)
	}
}

SqliteHeaven.prototype._create = function(attrs) {
	return Promise.all(
		attrs.map(this.sqlite.create.bind(this.sqlite, this.table))
	)
}

SqliteHeaven.prototype._update = function(query, attrs) {
	var sql = "UPDATE " + this.table
	sql += " SET " + O.keys(attrs).map((key) => escape(key) + " = ?").join(", ")
	sql += " WHERE " + escape(this.idColumn) + " = ?"
	var values = O.values(attrs)

	switch (this.typeof(query)) {
		case "model": query = this.identify(query) // Fallthrough.
		case "number":
		case "string":
			if (O.isEmpty(attrs)) return EMPTY_OBJ_PROMISE
			return this.sqlite.update(new Sql(sql, values.concat(query)))

		default: throw new TypeError("Bad Query: " + query)
	}
}

SqliteHeaven.prototype._delete = function(query) {
	var sql = "DELETE FROM " + this.table
	sql += " WHERE " + escape(this.idColumn) + " = ?"

	switch (this.typeof(query)) {
		case "model": query = this.identify(query) // Fallthrough.
		case "number":
		case "string": return this.sqlite.delete(new Sql(sql, query))
		case "sql": return this.sqlite.delete(query)
		default: throw new TypeError("Bad Query: " + query)
	}
}

SqliteHeaven.prototype.typeof = function(value) {
	if (value instanceof Sql) return "sql"
	return Heaven.prototype.typeof.call(this, value)
}

function bindings(array) { return array.map(() => "?").join(", ") }
