CREATE TABLE signers (
	id INTEGER PRIMARY KEY NOT NULL,
	country TEXT NOT NULL,
	personal_id TEXT NOT NULL,
	first_signed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	last_signed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),

	CONSTRAINT country_length CHECK (length(country) = 2),
	CONSTRAINT country_uppercase CHECK (country == upper(country)),
	CONSTRAINT personal_id_length CHECK (length(personal_id) > 0)
);

CREATE UNIQUE INDEX index_signers_on_country_and_personal_id
ON signers (country, personal_id)
WHERE length(personal_id) > 7;
