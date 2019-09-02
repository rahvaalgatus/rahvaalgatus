PRAGMA writable_schema = 1;

UPDATE sqlite_master
SET sql = replace(
	sql,
	'FOREIGN KEY (initiative_uuid) REFERENCES initiatives (uuid)',
	'FOREIGN KEY (initiative_uuid) REFERENCES initiatives (uuid) ON DELETE CASCADE'
)
WHERE name = 'initiative_messages';

PRAGMA writable_schema = 0;
