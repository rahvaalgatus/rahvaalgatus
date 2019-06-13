UPDATE initiative_subscriptions
SET update_token = confirmation_token
WHERE confirmed_at IS NULL AND confirmation_token IS NOT NULL;

CREATE TABLE initiative_subscriptions_new (
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

INSERT INTO initiative_subscriptions_new
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
  official_interest,
  author_interest
FROM initiative_subscriptions;

DROP TABLE initiative_subscriptions;

ALTER TABLE initiative_subscriptions_new
RENAME TO initiative_subscriptions;

CREATE UNIQUE INDEX index_initiative_subscriptions_initiative_uuid_and_email
ON initiative_subscriptions (COALESCE(initiative_uuid, ""), email);
