CREATE TABLE initiatives (
	uuid TEXT PRIMARY KEY NOT NULL,
	mailchimp_interest_id TEXT NULL UNIQUE, notes TEXT NOT NULL DEFAULT "", parliament_api_data TEXT NULL, sent_to_parliament_at TEXT NULL, finished_in_parliament_at TEXT NULL, discussion_end_email_sent_at TEXT NULL, signing_end_email_sent_at TEXT NULL, author_url TEXT NOT NULL DEFAULT "", community_url TEXT NOT NULL DEFAULT "", organizations TEXT NOT NULL DEFAULT "[]", meetings TEXT NOT NULL DEFAULT "[]", url TEXT NOT NULL DEFAULT "", media_urls TEXT NOT NULL DEFAULT "[]", signature_milestones TEXT NOT NULL DEFAULT "{}", phase TEXT NOT NULL DEFAULT "edit",

	CONSTRAINT initiatives_uuid_length
	CHECK (length(uuid) == 36),

	CONSTRAINT initiatives_mailchimp_interest_id
	CHECK (length(mailchimp_interest_id) > 0)
);
CREATE TABLE initiative_signatures (
	initiative_uuid TEXT NOT NULL,
	user_uuid TEXT NOT NULL,
	updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
	hidden INTEGER NOT NULL DEFAULT 0,

	PRIMARY KEY (initiative_uuid, user_uuid),
	FOREIGN KEY (initiative_uuid) REFERENCES initiatives (uuid)
);
CREATE TABLE initiative_messages (
	id INTEGER PRIMARY KEY NOT NULL,
	initiative_uuid TEXT NOT NULL,
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
	updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
	title TEXT NOT NULL,
	"text" TEXT NOT NULL,
	sent_at TEXT,
	sent_to TEXT NOT NULL DEFAULT '[]', origin TEXT NOT NULL DEFAULT 'message',

	FOREIGN KEY (initiative_uuid) REFERENCES initiatives (uuid),

	CONSTRAINT initiative_messages_title_length
	CHECK (length(title) > 0),

	CONSTRAINT initiative_messages_text_length
	CHECK (length("text") > 0)
);
CREATE TABLE IF NOT EXISTS "initiative_events" (
	id INTEGER PRIMARY KEY NOT NULL,
	initiative_uuid TEXT NOT NULL,
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
	updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
	occurred_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
	created_by TEXT,
	title TEXT NOT NULL,
	"text" TEXT NOT NULL, origin TEXT NOT NULL DEFAULT 'admin',

	FOREIGN KEY (initiative_uuid) REFERENCES initiatives (uuid),

	CONSTRAINT initiative_events_title_length
	CHECK (length(title) > 0),

	CONSTRAINT initiative_events_text_length
	CHECK (length("text") > 0)
);
CREATE INDEX index_initiative_events_on_initiative_uuid
ON initiative_events (initiative_uuid);
CREATE TABLE IF NOT EXISTS "initiative_subscriptions" (
	initiative_uuid TEXT NULL,
	email TEXT COLLATE NOCASE NOT NULL,
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
	updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
	confirmed_at TEXT,
	confirmation_sent_at TEXT,
  update_token TEXT UNIQUE NOT NULL DEFAULT (lower(hex(randomblob(8)))),
  created_ip TEXT NULL,
  origin TEXT NULL,
  official_interest INTEGER NOT NULL DEFAULT 1,
  author_interest INTEGER NOT NULL DEFAULT 1,

	PRIMARY KEY (initiative_uuid, email),
	FOREIGN KEY (initiative_uuid) REFERENCES initiatives (uuid),

	CONSTRAINT iniative_subscriptions_email_length
	CHECK (length(email) > 0),

	CONSTRAINT iniative_subscriptions_update_token_length
	CHECK (length(update_token) > 0)
);
CREATE UNIQUE INDEX index_initiative_subscriptions_initiative_uuid_and_email
ON initiative_subscriptions (COALESCE(initiative_uuid, ""), email);
CREATE TABLE comments (
	id INTEGER PRIMARY KEY NOT NULL,
	uuid TEXT,
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	initiative_uuid TEXT NOT NULL,
	user_uuid TEXT NOT NULL,
	parent_id INTEGER,
	title TEXT NOT NULL DEFAULT '',
	"text" TEXT NOT NULL DEFAULT '',

	FOREIGN KEY (parent_id) REFERENCES comments (id),
	FOREIGN KEY (initiative_uuid) REFERENCES initiatives (uuid),

	CONSTRAINT comments_title_present
	CHECK (
		(title != '' AND parent_id IS NULL) OR
		(title = '' AND parent_id IS NOT NULL)
	),

	CONSTRAINT comments_title_length
	CHECK (length(title) <= 140),

	CONSTRAINT comments_text_length
	CHECK (text != '' AND length(text) <= 3000)
);
CREATE UNIQUE INDEX index_comments_on_uuid
ON comments (uuid);
CREATE INDEX index_comments_on_parent_id
ON comments (parent_id);
CREATE INDEX index_comments_on_initiative_uuid
ON comments (initiative_uuid);

PRAGMA foreign_keys=OFF;
BEGIN TRANSACTION;
CREATE TABLE migrations (version TEXT PRIMARY KEY NOT NULL);
INSERT INTO migrations VALUES('20181201195222');
INSERT INTO migrations VALUES('20181201200519');
INSERT INTO migrations VALUES('20181209204318');
INSERT INTO migrations VALUES('20181211192927');
INSERT INTO migrations VALUES('20190108102703');
INSERT INTO migrations VALUES('20190304110736');
INSERT INTO migrations VALUES('20190310164217');
INSERT INTO migrations VALUES('20190311183208');
INSERT INTO migrations VALUES('20190410080730');
INSERT INTO migrations VALUES('20190410173242');
INSERT INTO migrations VALUES('20190427232247');
INSERT INTO migrations VALUES('20190428103608');
INSERT INTO migrations VALUES('20190428114010');
INSERT INTO migrations VALUES('20190428170006');
INSERT INTO migrations VALUES('20190519192050');
INSERT INTO migrations VALUES('20190523150859');
INSERT INTO migrations VALUES('20190527092632');
INSERT INTO migrations VALUES('20190531131546');
INSERT INTO migrations VALUES('20190531132234');
INSERT INTO migrations VALUES('20190531141956');
INSERT INTO migrations VALUES('20190607111527');
INSERT INTO migrations VALUES('20190613120456');
INSERT INTO migrations VALUES('20190614131543');
INSERT INTO migrations VALUES('20190621112243');
INSERT INTO migrations VALUES('20190628153405');
COMMIT;
