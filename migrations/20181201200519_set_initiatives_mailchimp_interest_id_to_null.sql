PRAGMA writable_schema = 1;

UPDATE sqlite_master
SET sql = replace(
	sql,
	'mailchimp_interest_id STRING NOT NULL',
	'mailchimp_interest_id STRING NULL'
)
WHERE name = 'initiatives';

PRAGMA writable_schema = 0;
