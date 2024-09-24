CREATE TABLE initiative_comment_reports (
	id INTEGER PRIMARY KEY NOT NULL,
	initiative_id INTEGER NOT NULL,
	comment_id INTEGER NOT NULL,
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	created_by_id INTEGER NOT NULL,

	FOREIGN KEY (initiative_id) REFERENCES initiatives (id),
	FOREIGN KEY (comment_id) REFERENCES comments (id),
	FOREIGN KEY (created_by_id) REFERENCES users (id),

	CONSTRAINT created_at_format CHECK (created_at GLOB '*-*-*T*:*:*Z')
);

CREATE INDEX index_initiative_comment_reports_on_initiative
ON initiative_comment_reports (initiative_id);

CREATE UNIQUE INDEX index_initiative_comment_reports_on_comment_and_user
ON initiative_comment_reports (comment_id, created_by_id);

CREATE INDEX index_initiative_comment_reports_on_created_by
ON initiative_comment_reports (created_by_id);

CREATE INDEX index_initiative_comment_reports_on_created_at
ON initiative_comment_reports (created_at DESC);
