CREATE TABLE initiative_text_signatures (
  id INTEGER PRIMARY KEY NOT NULL,
	text_id INTEGER NOT NULL,
	country TEXT NOT NULL,
	personal_id TEXT NOT NULL,
	method TEXT NOT NULL,
	signed INTEGER NOT NULL DEFAULT 0,
	timestamped INTEGER NOT NULL DEFAULT 0,
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	signable BLOB NOT NULL,
	signable_type TEXT NOT NULL,
	xades TEXT,
	error TEXT,

	FOREIGN KEY (text_id) REFERENCES initiative_texts (id),

	CONSTRAINT country_length CHECK (length(country) = 2),
	CONSTRAINT personal_id_length CHECK (length(personal_id) > 0),
	CONSTRAINT signable_length CHECK (length(signable) > 0),
	CONSTRAINT xades_length CHECK (length(xades) > 0)
);
