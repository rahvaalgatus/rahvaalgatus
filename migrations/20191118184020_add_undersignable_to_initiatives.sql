ALTER TABLE initiatives
ADD COLUMN undersignable INTEGER NOT NULL DEFAULT 0;

PRAGMA writable_schema = 1;
	
UPDATE sqlite_master
SET sql = replace(
	sql,
	'CONSTRAINT initiatives_text_sha256_length CHECK (length(text_sha256) = 32)',
	'CONSTRAINT initiatives_text_sha256_length CHECK (length(text_sha256) = 32),

	CONSTRAINT initiatives_undersignable_and_text
	CHECK (NOT undersignable OR phase = ''edit'' OR text IS NOT NULL)')
WHERE name = 'initiatives';

PRAGMA writable_schema = 0;
