var sql = require("sqlate")
var sqlite = require("root").sqlite

exports = module.exports = function() {
	beforeEach(exports.delete)
}

exports.delete = function*() {
	yield sqlite(sql`DELETE FROM initiatives`)
	yield sqlite(sql`DELETE FROM initiative_subscriptions`)
	yield sqlite(sql`DELETE FROM initiative_signatures`)
}
