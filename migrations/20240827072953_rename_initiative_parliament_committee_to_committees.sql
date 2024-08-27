.dbconfig defensive off

BEGIN;

ALTER TABLE initiatives
RENAME COLUMN parliament_committee TO parliament_committees;

UPDATE initiatives
SET parliament_committees = CASE
	WHEN parliament_committees IS NULL THEN '[]'
	ELSE json_array(parliament_committees)
END;

PRAGMA writable_schema = ON;

UPDATE sqlite_master
SET sql = replace(sql,
	'parliament_committees TEXT',
	'parliament_committees TEXT NOT NULL DEFAULT ''[]'''
)
WHERE name = 'initiatives';

UPDATE sqlite_master
SET sql = replace(sql,
	'CONSTRAINT parliament_uuid_length',
	'CONSTRAINT parliament_committees_json
	CHECK (json_valid(parliament_committees)),

	CONSTRAINT parliament_uuid_length'
)
WHERE name = 'initiatives';

PRAGMA writable_schema = RESET;

UPDATE initiative_events

SET content = json_remove(json_set(content, '$.committees', CASE
	WHEN json_extract(content, '$.committee') IS NULL THEN json_array()
	ELSE json_array(json_extract(content, '$.committee'))
END), '$.committee')

WHERE type = 'parliament-accepted' AND json_valid(content);

COMMIT;
