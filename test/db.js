var sql = require("sqlate")
var {sqlite} = require("root")

exports = module.exports = function() {
	beforeEach(exports.delete)
}

exports.delete = function() {
	sqlite(sql`DELETE FROM initiative_subscriptions`)
	sqlite(sql`DELETE FROM initiative_signatures`)
	sqlite(sql`DELETE FROM initiative_citizenos_signatures`)

	sqlite(sql`
    UPDATE sqlite_sequence SET seq = 0 WHERE name = 'initiative_signatures'
	`)

	sqlite(sql`DELETE FROM initiative_signables`)
	sqlite(sql`DELETE FROM initiative_messages`)
	sqlite(sql`DELETE FROM initiative_events`)
	sqlite(sql`DELETE FROM initiative_files`)
	sqlite(sql`DELETE FROM initiative_texts`)
	sqlite(sql`DELETE FROM initiative_images`)
	sqlite(sql`DELETE FROM demo_signatures`)
	sqlite(sql`DELETE FROM comments`)
	sqlite(sql`DELETE FROM initiatives`)
	sqlite(sql`DELETE FROM authentications`)
	sqlite(sql`DELETE FROM users`)
}
