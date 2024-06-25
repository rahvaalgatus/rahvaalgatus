CREATE TABLE initiative_signature_trustees (
	id INTEGER PRIMARY KEY NOT NULL,
	initiative_destination TEXT NOT NULL,
	country TEXT NOT NULL,
	personal_id TEXT NOT NULL,
	name TEXT NOT NULL,
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	created_by_id INTEGER NOT NULL,
	deleted_at TEXT,
	deleted_by_id INTEGER,

	FOREIGN KEY (created_by_id) REFERENCES users (id),
	FOREIGN KEY (deleted_by_id) REFERENCES users (id),

	CONSTRAINT initiative_destination_length
	CHECK (length(initiative_destination) > 0),

	CONSTRAINT country_format CHECK (country GLOB '[A-Z][A-Z]'),

	CONSTRAINT personal_id_format CHECK (CASE country
		WHEN 'EE' THEN
			personal_id GLOB '[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]'
		ELSE length(personal_id) > 0
	END),

	CONSTRAINT name CHECK (length(name) > 0),
	CONSTRAINT created_at_format CHECK (created_at GLOB '*-*-*T*:*:*Z'),
	CONSTRAINT deleted_at_format CHECK (deleted_at GLOB '*-*-*T*:*:*Z'),

	CONSTRAINT deleted_at_with_id
	CHECK ((deleted_at IS NULL) = (deleted_by_id IS NULL))
);

CREATE INDEX index_initiative_signature_trustees_on_destination
ON initiative_signature_trustees (initiative_destination);

CREATE UNIQUE INDEX
	index_initiative_signature_trustees_on_destination_and_personal_id
ON initiative_signature_trustees (initiative_destination, country, personal_id)
WHERE deleted_at IS NULL;

CREATE INDEX index_initiative_signature_trustees_on_created_by_id
ON initiative_signature_trustees (created_by_id);

CREATE INDEX index_initiative_signature_trustees_on_deleted_by_id
ON initiative_signature_trustees (deleted_by_id);
