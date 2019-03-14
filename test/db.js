var sql = require("root/lib/sql")
var sqlite = require("root").sqlite

exports = module.exports = function() {
	beforeEach(exports.delete)
}

exports.delete = function*() {
	yield sqlite.delete(sql`DELETE FROM initiatives`)
	yield sqlite.delete(sql`DELETE FROM initiative_subscriptions`)
	yield sqlite.delete(sql`DELETE FROM initiative_signatures`)
}
