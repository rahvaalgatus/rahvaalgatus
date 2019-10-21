CREATE TABLE initiative_images (
	initiative_uuid TEXT PRIMARY KEY NOT NULL,
	data BLOB NOT NULL,
	type TEXT NOT NULL,
	preview BLOB NOT NULL,

	FOREIGN KEY (initiative_uuid) REFERENCES initiatives (uuid) ON DELETE CASCADE
);
