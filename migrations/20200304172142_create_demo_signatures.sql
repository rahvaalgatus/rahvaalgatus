CREATE TABLE demo_signatures (
  id INTEGER PRIMARY KEY NOT NULL,
	country TEXT NOT NULL,
	personal_id TEXT NOT NULL,
	method TEXT NOT NULL,
	signed INTEGER NOT NULL DEFAULT 0,
	timestamped INTEGER NOT NULL DEFAULT 0,
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  token BLOB NOT NULL DEFAULT (randomblob(16)),
	xades TEXT,
	error TEXT,

	CONSTRAINT initiative_signables_country_length CHECK (length(country) = 2),

	CONSTRAINT initiative_signables_personal_id_length
	CHECK (length(personal_id) > 0),

	CONSTRAINT initiative_signables_token_length CHECK (length(token) > 0),
	CONSTRAINT initiative_signables_xades_length CHECK (length(xades) > 0)
);
