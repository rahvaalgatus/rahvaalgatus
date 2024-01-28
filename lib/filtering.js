var _ = require("./underscore")
var Range = require("strange")

exports.COMPARATOR_SUFFIXES = {
	"=": "",
	"<": "<<",
	"<=": "<",
	">=": ">",
	">": ">>"
}

exports.parseOrder = function(query) {
	var direction = query[0] == "-" ? "desc" : "asc"
	var field = query.replace(/^[-+]/, "")
	return [field, direction]
}

exports.parseFilters = function(spec, query) {
	var filters = {}, name, value

	for (var filter in query) {
		if (filter.includes("<")) {
			[name, value] = filter.split("<")
			if (filter.endsWith("<<")) add(name, "<", query[filter])
			else if (query[filter]) add(name, "<=", query[filter])
			else if (value) add(name, "<", value)
		}
		else if (filter.includes(">")) {
			[name, value] = filter.split(">")
			if (filter.endsWith(">>")) add(name, ">", query[filter])
			else if (query[filter]) add(name, ">=", query[filter])
			else if (value) add(name, ">", value)
		}
		else if (query[filter]) add(filter, "=", query[filter])

		// eslint-disable-next-line no-inner-declarations
		function add(name, comparator, value) {
			_.asArray(value).forEach((value) => (
				(filters[name] || (filters[name] = [])).push({comparator, value})
			))
		}
	}

	return _.reduce(filters, function(filters, filter, name) {
		if (!_.isEnumerable(spec, name)) return filters

		switch (spec[name]) {
			case true:
			case "single":
				var eq = _.findLast(filter, ({comparator}) => comparator == "=")
				if (eq) filters[name] = eq.value
				break

			case "array":
				var eqs = filter.filter(({comparator}) => comparator == "=")
				if (eqs.length > 0) filters[name] = eqs.map(({value}) => value)
				break

			case "range":
				filters[name] = parseRangeFilter(filter)
				break

			default: throw new RangeError("Invalid filter type: " + spec[name])
		}

		return filters
	}, {})
}

exports.serializeFilters = function(filters) {
	return _.reduce(filters, function(query, value, name) {
		if (value instanceof Range) {
			if (
				!isInfinity(value.begin) &&
				!isInfinity(value.end) &&
				value.bounds == "[]" &&
				value.begin.valueOf() === value.end.valueOf()
			) query[name] = value.begin
			else {
				if (!isInfinity(value.begin))
					query[name + (value.bounds[0] == "[" ? ">" : ">>")] = value.begin
				if (!isInfinity(value.end))
					query[name + (value.bounds[1] == "]" ? "<" : "<<")] = value.end
			}
		}
		else query[name] = value

		return query
	}, {})
}

function parseRangeFilter(filter) {
	return filter.reduce(function(range, {comparator, value}) {
		switch (comparator) {
			case "=": return new Range(value, value, "[]")
			case "<": return new Range(range.begin, value, range.bounds[0] + ")")
			case "<=": return new Range(range.begin, value, range.bounds[0] + "]")
			case ">": return new Range(value, range.end, "(" + range.bounds[1])
			case ">=": return new Range(value, range.end, "[" + range.bounds[1])
			default: throw new Error("Unsupported comparator: " + comparator)
		}
	}, new Range(null, null, "[]"))
}

function isInfinity(value) {
  return value === null || value === Infinity || value === -Infinity
}
