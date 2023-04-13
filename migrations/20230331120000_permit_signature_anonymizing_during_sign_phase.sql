PRAGMA writable_schema = 1;

UPDATE sqlite_master
SET sql = replace(sql,
	'CONSTRAINT signatures_anonymized_only_when_received CHECK (
		signatures_anonymized_at IS NULL OR CASE destination
			WHEN ''parliament'' THEN received_by_parliament_at IS NOT NULL
			ELSE received_by_government_at IS NOT NULL
		END
	)',

	'CONSTRAINT signatures_anonymized_only_when_expired_or_received CHECK (
		signatures_anonymized_at IS NULL OR

		signing_expired_at IS NOT NULL OR CASE destination
			WHEN ''parliament'' THEN received_by_parliament_at IS NOT NULL
			ELSE received_by_government_at IS NOT NULL
		END
	)'
)
WHERE name = 'initiatives';

PRAGMA writable_schema = 0;
