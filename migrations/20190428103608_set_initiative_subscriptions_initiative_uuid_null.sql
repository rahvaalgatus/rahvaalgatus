PRAGMA writable_schema = 1;

UPDATE sqlite_master
SET sql = replace(sql,
	'initiative_uuid TEXT NOT NULL',
	'initiative_uuid TEXT NULL'
)
WHERE name = 'initiative_subscriptions';

PRAGMA writable_schema = 0;
