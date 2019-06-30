CREATE TABLE comments (
	id INTEGER PRIMARY KEY NOT NULL,
	uuid TEXT,
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	initiative_uuid TEXT NOT NULL,
	user_uuid TEXT NOT NULL,
	parent_id INTEGER,
	title TEXT NOT NULL DEFAULT '',
	"text" TEXT NOT NULL DEFAULT '',

	FOREIGN KEY (parent_id) REFERENCES comments (id),
	FOREIGN KEY (initiative_uuid) REFERENCES initiatives (uuid),

	CONSTRAINT comments_title_present
	CHECK (
		(title != '' AND parent_id IS NULL) OR
		(title = '' AND parent_id IS NOT NULL)
	),

	CONSTRAINT comments_title_length
	CHECK (length(title) <= 140),

	CONSTRAINT comments_text_length
	CHECK (text != '' AND length(text) <= 3000)
);

CREATE UNIQUE INDEX index_comments_on_uuid
ON comments (uuid);

CREATE INDEX index_comments_on_parent_id
ON comments (parent_id);

CREATE INDEX index_comments_on_initiative_uuid
ON comments (initiative_uuid);
