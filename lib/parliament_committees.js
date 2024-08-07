var _ = require("./underscore")
var Fs = require("./fs")
var COMMITTEES = Fs.readJsonSync(__dirname + "/parliament_committees.json")
exports = module.exports = COMMITTEES

// https://www.riigikogu.ee/riigikogu/riigikogu-komisjonid
var ID_BY_NAME = _.fromEntries(_.map(COMMITTEES, ({name}, id) => [name, id]))

Object.defineProperty(exports, "ID_BY_NAME", {
	value: ID_BY_NAME, configurable: true, writable: true
})

// https://www.riigikogu.ee/riigikogu/koosseis/muudatused-koosseisus/
var ID_BY_ABBR = _.fromEntries(
	_.map(COMMITTEES, ({abbreviation}, id) => [abbreviation, id])
)

Object.defineProperty(exports, "ID_BY_ABBR", {
	value: ID_BY_ABBR, configurable: true, writable: true
})
