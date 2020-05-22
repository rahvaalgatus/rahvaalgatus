ALTER TABLE initiative_signatures
ADD COLUMN signer_id INTEGER;

PRAGMA writable_schema = 1;
	
UPDATE sqlite_master
SET sql = replace(
	sql,
	'CONSTRAINT initiative_signables_country_length CHECK (length(country) = 2),',

	'FOREIGN KEY (signer_id) REFERENCES signers (id),

	CONSTRAINT signer_id_not_null
	CHECK (signer_id IS NOT NULL OR personal_id IS NOT NULL);

	CONSTRAINT initiative_signables_country_length CHECK (length(country) = 2)'
)
WHERE name = 'initiative_signatures';

PRAGMA writable_schema = 0;

UPDATE initiative_signatures AS sig SET signer_id = (
	SELECT id FROM signers
	WHERE country = sig.country AND personal_id = sig.personal_id
);

CREATE INDEX index_initiative_signatures_on_signer_id
ON initiative_signatures (signer_id)
WHERE signer_id IS NOT NULL;

CREATE TRIGGER create_signer_on_initiative_signature
AFTER INSERT ON initiative_signatures FOR EACH ROW
WHEN NEW.signer_id IS NULL
BEGIN
	INSERT INTO signers (country, personal_id, first_signed_at, last_signed_at)
	VALUES (NEW.country, NEW.personal_id, NEW.created_at, NEW.created_at)
	ON CONFLICT (country, personal_id)
	WHERE length(personal_id) > 7
	DO UPDATE SET
		first_signed_at = min(first_signed_at, excluded.first_signed_at),
		last_signed_at = max(last_signed_at, excluded.last_signed_at);

	UPDATE initiative_signatures SET signer_id = (
		SELECT id FROM signers
		WHERE country = initiative_signatures.country
		AND personal_id = initiative_signatures.personal_id
	) WHERE rowid = NEW.rowid;
END;
