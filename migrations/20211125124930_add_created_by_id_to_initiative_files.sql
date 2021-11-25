ALTER TABLE initiative_files
ADD COLUMN created_by_id INTEGER;

PRAGMA writable_schema = 1;

UPDATE sqlite_master
SET sql = replace(sql,
	'FOREIGN KEY (event_id) REFERENCES initiative_events (id) ON DELETE CASCADE,',

	'FOREIGN KEY (event_id) REFERENCES initiative_events (id) ON DELETE CASCADE,
	FOREIGN KEY (created_by_id) REFERENCES users (id),'
)
WHERE name = 'initiative_files';

PRAGMA writable_schema = 0;
