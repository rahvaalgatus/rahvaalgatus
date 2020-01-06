ALTER TABLE initiatives
ADD COLUMN destination TEXT;

UPDATE initiatives
SET destination = 'parliament'
WHERE phase != 'edit';

PRAGMA writable_schema = 1;
	
UPDATE sqlite_master
SET sql = replace(
	sql,
	'CHECK (NOT undersignable OR phase = ''edit'' OR text IS NOT NULL)',
	'CHECK (NOT undersignable OR phase = ''edit'' OR text IS NOT NULL),

	CONSTRAINT initiatives_destination
	CHECK (destination IS NOT NULL OR phase = ''edit'')')
WHERE name = 'initiatives';

PRAGMA writable_schema = 0;
