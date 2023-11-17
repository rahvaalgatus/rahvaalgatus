.dbconfig defensive off

ALTER TABLE initiative_signables ADD COLUMN eid_session TEXT;

PRAGMA writable_schema = ON;

UPDATE sqlite_master
SET sql = replace(sql,
	'CONSTRAINT initiative_signables_xades_length CHECK (length(xades) > 0)',
	'CONSTRAINT initiative_signables_xades_length CHECK (length(xades) > 0),

	CONSTRAINT eid_session_json
	CHECK (eid_session IS NULL OR json_valid(eid_session))'
)
WHERE name = 'initiative_signables';

PRAGMA writable_schema = RESET;
