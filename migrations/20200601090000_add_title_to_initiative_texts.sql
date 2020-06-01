ALTER TABLE initiative_texts
ADD COLUMN title TEXT;

UPDATE initiative_texts
SET title = (
	SELECT title FROM initiatives AS initiative
	WHERE initiative.uuid = initiative_uuid
)
WHERE title IS NULL;

PRAGMA writable_schema = 1;
	
UPDATE sqlite_master
SET sql = replace(
	sql,
	'title TEXT',
	'title TEXT NOT NULL'
)
WHERE name = 'initiative_texts';

UPDATE sqlite_master
SET sql = replace(
	sql,
	'CONSTRAINT content_type CHECK (length(content_type) > 0)',
	'CONSTRAINT content_type_length CHECK (length(content_type) > 0),
	CONSTRAINT title_length CHECK (length(title) > 0)'
)
WHERE name = 'initiative_texts';

PRAGMA writable_schema = 0;
