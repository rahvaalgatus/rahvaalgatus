ALTER TABLE initiative_events
ADD COLUMN notified_at TEXT;

PRAGMA writable_schema = 1;

UPDATE sqlite_master
SET sql = replace(sql,
	'CONSTRAINT initiative_events_title_length',

	'CONSTRAINT notified_at_format CHECK (notified_at GLOB ''*-*-*T*:*:*Z''),
	CONSTRAINT initiative_events_title_length'
)
WHERE name = 'initiative_events';

PRAGMA writable_schema = 0;
