ALTER TABLE initiative_subscriptions
ADD COLUMN new_interest INTEGER NOT NULL DEFAULT 0;

PRAGMA writable_schema = 1;

UPDATE sqlite_master
SET sql = replace(
	sql,
	'CHECK (length(update_token) > 0)',
	'CHECK (length(update_token) > 0),

	CONSTRAINT new_interest_for_all_initiatives
	CHECK (initiative_uuid IS NULL OR NOT new_interest)'
)
WHERE name = 'initiative_subscriptions';

PRAGMA writable_schema = 0;
