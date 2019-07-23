ALTER TABLE initiative_events
ADD COLUMN external_id TEXT;

ALTER TABLE initiative_events
ADD COLUMN type TEXT NOT NULL DEFAULT 'text';

PRAGMA writable_schema = 1;

UPDATE sqlite_master
SET sql = replace(sql, '"text"', 'content')
WHERE name = 'initiative_events';

UPDATE sqlite_master
SET sql = replace(sql, 'title TEXT NOT NULL', 'title TEXT')
WHERE name = 'initiative_events';

UPDATE sqlite_master
SET sql = replace(sql, 'content TEXT NOT NULL', 'content TEXT')
WHERE name = 'initiative_events';

PRAGMA writable_schema = 0;
