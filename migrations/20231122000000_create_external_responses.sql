CREATE TABLE external_responses (
	id INTEGER PRIMARY KEY NOT NULL,
	origin TEXT NOT NULL,
	path TEXT NOT NULL,
	requested_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	requested_count INTEGER NOT NULL DEFAULT 1,
	updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	updated_count INTEGER NOT NULL DEFAULT 1,
	status_code INTEGER NOT NULL,
	status_message TEXT NOT NULL,
	headers TEXT NOT NULL DEFAULT '{}',
	etag TEXT,
	body_type TEXT,
	body BLOB,
	duration INTEGER,

	CONSTRAINT origin_length CHECK (length(origin) > 0),
	CONSTRAINT path_length CHECK (length(path) > 0),

	CONSTRAINT requested_at_format CHECK (requested_at GLOB '*-*-*T*:*:*Z'),
	CONSTRAINT updated_at_format CHECK (updated_at GLOB '*-*-*T*:*:*Z'),
	CONSTRAINT status_code_range CHECK (status_code >= 100 AND status_code < 600),
	CONSTRAINT headers_json CHECK (json_valid(headers)),
	CONSTRAINT etag_length CHECK (length(etag) > 0),
	CONSTRAINT body_type_length CHECK (length(body_type) > 0),
	CONSTRAINT duration_nonnegative CHECK (duration >= 0),
	CONSTRAINT requested_count_positive CHECK (requested_count > 0),
	CONSTRAINT updated_count_positive CHECK (updated_count > 0),

	CONSTRAINT updated_lte_requested_count
	CHECK (updated_count <= requested_count)
);

CREATE UNIQUE INDEX index_external_responses_on_origin_path
ON external_responses (origin, path);
