.dbconfig defensive off

BEGIN;

UPDATE comments
SET created_at = replace(replace(created_at, '+00', 'Z'), ' ', 'T')
WHERE created_at GLOB '*+00';

UPDATE comments
SET updated_at = replace(replace(updated_at, '+00', 'Z'), ' ', 'T')
WHERE updated_at GLOB '*+00';

PRAGMA writable_schema = ON;

UPDATE sqlite_master
SET sql = replace(sql,
	'CONSTRAINT comments_title_present',
	'CONSTRAINT created_at_format CHECK (created_at GLOB ''*-*-*T*:*:*Z''),
	CONSTRAINT updated_at_format CHECK (updated_at GLOB ''*-*-*T*:*:*Z''),

	CONSTRAINT comments_title_present'
)
WHERE name = 'comments';

PRAGMA writable_schema = RESET;

COMMIT;
