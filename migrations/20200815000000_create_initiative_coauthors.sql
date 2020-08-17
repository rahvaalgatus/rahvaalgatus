CREATE TABLE initiative_coauthors (
	initiative_uuid TEXT NOT NULL,
	country TEXT NOT NULL,
	personal_id TEXT NOT NULL,
	user_id INTEGER,
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	status TEXT NOT NULL DEFAULT 'pending',
	status_updated_at TEXT,

	PRIMARY KEY (initiative_uuid, country, personal_id),
	FOREIGN KEY (initiative_uuid) REFERENCES initiatives (uuid) ON DELETE CASCADE,

	FOREIGN KEY (user_id, country, personal_id)
	REFERENCES users (id, country, personal_id),

	CONSTRAINT country_length CHECK (length(country) = 2),
	CONSTRAINT country_uppercase CHECK (country == upper(country)),
	CONSTRAINT personal_id_length CHECK (length(personal_id) > 0),

	CONSTRAINT user_id_only_if_accepted
	CHECK ((user_id IS NOT NULL) = (status = 'accepted'))
);

CREATE INDEX index_initiative_coauthors_on_country_and_personal_id
ON initiative_coauthors (country, personal_id);

CREATE INDEX index_initiative_coauthors_on_user_id
ON initiative_coauthors (user_id);

-- For coauthors' foreign key.
CREATE UNIQUE INDEX index_users_on_id_and_country_and_personal_id
ON users (id, country, personal_id);
