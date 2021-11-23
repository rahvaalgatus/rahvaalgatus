var sql = require("sqlate")
var sqlite = require("root").sqlite

exports = module.exports = function() {
	beforeEach(exports.delete)
}

exports.delete = function*() {
	yield sqlite(sql`DELETE FROM initiative_subscriptions`)
	yield sqlite(sql`DELETE FROM initiative_signatures`)
	yield sqlite(sql`DELETE FROM initiative_citizenos_signatures`)

	yield sqlite(sql`
    UPDATE sqlite_sequence SET seq = 0 WHERE name = 'initiative_signatures'
	`)

	yield sqlite(sql`DELETE FROM initiative_signables`)
	yield sqlite(sql`DELETE FROM initiative_messages`)
	yield sqlite(sql`DELETE FROM initiative_events`)
	yield sqlite(sql`DELETE FROM initiative_files`)
	yield sqlite(sql`DELETE FROM initiative_text_signatures`)
	yield sqlite(sql`DELETE FROM initiative_texts`)
	yield sqlite(sql`DELETE FROM initiative_images`)
	yield sqlite(sql`DELETE FROM demo_signatures`)
	yield sqlite(sql`DELETE FROM comments`)
	yield sqlite(sql`DELETE FROM initiatives`)
	yield sqlite(sql`DELETE FROM authentications`)
	yield sqlite(sql`DELETE FROM users`)
}
