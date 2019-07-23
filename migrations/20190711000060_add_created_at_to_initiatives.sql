ALTER TABLE initiatives
ADD COLUMN created_at TEXT;

PRAGMA writable_schema = 1;

UPDATE sqlite_master
SET sql = replace(
	sql,
	'created_at TEXT',
	'created_at TEXT DEFAULT (strftime(''%Y-%m-%dT%H:%M:%fZ'', ''now''))'
)
WHERE name = 'initiatives';

PRAGMA writable_schema = 0;
