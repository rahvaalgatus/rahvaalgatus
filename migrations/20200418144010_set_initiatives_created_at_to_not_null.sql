PRAGMA writable_schema = 1;

UPDATE sqlite_master
SET sql = replace(
	sql,
	'created_at TEXT',
	'created_at TEXT NOT NULL'
)
WHERE name = 'initiatives';

PRAGMA writable_schema = 0;
