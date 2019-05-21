var sql = require("sqlate")
var sqlite = require("root").sqlite
var cosDb = require("root").cosDb

exports = module.exports = function() {
	beforeEach(exports.delete)
}

exports.delete = function*() {
	yield cosDb.query(sql`DELETE FROM "Users"`)
	yield cosDb.query(sql`DELETE FROM "Partners"`)
	yield cosDb.query(sql`DELETE FROM "Topics"`)
	yield cosDb.query(sql`DELETE FROM "TopicVotes"`)
	yield cosDb.query(sql`DELETE FROM "Votes"`)

	yield sqlite(sql`DELETE FROM initiatives`)
	yield sqlite(sql`DELETE FROM initiative_subscriptions`)
	yield sqlite(sql`DELETE FROM initiative_signatures`)
	yield sqlite(sql`DELETE FROM initiative_messages`)
}
