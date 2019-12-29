ALTER TABLE initiatives
ADD COLUMN text TEXT;

ALTER TABLE initiatives
ADD COLUMN text_type TEXT;

ALTER TABLE initiatives
ADD COLUMN text_sha256 BLOB;

PRAGMA writable_schema = 1;

UPDATE sqlite_master
SET sql = replace(
	sql,
	'CHECK (length(mailchimp_interest_id) > 0)',
	'CHECK (length(mailchimp_interest_id) > 0),

	CONSTRAINT initiatives_text_not_null
	CHECK (external OR (text IS NULL) = (phase = ''edit'')),

	CONSTRAINT initiatives_text_type_not_null
	CHECK ((text IS NULL) = (text_type IS NULL)),

	CONSTRAINT initiatives_text_type_length CHECK (length(text_type) > 0),

	CONSTRAINT initiatives_text_sha256_not_null
	CHECK ((text IS NULL) = (text_sha256 IS NULL)),

	CONSTRAINT initiatives_text_sha256_length CHECK (length(text_sha256) = 32)'
)
WHERE name = 'initiatives';

PRAGMA writable_schema = 0;
