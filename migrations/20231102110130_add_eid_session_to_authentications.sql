.dbconfig defensive off

ALTER TABLE authentications ADD COLUMN eid_session TEXT;

PRAGMA writable_schema = ON;

UPDATE sqlite_master
SET sql = replace(sql,
	'CHECK (country == upper(country))',
	'CHECK (country == upper(country)),

	CONSTRAINT eid_session_json
	CHECK (eid_session IS NULL OR json_valid(eid_session))'
)
WHERE name = 'authentications';

PRAGMA writable_schema = RESET;
