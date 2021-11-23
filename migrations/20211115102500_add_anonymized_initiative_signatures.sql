BEGIN;

ALTER TABLE initiatives
ADD COLUMN received_by_government_at TEXT;

ALTER TABLE initiatives
ADD COLUMN accepted_by_government_at TEXT;

ALTER TABLE initiatives
ADD COLUMN signatures_anonymized_at TEXT;

ALTER TABLE initiative_signatures
ADD COLUMN anonymized INTEGER NOT NULL DEFAULT 0;

CREATE TABLE initiative_signatures_new (
	id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
	initiative_uuid TEXT NOT NULL,
	country TEXT NOT NULL,
	personal_id TEXT NOT NULL,
	token BLOB UNIQUE,
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	created_from TEXT,
	updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	method TEXT NOT NULL,
	xades TEXT,
	hidden INTEGER NOT NULL DEFAULT 0,
	oversigned INTEGER NOT NULL DEFAULT 0,
	anonymized INTEGER NOT NULL DEFAULT 0,

	FOREIGN KEY (initiative_uuid) REFERENCES initiatives (uuid),

	CONSTRAINT country_format CHECK (country GLOB '[A-Z][A-Z]'),

	CONSTRAINT personal_id_format CHECK (CASE country
		WHEN 'EE' THEN CASE
			WHEN anonymized THEN personal_id GLOB '[0-9][0-9][0-9]'
			ELSE personal_id GLOB
				'[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]'
			END
		ELSE length(personal_id) > 0
	END),

	CONSTRAINT created_at_format CHECK (created_at GLOB '*-*-*T*:*:*Z'),
	CONSTRAINT updated_at_format CHECK (updated_at GLOB '*-*-*T*:*:*Z'),
	CONSTRAINT method_length CHECK (length(method) > 0),
	CONSTRAINT token_null CHECK (token IS NOT NULL = NOT anonymized),
	CONSTRAINT token_length CHECK (length(token) > 0),
	CONSTRAINT xades_null CHECK (xades IS NOT NULL = NOT anonymized),
	CONSTRAINT xades_length CHECK (length(xades) > 0),
	CONSTRAINT oversigned_not_negative CHECK (oversigned >= 0)
);

INSERT INTO initiative_signatures_new (
	id,
	initiative_uuid,
	country,
	personal_id,
	token,
	created_at,
	created_from,
	updated_at,
	method,
	xades,
	hidden,
	oversigned
)

SELECT
	rowid,
	initiative_uuid,
	country,
	personal_id,
	token,
	created_at,
	created_from,
	updated_at,
	method,
	xades,
	hidden,
	oversigned

FROM initiative_signatures;

DROP TABLE initiative_signatures;
ALTER TABLE initiative_signatures_new RENAME TO initiative_signatures;

CREATE INDEX index_signatures_on_initiatives_and_created_at
ON initiative_signatures (initiative_uuid, created_at);

CREATE UNIQUE INDEX index_signatures_on_initiative_country_and_personal_id
ON initiative_signatures (initiative_uuid, country, personal_id)
WHERE NOT anonymized;

CREATE INDEX index_signatures_on_country_and_personal_id
ON initiative_signatures (country, personal_id)
WHERE NOT anonymized;

CREATE TABLE initiative_citizenos_signatures_new (
	id INTEGER PRIMARY KEY NOT NULL,
	initiative_uuid TEXT NOT NULL,
	country TEXT NOT NULL,
	personal_id TEXT NOT NULL,
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	asic BLOB,
	anonymized INTEGER NOT NULL DEFAULT 0,

	FOREIGN KEY (initiative_uuid) REFERENCES initiatives (uuid),

	CONSTRAINT country_format CHECK (country GLOB '[A-Z][A-Z]'),

	CONSTRAINT personal_id_format CHECK (CASE country
		WHEN 'EE' THEN CASE
			WHEN anonymized THEN personal_id GLOB '[0-9][0-9][0-9]'
			ELSE personal_id GLOB
				'[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]'
			END
		ELSE length(personal_id) > 0
	END),

	CONSTRAINT created_at_format CHECK (created_at GLOB '*-*-*T*:*:*Z'),
	CONSTRAINT asic_null CHECK (asic IS NOT NULL = NOT anonymized),
	CONSTRAINT asic_length CHECK (length(asic) > 0)
);

INSERT INTO initiative_citizenos_signatures_new (
	id,
	initiative_uuid,
	country,
	personal_id,
	created_at,
	asic,
	anonymized
)

SELECT
	rowid,
	initiative_uuid,
	country,

	CASE
	WHEN asic IS NULL AND country = 'EE' THEN substr(personal_id, 1, 3)
	ELSE personal_id
	END AS personal_id,

	created_at,
	asic,
	asic IS NULL AS anonymized

FROM initiative_citizenos_signatures;

DROP TABLE initiative_citizenos_signatures;
ALTER TABLE initiative_citizenos_signatures_new
RENAME TO initiative_citizenos_signatures;

CREATE INDEX index_citizenos_signatures_on_initiative_uuid_and_created_at
ON initiative_citizenos_signatures (initiative_uuid, created_at);

CREATE UNIQUE INDEX
	index_citizenos_signatures_on_initiative_country_and_personal_id
ON initiative_citizenos_signatures (initiative_uuid, country, personal_id)
WHERE NOT anonymized;

CREATE INDEX index_citizenos_signatures_on_country_and_personal_id
ON initiative_citizenos_signatures (country, personal_id)
WHERE NOT anonymized;

PRAGMA writable_schema = 1;

UPDATE sqlite_master
SET sql = replace(
	sql,
	'CONSTRAINT signing_expired_at_phase',

	'CONSTRAINT received_by_government_at_format
	CHECK (received_by_government_at GLOB ''*-*-*T*:*:*Z''),

	CONSTRAINT accepted_by_government_at_format
	CHECK (accepted_by_government_at GLOB ''*-*-*T*:*:*Z''),

	CONSTRAINT signatures_anonymized_at_format
	CHECK (signatures_anonymized_at GLOB ''*-*-*T*:*:*Z''),

	CONSTRAINT signatures_anonymized_only_when_accepted CHECK (
		signatures_anonymized_at IS NULL OR CASE destination
			WHEN ''parliament'' THEN accepted_by_parliament_at IS NOT NULL
			ELSE accepted_by_government_at IS NOT NULL
		END
	),

	CONSTRAINT signing_expired_at_phase'
)
WHERE name = 'initiatives';

PRAGMA writable_schema = 0;

COMMIT;
