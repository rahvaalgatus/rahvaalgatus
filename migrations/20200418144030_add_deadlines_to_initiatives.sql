ALTER TABLE initiatives
ADD COLUMN discussion_ends_at TEXT;

ALTER TABLE initiatives
ADD COLUMN signing_started_at TEXT;

ALTER TABLE initiatives
ADD COLUMN signing_ends_at TEXT;

PRAGMA writable_schema = 1;

UPDATE sqlite_master
SET sql = replace(
	sql,
	'CONSTRAINT initiatives_destination',
	'CONSTRAINT discussion_ends_at_if_editing
	CHECK (
		published_at IS NULL OR
		phase != ''edit'' OR
		discussion_ends_at IS NOT NULL
	)

	CONSTRAINT signing_started_at_if_signing
	CHECK (phase != ''sign'' OR signing_started_at IS NOT NULL),

	CONSTRAINT signing_ends_at_if_signing
	CHECK (phase != ''sign'' OR signing_ends_at IS NOT NULL),

	CONSTRAINT initiatives_destination'
)
WHERE name = 'initiatives';

PRAGMA writable_schema = 0;
