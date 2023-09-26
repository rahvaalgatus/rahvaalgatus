.dbconfig defensive off

ALTER TABLE initiatives ADD COLUMN signature_threshold INTEGER;
ALTER TABLE initiatives ADD COLUMN signature_threshold_at TEXT;

PRAGMA writable_schema = 1;

UPDATE sqlite_master
SET sql = replace(sql,
	'CONSTRAINT signatures_anonymized_at_format',

	'CONSTRAINT signature_threshold_with_at
	CHECK ((signature_threshold IS NULL) = (signature_threshold_at IS NULL)),

	CONSTRAINT signatures_anonymized_at_format'
)
WHERE name = 'initiatives';

PRAGMA writable_schema = RESET;
