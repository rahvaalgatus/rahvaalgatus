var _ = require("./underscore")
var sql = require("sqlate")

exports.COMPARATOR_SQL = {
	"<": sql`<`,
	"<=": sql`<=`,
	"=": sql`=`,
	">=": sql`>=`,
	">": sql`>`
}

exports.parseOrder = function(query) {
	var direction = query[0] == "-" ? "desc" : "asc"
	var field = query.replace(/^[-+]/, "")
	return [field, direction]
}

exports.parseFilters = function(allowedFilters, query) {
	var filters = {}, name, value

	for (var filter in query) {
		if (filter.includes("<")) {
			[name, value] = filter.split("<")
			if (filter.endsWith("<<")) filters[name] = ["<", query[filter]]
			else if (query[filter]) filters[name] = ["<=", query[filter]]
			else if (value) filters[name] = ["<", value]
		}
		else if (filter.includes(">")) {
			[name, value] = filter.split(">")
			if (filter.endsWith(">>")) filters[name] = [">", query[filter]]
			else if (query[filter]) filters[name] = [">=", query[filter]]
			else if (value) filters[name] = [">", value]
		}
		else if (query[filter]) filters[filter] = ["=", query[filter]]
	}

	return _.filterValues(filters, (_v, name) => allowedFilters.includes(name))
}
