CREATE TABLE initiative_signables (
	initiative_uuid TEXT NOT NULL,
	country TEXT NOT NULL,
	personal_id TEXT NOT NULL,
  token BLOB UNIQUE NOT NULL DEFAULT (randomblob(12)),
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	xades TEXT NOT NULL,
	signed INTEGER NOT NULL DEFAULT 0,
	timestamped INTEGER NOT NULL DEFAULT 0,
	error TEXT,

	FOREIGN KEY (initiative_uuid) REFERENCES initiatives (uuid) ON DELETE CASCADE,

	CONSTRAINT initiative_signables_country_length CHECK (length(country) = 2),

	CONSTRAINT initiative_signables_personal_id_length
	CHECK (length(personal_id) > 0),

	CONSTRAINT initiative_signables_token_length CHECK (length(token) > 0),
	CONSTRAINT initiative_signables_xades_length CHECK (length(xades) > 0)
);

CREATE INDEX index_signables_on_initiative_uuid
ON initiative_signables (initiative_uuid);
