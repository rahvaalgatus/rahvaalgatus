var Sql = require("sqlate").Sql

exports.query = function(knex, query) {
	if (!(query instanceof Sql)) throw new TypeError("Not Sql: " + query)
	return knex.raw(String(query), query.parameters).then(getRows)
}

function getRows(res) { return res.rows }
