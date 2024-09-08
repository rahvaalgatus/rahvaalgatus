.dbconfig defensive off

BEGIN;

ALTER TABLE initiatives ADD COLUMN last_event_created_at TEXT;

PRAGMA writable_schema = ON;

UPDATE sqlite_master
SET sql = replace(sql,
	'CONSTRAINT archived_at_format',
	'CONSTRAINT last_event_created_at_format
	CHECK (last_event_created_at GLOB ''*-*-*T*:*:*Z''),

	CONSTRAINT archived_at_format'
)
WHERE name = 'initiatives';

PRAGMA writable_schema = RESET;

UPDATE initiatives AS initiative SET last_event_created_at = (
	SELECT created_at FROM initiative_events AS event
	WHERE event.initiative_uuid = initiative.uuid
	ORDER BY created_at DESC
	LIMIT 1
)
WHERE last_event_created_at IS NULL;

CREATE TRIGGER set_initiative_last_event_created_at_on_create
AFTER INSERT ON initiative_events
FOR EACH ROW BEGIN
  UPDATE initiatives SET last_event_created_at = COALESCE(
		max(last_event_created_at, NEW.created_at),
		NEW.created_at
	)
  WHERE uuid = NEW.initiative_uuid;
END;

CREATE INDEX index_initiatives_on_last_event_created_at
ON initiatives (last_event_created_at DESC)
WHERE last_event_created_at IS NOT NULL;

COMMIT;
