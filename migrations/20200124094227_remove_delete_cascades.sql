PRAGMA writable_schema = 1;

UPDATE sqlite_master
SET sql = replace(
	sql,
	'initiatives (uuid) ON DELETE CASCADE',
	'initiatives (uuid)'
)
WHERE name = 'initiative_events';

UPDATE sqlite_master
SET sql = replace(
	sql,
	'initiatives (uuid) ON DELETE CASCADE',
	'initiatives (uuid)'
)
WHERE name = 'comments';

UPDATE sqlite_master
SET sql = replace(
	sql,
	'comments (id) ON DELETE CASCADE',
	'comments (id)'
)
WHERE name = 'comments';

UPDATE sqlite_master
SET sql = replace(
	sql,
	'initiatives (uuid) ON DELETE CASCADE',
	'initiatives (uuid)'
)
WHERE name = 'initiative_files';

UPDATE sqlite_master
SET sql = replace(
	sql,
	'initiatives (uuid) ON DELETE CASCADE',
	'initiatives (uuid)'
)
WHERE name = 'initiative_signatures';

PRAGMA writable_schema = 0;
