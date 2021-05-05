ALTER TABLE initiative_subscriptions
ADD COLUMN signable_interest INTEGER NOT NULL DEFAULT 0;

PRAGMA writable_schema = 1;

UPDATE sqlite_master
SET sql = replace(
	sql,
	'CHECK (initiative_uuid IS NULL OR NOT new_interest)',
	'CHECK (initiative_uuid IS NULL OR NOT new_interest),

	CONSTRAINT signable_interest_for_all_initiatives
	CHECK (initiative_uuid IS NULL OR NOT signable_interest)'
)
WHERE name = 'initiative_subscriptions';

PRAGMA writable_schema = 0;
