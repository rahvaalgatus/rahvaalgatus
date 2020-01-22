CREATE TABLE users (
	id INTEGER PRIMARY KEY NOT NULL,
	uuid BLOB UNIQUE NOT NULL,
	country TEXT NOT NULL,
	personal_id TEXT NOT NULL,
	name TEXT NOT NULL,
	official_name TEXT NOT NULL,
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	email TEXT UNIQUE COLLATE NOCASE,
	email_confirmed_at TEXT,
	unconfirmed_email TEXT COLLATE NOCASE,
	email_confirmation_token BLOB UNIQUE,
	email_confirmation_sent_at TEXT,
	language TEXT NOT NULL DEFAULT 'et',

	CONSTRAINT users_uuid_length CHECK (length(uuid) == 16),
	CONSTRAINT users_country_length CHECK (length(country) == 2),
	CONSTRAINT users_personal_id_length CHECK (length(personal_id) > 0),
	CONSTRAINT users_name_length CHECK (length(name) > 0),
	CONSTRAINT users_official_name_length CHECK (length(official_name) > 0),
	CONSTRAINT users_email_length CHECK (length(email) >= 3),
	CONSTRAINT users_language_length CHECK (length(language) == 2),
	CONSTRAINT users_country_uppercase CHECK (country == upper(country)),
	CONSTRAINT users_language_lowercase CHECK (language == lower(language)),

	CONSTRAINT users_unconfirmed_email_length
	CHECK (length(unconfirmed_email) >= 3),

	CONSTRAINT users_email_format CHECK (email GLOB '*?@?*'),

	CONSTRAINT users_unconfirmed_email_format
	CHECK (unconfirmed_email GLOB '*?@?*'),

	CONSTRAINT users_email_confirmation_token
	CHECK (length(email_confirmation_token) > 0),

	CONSTRAINT users_email_confirmed
	CHECK ((email IS NULL) = (email_confirmed_at IS NULL)),

	CONSTRAINT users_unconfirmed_email_token
	CHECK ((unconfirmed_email IS NULL) = (email_confirmation_token IS NULL)),

	CONSTRAINT users_email_and_unconfirmed_email_different
	CHECK (email <> unconfirmed_email)
);

CREATE UNIQUE INDEX index_users_on_country_and_personal_id
ON users (country, personal_id);
