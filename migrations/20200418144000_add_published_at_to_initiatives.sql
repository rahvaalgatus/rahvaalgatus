ALTER TABLE initiatives
ADD COLUMN published_at TEXT;

PRAGMA writable_schema = 1;

UPDATE sqlite_master
SET sql = replace(
	sql,
	'CONSTRAINT initiatives_destination',
	'CONSTRAINT published_or_in_edit
	CHECK (published_at IS NOT NULL OR phase = ''edit''),

	CONSTRAINT initiatives_destination'
)
WHERE name = 'initiatives';

PRAGMA writable_schema = 0;

UPDATE initiatives
SET published_at = received_by_parliament_at
WHERE external;

PRAGMA writable_schema = 1;

UPDATE sqlite_master
SET sql = replace(
	sql,
	'CONSTRAINT initiatives_destination',
	'CONSTRAINT published_when_external
	CHECK (published_at IS NOT NULL OR NOT external),

	CONSTRAINT initiatives_destination'
)
WHERE name = 'initiatives';

PRAGMA writable_schema = 0;
