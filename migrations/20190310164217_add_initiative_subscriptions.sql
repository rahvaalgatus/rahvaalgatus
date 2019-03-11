CREATE TABLE initiative_subscriptions (
	initiative_uuid TEXT NOT NULL,
	email TEXT COLLATE NOCASE NOT NULL,
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
	updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
	confirmed_at TEXT,
	confirmation_sent_at TEXT,
	confirmation_token TEXT UNIQUE,

	PRIMARY KEY (initiative_uuid, email),
	FOREIGN KEY (initiative_uuid) REFERENCES initiatives (uuid),

	CONSTRAINT iniative_subscriptions_email_length
	CHECK (length(email) > 0),

	CONSTRAINT iniative_subscriptions_confirmation_token_length
	CHECK (length(confirmation_token) > 0),

	CONSTRAINT iniative_subscriptions_confirmation_sent_at_with_token
	CHECK (confirmation_sent_at IS NULL OR confirmation_token IS NOT NULL)
);
