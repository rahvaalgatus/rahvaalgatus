PRAGMA writable_schema = 1;

UPDATE sqlite_master
SET sql = replace(
	sql,
	'%Y-%m-%dT%H:%M:%SZ',
	'%Y-%m-%dT%H:%M:%fZ'
)
WHERE name = 'initiative_messages';

UPDATE sqlite_master
SET sql = replace(
	sql,
	'%Y-%m-%dT%H:%M:%SZ',
	'%Y-%m-%dT%H:%M:%fZ'
)
WHERE name = 'initiative_events';

UPDATE sqlite_master
SET sql = replace(
	sql,
	'%Y-%m-%dT%H:%M:%SZ',
	'%Y-%m-%dT%H:%M:%fZ'
)
WHERE name = 'initiative_subscriptions';

UPDATE sqlite_master
SET sql = replace(
	sql,
	'%Y-%m-%dT%H:%M:%SZ',
	'%Y-%m-%dT%H:%M:%fZ'
)
WHERE name = 'initiative_signatures';

PRAGMA writable_schema = 0;
