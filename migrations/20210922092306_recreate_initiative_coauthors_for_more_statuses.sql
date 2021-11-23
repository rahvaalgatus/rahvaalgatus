BEGIN;

CREATE TABLE initiative_coauthors_new (
	id INTEGER PRIMARY KEY NOT NULL,
	initiative_uuid TEXT NOT NULL,
	country TEXT NOT NULL,
	personal_id TEXT NOT NULL,
	user_id INTEGER,
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	created_by_id INTEGER NOT NULL,
	status TEXT NOT NULL DEFAULT 'pending',
	status_updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	status_updated_by_id INTEGER NOT NULL,

	FOREIGN KEY (initiative_uuid) REFERENCES initiatives (uuid) ON DELETE CASCADE,

	FOREIGN KEY (user_id, country, personal_id)
	REFERENCES users (id, country, personal_id),

	FOREIGN KEY (created_by_id) REFERENCES users (id),
	FOREIGN KEY (status_updated_by_id) REFERENCES users (id),

	CONSTRAINT country_format CHECK (country GLOB '[A-Z][A-Z]'),
	CONSTRAINT personal_id_length CHECK (length(personal_id) > 0),

	CONSTRAINT user_id_unless_pending_or_cancelled
	CHECK ((user_id IS NULL) = (status IN ('pending', 'cancelled')))
);

INSERT INTO initiative_coauthors_new (
	id,
	initiative_uuid,
	country,
	personal_id,
	user_id,
	created_at,
	created_by_id,
	status,
	status_updated_at,
	status_updated_by_id
)

SELECT
	coauthor.rowid,
	coauthor.initiative_uuid,
	coauthor.country,
	coauthor.personal_id,

	CASE coauthor.status
	WHEN 'accepted' THEN coauthor.user_id
	WHEN 'pending' THEN NULL
	WHEN 'rejected' THEN user.id
	END,

	coauthor.created_at,
	initiative.user_id,

	coauthor.status,
	COALESCE(coauthor.status_updated_at, coauthor.created_at),

	CASE coauthor.status
	WHEN 'accepted' THEN coauthor.user_id
	WHEN 'pending' THEN initiative.user_id
	WHEN 'rejected' THEN user.id
	END

FROM initiative_coauthors AS coauthor
JOIN initiatives AS initiative ON initiative.uuid = coauthor.initiative_uuid
LEFT JOIN users AS user
ON user.country = coauthor.country AND user.personal_id = coauthor.personal_id;

DROP TABLE initiative_coauthors;

ALTER TABLE initiative_coauthors_new RENAME TO initiative_coauthors;

CREATE INDEX index_initiative_coauthors_on_initiative_uuid
ON initiative_coauthors (initiative_uuid);

CREATE INDEX index_initiative_coauthors_on_country_and_personal_id
ON initiative_coauthors (country, personal_id);

CREATE INDEX index_initiative_coauthors_on_user_id
ON initiative_coauthors (user_id)
WHERE user_id IS NOT NULL;

CREATE UNIQUE INDEX index_initiative_coauthors_on_accepted_or_pending
ON initiative_coauthors (initiative_uuid, country, personal_id, status)
WHERE status IN ('accepted', 'pending');

COMMIT;
