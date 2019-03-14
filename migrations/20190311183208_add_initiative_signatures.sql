CREATE TABLE initiative_signatures (
	initiative_uuid TEXT NOT NULL,
	user_uuid TEXT NOT NULL,
	updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
	hidden INTEGER NOT NULL DEFAULT 0,

	PRIMARY KEY (initiative_uuid, user_uuid),
	FOREIGN KEY (initiative_uuid) REFERENCES initiatives (uuid)
);
