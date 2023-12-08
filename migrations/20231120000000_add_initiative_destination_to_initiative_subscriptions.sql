BEGIN;

PRAGMA foreign_keys = OFF;

CREATE TABLE "initiative_subscriptions_new" (
	initiative_uuid TEXT,
	initiative_destination TEXT,
	email TEXT COLLATE NOCASE NOT NULL,
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	confirmed_at TEXT,
	confirmation_sent_at TEXT,
  update_token TEXT UNIQUE NOT NULL DEFAULT (lower(hex(randomblob(8)))),
  created_ip TEXT NULL,
  origin TEXT NULL,
  event_interest INTEGER NOT NULL DEFAULT 0,
	comment_interest INTEGER NOT NULL DEFAULT 0,
	new_interest INTEGER NOT NULL DEFAULT 0,
	signable_interest INTEGER NOT NULL DEFAULT 0,

	FOREIGN KEY (initiative_uuid) REFERENCES initiatives (uuid) ON DELETE CASCADE,

	CONSTRAINT initiative_uuid_nand_destination
	CHECK (initiative_uuid IS NULL OR initiative_destination IS NULL),

	CONSTRAINT initiative_destination_length
	CHECK (length(initiative_destination) > 0),

	CONSTRAINT email_length CHECK (length(email) > 0),
	CONSTRAINT update_token_length CHECK (length(update_token) > 0),

	CONSTRAINT new_interest_for_all_initiatives
	CHECK (initiative_uuid IS NULL OR NOT new_interest)
);

INSERT INTO initiative_subscriptions_new (
	initiative_uuid,
	email,
	created_at,
	updated_at,
	confirmed_at,
	confirmation_sent_at,
  update_token,
  created_ip,
  origin,
  event_interest,
	comment_interest,
	new_interest,
	signable_interest
)
SELECT
	initiative_uuid,
	email,
	created_at,
	updated_at,
	confirmed_at,
	confirmation_sent_at,
  update_token,
  created_ip,
  origin,
  event_interest,
	comment_interest,
	new_interest,
	signable_interest

FROM initiative_subscriptions;

DROP TABLE initiative_subscriptions;
ALTER TABLE initiative_subscriptions_new RENAME TO initiative_subscriptions;

PRAGMA foreign_keys = ON;

CREATE UNIQUE INDEX
	index_initiative_subscriptions_initiative_uuid_destination_and_email
ON initiative_subscriptions (
	COALESCE(initiative_uuid, ''),
	COALESCE(initiative_destination, ''),
	email
);

CREATE INDEX index_initiative_subscriptions_on_email
ON initiative_subscriptions (email);

CREATE INDEX index_initiative_subscriptions_on_initiative_destination
ON initiative_subscriptions (initiative_destination);

COMMIT;
