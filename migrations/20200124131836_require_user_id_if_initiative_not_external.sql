PRAGMA writable_schema = 1;
	
UPDATE sqlite_master
SET sql = replace(
	sql,
	'CONSTRAINT initiatives_mailchimp_interest_id',
	'CONSTRAINT initiatives_user_id_or_external
	CHECK ((user_id IS NULL) = external),

	CONSTRAINT initiatives_mailchimp_interest_id'
)
WHERE name = 'initiatives';

PRAGMA writable_schema = 0;
