CREATE TABLE initiative_texts (
	id INTEGER PRIMARY KEY NOT NULL,
	initiative_uuid TEXT NOT NULL,
	basis_id INTEGER,
	user_id INTEGER NOT NULL,
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	content BLOB NOT NULL,
	content_type TEXT NOT NULL,

	FOREIGN KEY (initiative_uuid) REFERENCES initiatives (uuid),
	FOREIGN KEY (user_id) REFERENCES users (id),

	FOREIGN KEY (initiative_uuid, basis_id)
	REFERENCES initiative_texts (initiative_uuid, id),

	CONSTRAINT content_type CHECK (length(content_type) > 0)
);

CREATE INDEX index_initiative_texts_on_initiative_uuid_and_created_at
ON initiative_texts (initiative_uuid, created_at);

-- The foreign key constraint requires a unique composite key.
CREATE UNIQUE INDEX index_initiative_texts_on_initiative_uuid_and_id
ON initiative_texts (initiative_uuid, id);

CREATE INDEX index_initiative_texts_on_basis_id
ON initiative_texts (basis_id);
