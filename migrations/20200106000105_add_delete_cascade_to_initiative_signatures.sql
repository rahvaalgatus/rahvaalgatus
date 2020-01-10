PRAGMA writable_schema = 1;

-- It was also missing a trailing comma, which for some reason didn't bother
-- SQLite before.
UPDATE sqlite_master
SET sql = replace(
	sql,
	'FOREIGN KEY (initiative_uuid) REFERENCES initiatives (uuid)',
	'FOREIGN KEY (initiative_uuid) REFERENCES initiatives (uuid) ON DELETE CASCADE,'
)
WHERE name = 'initiative_signatures';

PRAGMA writable_schema = 0;
