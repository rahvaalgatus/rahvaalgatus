var isArray = Array.isArray
var slice = Function.call.bind(Array.prototype.slice)
var flatten = Function.apply.bind(Array.prototype.concat, Array.prototype)
var EMPTY_ARR = Array.prototype
exports = module.exports = template
exports.Sql = Sql

function template(sqls) {
	var params = slice(arguments, 1)
	var sql = sqls.reduce((left, right, i) => left + bind(params[i - 1]) + right)
	return new Sql(sql, flatten(params))
}

function Sql(sql, params) {
	if (typeof sql != "string")
		throw new TypeError("SQL should be a string: " + sql)

	this.sql = sql
	this.params = params || EMPTY_ARR
}

Sql.prototype.toString = function() {
	return this.sql
}

function bind(value) {
	// Binding a single level for now. Could be done recursively in the future.
	if (isArray(value)) return "(" + value.map(() => "?").join(", ") + ")"
	return "?"
}
