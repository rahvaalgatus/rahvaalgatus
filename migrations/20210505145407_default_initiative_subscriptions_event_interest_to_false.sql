PRAGMA writable_schema = 1;

UPDATE sqlite_master
SET sql = replace(
	sql,
	'event_interest INTEGER NOT NULL DEFAULT 1',
	'event_interest INTEGER NOT NULL DEFAULT 0'
)
WHERE name = 'initiative_subscriptions';

PRAGMA writable_schema = 0;
