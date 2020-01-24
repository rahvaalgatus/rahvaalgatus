PRAGMA writable_schema = 1;

UPDATE sqlite_master
SET sql = replace(
	sql,
	'country TEXT NOT NULL',
	'country TEXT'
)
WHERE name = 'users';

UPDATE sqlite_master
SET sql = replace(
	sql,
	'personal_id TEXT NOT NULL',
	'personal_id TEXT'
)
WHERE name = 'users';

UPDATE sqlite_master
SET sql = replace(
	sql,
	'official_name TEXT NOT NULL',
	'official_name TEXT'
)
WHERE name = 'users';

UPDATE sqlite_master
SET sql = replace(
	sql,
	'CHECK (email <> unconfirmed_email)',
	'CHECK (email <> unconfirmed_email),

	CONSTRAINT users_country_and_personal_id
	CHECK ((country IS NULL) = (personal_id IS NULL)),

	CONSTRAINT users_personal_id_and_official_name
	CHECK ((personal_id IS NULL) = (official_name IS NULL)),

	CONSTRAINT users_personal_id_or_email
	CHECK (
		personal_id IS NOT NULL OR
		email IS NOT NULL OR
		unconfirmed_email IS NOT NULL
	)')
WHERE name = 'users';

PRAGMA writable_schema = 0;
