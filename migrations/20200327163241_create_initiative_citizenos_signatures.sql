CREATE TABLE initiative_citizenos_signatures (
	initiative_uuid TEXT NOT NULL,
	country TEXT NOT NULL,
	personal_id TEXT NOT NULL,
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	asic BLOB,

	PRIMARY KEY (initiative_uuid, country, personal_id),
	FOREIGN KEY (initiative_uuid) REFERENCES initiatives (uuid),

	CONSTRAINT country_length CHECK (length(country) = 2),
	CONSTRAINT country_uppercase CHECK (country == upper(country)),
	CONSTRAINT personal_id_length CHECK (length(personal_id) > 0),
	CONSTRAINT asic_length CHECK (length(asic) > 0)
);

CREATE INDEX index_citizenos_signatures_on_country_and_personal_id
ON initiative_citizenos_signatures (country, personal_id);

CREATE INDEX index_citizenos_signatures_on_initiative_uuid_and_created_at
ON initiative_citizenos_signatures (initiative_uuid, created_at);
