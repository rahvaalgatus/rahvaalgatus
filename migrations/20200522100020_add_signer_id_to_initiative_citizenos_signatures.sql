ALTER TABLE initiative_citizenos_signatures
ADD COLUMN signer_id INTEGER;

PRAGMA writable_schema = 1;
	
UPDATE sqlite_master
SET sql = replace(
	sql,
	'FOREIGN KEY (initiative_uuid) REFERENCES initiatives (uuid),',

	'FOREIGN KEY (initiative_uuid) REFERENCES initiatives (uuid),
	FOREIGN KEY (signer_id) REFERENCES signers (id),

	CONSTRAINT signer_id_not_null
	CHECK (signer_id IS NOT NULL OR personal_id IS NOT NULL),'
)
WHERE name = 'initiative_citizenos_signatures';

PRAGMA writable_schema = 0;

UPDATE initiative_citizenos_signatures AS sig SET signer_id = (
	SELECT id FROM signers
	WHERE country = sig.country AND personal_id = sig.personal_id
);

CREATE INDEX index_initiative_citizenos_signatures_on_signer_id
ON initiative_citizenos_signatures (signer_id)
WHERE signer_id IS NOT NULL;
