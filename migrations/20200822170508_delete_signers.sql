DROP TRIGGER  create_signer_on_initiative_signature;

DROP INDEX index_initiative_signatures_on_signer_id;
UPDATE initiative_signatures SET signer_id = NULL;

DROP INDEX index_initiative_citizenos_signatures_on_signer_id;

PRAGMA writable_schema = 1;
	
UPDATE sqlite_master
SET sql = replace(
	sql,
	'FOREIGN KEY (signer_id) REFERENCES signers (id),

	CONSTRAINT signer_id_not_null
	CHECK (signer_id IS NOT NULL OR personal_id IS NOT NULL),
',

	''
)
WHERE name = 'initiative_citizenos_signatures';

PRAGMA writable_schema = 0;

UPDATE initiative_citizenos_signatures SET signer_id = NULL;

DROP TABLE signers;
