CREATE TABLE initiatives (
	uuid TEXT PRIMARY KEY NOT NULL,
	mailchimp_interest_id TEXT NULL UNIQUE, notes TEXT NOT NULL DEFAULT "", parliament_api_data TEXT NULL, sent_to_parliament_at TEXT NULL, finished_in_parliament_at TEXT NULL,

	CONSTRAINT initiatives_uuid_length
	CHECK (length(uuid) == 36),

	CONSTRAINT initiatives_mailchimp_interest_id
	CHECK (length(mailchimp_interest_id) > 0)
);

PRAGMA foreign_keys=OFF;
BEGIN TRANSACTION;
CREATE TABLE migrations (version TEXT PRIMARY KEY NOT NULL);
INSERT INTO migrations VALUES('20181201195222');
INSERT INTO migrations VALUES('20181201200519');
INSERT INTO migrations VALUES('20181209204318');
INSERT INTO migrations VALUES('20181211192927');
INSERT INTO migrations VALUES('20190108102703');
INSERT INTO migrations VALUES('20190304110736');
COMMIT;
