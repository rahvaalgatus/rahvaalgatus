PRAGMA writable_schema = 1;

UPDATE sqlite_master
SET sql = replace(
	sql,
	'FOREIGN KEY (initiative_uuid) REFERENCES initiatives (uuid)',
	'FOREIGN KEY (initiative_uuid) REFERENCES initiatives (uuid) ON DELETE CASCADE'
)
WHERE name = 'initiative_events';

UPDATE sqlite_master
SET sql = replace(
	sql,
	'FOREIGN KEY (initiative_uuid) REFERENCES initiatives (uuid)',
	'FOREIGN KEY (initiative_uuid) REFERENCES initiatives (uuid) ON DELETE CASCADE'
)
WHERE name = 'initiative_files';

UPDATE sqlite_master
SET sql = replace(
	sql,
	'FOREIGN KEY (event_id) REFERENCES initiative_events (id)',
	'FOREIGN KEY (event_id) REFERENCES initiative_events (id) ON DELETE CASCADE'
)
WHERE name = 'initiative_files';

PRAGMA writable_schema = 0;
