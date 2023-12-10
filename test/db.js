var SqliteError = require("root/lib/sqlite_error")
var sql = require("sqlate")
var {sqlite} = require("root")

module.exports = function() {
	beforeEach(truncate)
	afterEach(assertNoTransaction)
}

function truncate() {
	sqlite.batch(`
		PRAGMA foreign_keys = OFF;

		DELETE FROM external_responses;
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

function assertNoTransaction() {
	var err
	try { sqlite(sql`ROLLBACK`) } catch (ex) { err = ex }
	err.must.be.an.error(SqliteError)
	err.message.must.equal("cannot rollback - no transaction is active")
}
