CREATE TABLE authentications (
	id INTEGER PRIMARY KEY NOT NULL,
	country TEXT NOT NULL,
	personal_id TEXT NOT NULL,
	method TEXT NOT NULL,
	certificate BLOB,
  token BLOB UNIQUE NOT NULL,
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	created_ip TEXT,
	created_user_agent TEXT,
	authenticated INTEGER NOT NULL DEFAULT 0,
	error TEXT,

	CONSTRAINT authentications_country_length CHECK (length(country) = 2),
	CONSTRAINT authentications_personal_id_length
	CHECK (length(personal_id) > 0),

	CONSTRAINT authentications_certificate_length CHECK (length(certificate) > 0),
	CONSTRAINT authentications_token_sha256_length CHECK (length(token) > 0),

	CONSTRAINT authentications_country_uppercase
	CHECK (country == upper(country))
);

CREATE TABLE sessions (
	id INTEGER PRIMARY KEY NOT NULL,
	user_id INTEGER NOT NULL,
  token_sha256 BLOB UNIQUE NOT NULL,
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	authentication_id INTEGER UNIQUE,
	method TEXT NOT NULL,
	created_ip TEXT,
	created_user_agent TEXT,
	deleted_at TEXT,

	FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,

	FOREIGN KEY (authentication_id) REFERENCES authentications (id)
	ON DELETE SET NULL,

	CONSTRAINT sessions_token_sha256_length CHECK (length(token_sha256) == 32)
);
