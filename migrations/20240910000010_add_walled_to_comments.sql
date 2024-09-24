.dbconfig defensive off

BEGIN;

ALTER TABLE comments ADD COLUMN walled INTEGER;
ALTER TABLE comments ADD COLUMN walled_at TEXT;
ALTER TABLE comments ADD COLUMN walled_by_id INTEGER;

PRAGMA writable_schema = ON;

UPDATE sqlite_master
SET sql = replace(sql,
	'FOREIGN KEY (initiative_uuid) REFERENCES initiatives (uuid),',
	'FOREIGN KEY (initiative_uuid) REFERENCES initiatives (uuid),
	FOREIGN KEY (walled_by_id) REFERENCES users (id),'
)
WHERE name = 'comments';

UPDATE sqlite_master
SET sql = replace(sql,
	'<= 3000)',
	'<= 3000),

	CONSTRAINT walled_at_format CHECK (walled_at GLOB ''*-*-*T*:*:*Z''),
	CONSTRAINT walled_with_at CHECK ((walled IS NULL) = (walled_at IS NULL)),
	CONSTRAINT walled_with_by CHECK ((walled IS NULL) = (walled_by_id IS NULL))'
)
WHERE name = 'comments';

PRAGMA writable_schema = RESET;

CREATE INDEX index_comments_on_walled_by
ON comments (walled_by_id)
WHERE walled_by_id IS NOT NULL;

COMMIT;
