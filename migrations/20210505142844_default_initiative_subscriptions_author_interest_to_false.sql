PRAGMA writable_schema = 1;

UPDATE sqlite_master
SET sql = replace(
	sql,
	'author_interest INTEGER NOT NULL DEFAULT 1',
	'author_interest INTEGER NOT NULL DEFAULT 0'
)
WHERE name = 'initiative_subscriptions';

PRAGMA writable_schema = 0;
