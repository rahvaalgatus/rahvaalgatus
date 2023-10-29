var {sqlite} = require("root")

exports = module.exports = function() {
	beforeEach(exports.delete)
}

exports.delete = function() {
	sqlite.batch(`
		PRAGMA foreign_keys = OFF;

		DELETE FROM initiative_coauthors;
		DELETE FROM initiative_subscriptions;
		DELETE FROM initiative_signatures;
		DELETE FROM initiative_citizenos_signatures;
		DELETE FROM initiative_signables;
		DELETE FROM initiative_messages;
		DELETE FROM initiative_events;
		DELETE FROM initiative_files;
		DELETE FROM initiative_texts;
		DELETE FROM initiative_images;
		DELETE FROM demo_signatures;
		DELETE FROM comments;
		DELETE FROM initiatives;
		DELETE FROM sessions;
		DELETE FROM authentications;
		DELETE FROM users;

		UPDATE sqlite_sequence SET seq = 0 WHERE name = 'initiative_signatures';

		PRAGMA foreign_keys = ON;
	`)
}
