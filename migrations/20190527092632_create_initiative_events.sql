CREATE TABLE "initiative_events" (
	id INTEGER PRIMARY KEY NOT NULL,
	initiative_uuid TEXT NOT NULL,
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
	updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
	occurred_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
	created_by TEXT,
	title TEXT NOT NULL,
	"text" TEXT NOT NULL,

	FOREIGN KEY (initiative_uuid) REFERENCES initiatives (uuid),

	CONSTRAINT initiative_events_title_length
	CHECK (length(title) > 0),

	CONSTRAINT initiative_events_text_length
	CHECK (length("text") > 0)
);

CREATE INDEX index_initiative_events_on_initiative_uuid
ON initiative_events (initiative_uuid);
