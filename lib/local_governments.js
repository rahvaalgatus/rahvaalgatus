var _ = require("root/lib/underscore")
module.exports = exports = require("./local_governments.json")

var BY_COUNTY = _.mapValues(_.groupBy(
	_.toEntries(exports),
	([_id, gov]) => gov.county
), (govs) => _.sortBy(govs, ([_id, gov]) => gov.name).map(([id, gov]) => [
	id,
	gov.name
]))

Object.defineProperty(exports, "BY_COUNTY", {
	value: BY_COUNTY, configurable: true, writable: true
})
