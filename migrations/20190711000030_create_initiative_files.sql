CREATE TABLE "initiative_files" (
	id INTEGER PRIMARY KEY NOT NULL,
	initiative_uuid TEXT NOT NULL,
	event_id INTEGER,
	external_id TEXT,
	external_url TEXT,
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	name TEXT NOT NULL,
	title TEXT,
	url TEXT,
	content BLOB NOT NULL,
	content_type TEXT NOT NULL,

	FOREIGN KEY (initiative_uuid) REFERENCES initiatives (uuid),
	FOREIGN KEY (event_id) REFERENCES initiative_events (id),

	CONSTRAINT initiative_files_external_id_length
	CHECK (length(external_id) > 0),

	CONSTRAINT initiative_files_external_url_length
	CHECK (length(external_url) > 0),

	CONSTRAINT initiative_files_name_length
	CHECK (length(name) > 0),

	CONSTRAINT initiative_files_title_length
	CHECK (length(title) > 0),

	CONSTRAINT initiative_files_url_length
	CHECK (length(url) > 0),

	CONSTRAINT initiative_files_content_length
	CHECK (length(content) > 0),

	CONSTRAINT initiative_files_content_type_length
	CHECK (length(content_type) > 0)
);

CREATE INDEX index_initiative_files_on_initiative_uuid
ON initiative_files (initiative_uuid);

CREATE INDEX index_initiative_files_on_event_id
ON initiative_files (event_id);

CREATE UNIQUE INDEX index_initiative_files_on_event_id_and_external_id
ON initiative_files (event_id, external_id);
