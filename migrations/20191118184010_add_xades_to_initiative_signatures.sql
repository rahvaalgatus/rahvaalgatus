-- As of Dec 6, 2019 there are no rows in the initiatives_signatures table on
-- the production database, so it's safe to drop.
DROP TABLE initiative_signatures;

CREATE TABLE initiative_signatures (
	initiative_uuid TEXT NOT NULL,
	country TEXT NOT NULL,
	personal_id TEXT NOT NULL,
	token BLOB UNIQUE NOT NULL DEFAULT (randomblob(12)),
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
	updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
	xades TEXT NOT NULL,
	hidden INTEGER NOT NULL DEFAULT 0,
	oversigned INTEGER NOT NULL DEFAULT 0,

	PRIMARY KEY (initiative_uuid, country, personal_id),
	FOREIGN KEY (initiative_uuid) REFERENCES initiatives (uuid)

	CONSTRAINT initiative_signatures_country_length CHECK (length(country) = 2),

	CONSTRAINT initiative_signatures_personal_id_length
	CHECK (length(personal_id) > 0),

	CONSTRAINT initiative_signatures_token_length CHECK (length(token) > 0),
	CONSTRAINT initiative_signatures_xades_length CHECK (length(xades) > 0)
);

CREATE INDEX index_signatures_on_country_and_personal_id
ON initiative_signatures (country, personal_id);
