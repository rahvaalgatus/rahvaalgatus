var _ = require("root/lib/underscore")
var Fs = require("root/lib/fs")
var LOCAL_GOVERNMENTS = Fs.readJsonSync(__dirname + "/local_governments.json")
exports = module.exports = LOCAL_GOVERNMENTS

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
