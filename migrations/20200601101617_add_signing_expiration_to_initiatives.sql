ALTER TABLE initiatives
ADD COLUMN signing_expired_at TEXT;

ALTER TABLE initiatives
ADD COLUMN signing_expiration_email_sent_at TEXT;

PRAGMA writable_schema = 1;

UPDATE sqlite_master
SET sql = replace(
	sql,
	'CHECK (phase != ''sign'' OR signing_ends_at IS NOT NULL),',
	'CHECK (phase != ''sign'' OR signing_ends_at IS NOT NULL),

	CONSTRAINT signing_expired_at_phase
	CHECK (signing_expired_at IS NULL OR phase == ''sign''),'
)
WHERE name = 'initiatives';

PRAGMA writable_schema = 0;
