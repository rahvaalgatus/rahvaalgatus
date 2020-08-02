PRAGMA writable_schema = 1;
	
UPDATE sqlite_master
SET sql = replace(
	sql,
	'CHECK (destination IS NOT NULL OR phase = ''edit'')',

	'CHECK (destination IS NOT NULL OR phase = ''edit''),

	CONSTRAINT phase_not_parliament_when_local
	CHECK (phase != ''parliament'' OR destination == ''parliament'')'
)
WHERE name = 'initiatives';

PRAGMA writable_schema = 0;
