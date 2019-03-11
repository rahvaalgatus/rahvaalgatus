var slice = Function.call.bind(Array.prototype.slice)
exports = module.exports = template
exports.Sql = Sql

function template(sqls) {
	var params = slice(arguments, 1)
	var sql = sqls.reduce((left, right) => left + "?" + right)
	return new Sql(sql, params)
}

function Sql(sql, params) {
	this.sql = sql
	this.params = params
}

Sql.prototype.toString = function() {
	return this.sql
}
