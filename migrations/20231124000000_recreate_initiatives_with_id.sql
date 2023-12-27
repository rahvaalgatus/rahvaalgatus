.bail ON

BEGIN;

CREATE TABLE initiatives_new (
	id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
	uuid TEXT NOT NULL,
	destination TEXT,
	phase TEXT NOT NULL DEFAULT 'edit',
	external INTEGER NOT NULL DEFAULT 0,
	title TEXT NOT NULL,
	slug TEXT,
	language TEXT NOT NULL DEFAULT 'et',
	user_id INTEGER,

	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	published_at TEXT,
	discussion_ends_at TEXT,
	discussion_end_email_sent_at TEXT,
	signing_started_at TEXT,
	signing_ends_at TEXT,
	signing_end_email_sent_at TEXT,
	signing_expired_at TEXT,
	signing_expiration_email_sent_at TEXT,
	signatures_anonymized_at TEXT,
	sent_to_parliament_at TEXT,
	received_by_parliament_at TEXT,
	accepted_by_parliament_at TEXT,
	finished_in_parliament_at TEXT,
	sent_to_government_at TEXT,
	received_by_government_at TEXT,
	accepted_by_government_at TEXT,
	finished_in_government_at TEXT,
	archived_at TEXT,

	text TEXT,
	text_type TEXT,
	text_sha256 BLOB,
	undersignable INTEGER NOT NULL DEFAULT 0,
	has_paper_signatures INTEGER NOT NULL DEFAULT 0,

	signature_threshold INTEGER,
	signature_threshold_at TEXT,
	signature_milestones TEXT NOT NULL DEFAULT '{}',

	tags TEXT NOT NULL DEFAULT '[]',
	author_name TEXT NOT NULL DEFAULT '',
	author_url TEXT NOT NULL DEFAULT '',
	author_contacts TEXT NOT NULL DEFAULT '',
	notes TEXT NOT NULL DEFAULT '',
	url TEXT NOT NULL DEFAULT '',
	community_url TEXT NOT NULL DEFAULT '',
	organizations TEXT NOT NULL DEFAULT '[]',
	meetings TEXT NOT NULL DEFAULT '[]',
	media_urls TEXT NOT NULL DEFAULT '[]',
	government_change_urls TEXT NOT NULL DEFAULT '[]',
	public_change_urls TEXT NOT NULL DEFAULT '[]',

	parliament_decision TEXT,
	parliament_committee TEXT,
	parliament_uuid TEXT,
	parliament_synced_at TEXT,
	parliament_token BLOB,

	government_agency TEXT,
	government_contact TEXT,
	government_contact_details TEXT,
	government_decision TEXT,

	external_text_file_id INTEGER,

	FOREIGN KEY (user_id) REFERENCES users (id),
	FOREIGN KEY (external_text_file_id) REFERENCES initiative_files (id),

	CONSTRAINT uuid_length CHECK (length(uuid) == 36),
	CONSTRAINT destination_length CHECK (length(destination) > 0),
	CONSTRAINT phase_length CHECK (length(phase) > 0),
	CONSTRAINT title_length CHECK (length(title) > 0),
	CONSTRAINT slug_length CHECK (length(slug) > 0),
	CONSTRAINT language_format CHECK (language GLOB '[a-z][a-z]'),
	CONSTRAINT user_id_or_external CHECK ((user_id IS NULL) = external),

	CONSTRAINT created_at_format CHECK (created_at GLOB '*-*-*T*:*:*Z'),
	CONSTRAINT published_at_format CHECK (published_at GLOB '*-*-*T*:*:*Z'),

	CONSTRAINT discussion_ends_at_format
	CHECK (discussion_ends_at GLOB '*-*-*T*:*:*Z'),

	CONSTRAINT discussion_end_email_sent_at_format
	CHECK (discussion_end_email_sent_at GLOB '*-*-*T*:*:*Z'),

	CONSTRAINT signing_started_at_format
	CHECK (signing_started_at GLOB '*-*-*T*:*:*Z'),

	CONSTRAINT signing_ends_at_format CHECK (signing_ends_at GLOB '*-*-*T*:*:*Z'),

	CONSTRAINT signing_end_email_sent_at_format
	CHECK (signing_end_email_sent_at GLOB '*-*-*T*:*:*Z'),

	CONSTRAINT signing_expired_at_format
	CHECK (signing_expired_at GLOB '*-*-*T*:*:*Z'),

	CONSTRAINT signing_expiration_email_sent_at_format
	CHECK (signing_expiration_email_sent_at GLOB '*-*-*T*:*:*Z'),

	CONSTRAINT signatures_anonymized_at_format
	CHECK (signatures_anonymized_at GLOB '*-*-*T*:*:*Z'),

	CONSTRAINT sent_to_parliament_at_format
	CHECK (sent_to_parliament_at GLOB '*-*-*T*:*:*Z'),

	CONSTRAINT received_by_parliament_at_format
	CHECK (received_by_parliament_at GLOB '*-*-*T*:*:*Z'),

	CONSTRAINT accepted_by_parliament_at_format
	CHECK (accepted_by_parliament_at GLOB '*-*-*T*:*:*Z'),

	CONSTRAINT finished_in_parliament_at_format
	CHECK (finished_in_parliament_at GLOB '*-*-*T*:*:*Z'),

	CONSTRAINT sent_to_government_at_format
	CHECK (sent_to_government_at GLOB '*-*-*T*:*:*Z'),

	CONSTRAINT received_by_government_at_format
	CHECK (received_by_government_at GLOB '*-*-*T*:*:*Z'),

	CONSTRAINT accepted_by_government_at_format
	CHECK (accepted_by_government_at GLOB '*-*-*T*:*:*Z'),

	CONSTRAINT finished_in_government_at_format
	CHECK (finished_in_government_at GLOB '*-*-*T*:*:*Z'),

	CONSTRAINT archived_at_format CHECK (archived_at GLOB '*-*-*T*:*:*Z'),

	CONSTRAINT signature_threshold_at_format
	CHECK (signature_threshold_at GLOB '*-*-*T*:*:*Z'),

	CONSTRAINT signature_threshold_with_at
	CHECK ((signature_threshold IS NULL) = (signature_threshold_at IS NULL)),

	CONSTRAINT signature_threshold_nonnegative CHECK (signature_threshold >= 0),

	CONSTRAINT text_not_null
	CHECK (external OR (text IS NULL) = (phase = 'edit')),

	CONSTRAINT text_type_not_null CHECK ((text IS NULL) = (text_type IS NULL)),
	CONSTRAINT text_type_length CHECK (length(text_type) > 0),
	CONSTRAINT text_sha256_length CHECK (length(text_sha256) = 32),

	CONSTRAINT text_sha256_not_null
	CHECK ((text IS NULL) = (text_sha256 IS NULL)),

	CONSTRAINT signature_milestones_json CHECK (json_valid(signature_milestones)),
	CONSTRAINT tags_json CHECK (json_valid(tags)),
	CONSTRAINT organizations_json CHECK (json_valid(organizations)),
	CONSTRAINT meetings_json CHECK (json_valid(meetings)),
	CONSTRAINT media_urls_json CHECK (json_valid(media_urls)),
	CONSTRAINT public_change_urls_json CHECK (json_valid(public_change_urls)),

	CONSTRAINT government_change_urls_json
	CHECK (json_valid(government_change_urls)),

	CONSTRAINT published_or_in_edit
	CHECK (published_at IS NOT NULL OR phase = 'edit'),

	CONSTRAINT published_when_external
	CHECK (published_at IS NOT NULL OR NOT external),

	CONSTRAINT discussion_ends_at_if_editing
	CHECK (
		published_at IS NULL OR
		phase != 'edit' OR
		discussion_ends_at IS NOT NULL
	),

	CONSTRAINT signing_started_at_if_signing
	CHECK (phase != 'sign' OR signing_started_at IS NOT NULL),

	CONSTRAINT signing_ends_at_if_signing
	CHECK (phase != 'sign' OR signing_ends_at IS NOT NULL),

	CONSTRAINT signatures_anonymized_only_when_expired_or_received CHECK (
		signatures_anonymized_at IS NULL OR

		signing_expired_at IS NOT NULL OR CASE destination
			WHEN 'parliament' THEN received_by_parliament_at IS NOT NULL
			ELSE received_by_government_at IS NOT NULL
		END
	),

	CONSTRAINT signing_expired_at_phase
	CHECK (signing_expired_at IS NULL OR phase == 'sign'),

	CONSTRAINT initiatives_destination
	CHECK (destination IS NOT NULL OR phase = 'edit'),

	CONSTRAINT phase_not_parliament_when_local
	CHECK (phase != 'parliament' OR destination == 'parliament'),

	CONSTRAINT parliament_uuid_length CHECK (length(parliament_uuid) == 36),

	CONSTRAINT parliament_synced_at_format
	CHECK (parliament_synced_at GLOB '*-*-*T*:*:*Z'),

	CONSTRAINT parliament_token_length CHECK (length(parliament_token) > 0)
);

INSERT INTO initiatives_new (
	id,
	uuid,
	notes,
	sent_to_parliament_at,
	finished_in_parliament_at,
	discussion_end_email_sent_at,
	signing_end_email_sent_at,
	author_url,
	community_url,
	organizations,
	meetings,
	url,
	media_urls,
	signature_milestones,
	phase,
	government_change_urls,
	public_change_urls,
	has_paper_signatures,
	received_by_parliament_at,
	accepted_by_parliament_at,
	archived_at,
	parliament_decision,
	parliament_committee,
	parliament_uuid,
	external,
	title,
	author_name,
	created_at,
	parliament_synced_at,
	government_agency,
	sent_to_government_at,
	finished_in_government_at,
	government_contact,
	government_contact_details,
	government_decision,
	text,
	text_type,
	text_sha256,
	undersignable,
	parliament_token,
	destination,
	user_id,
	published_at,
	discussion_ends_at,
	signing_started_at,
	signing_ends_at,
	tags,
	signing_expired_at,
	signing_expiration_email_sent_at,
	language,
	author_contacts,
	received_by_government_at,
	accepted_by_government_at,
	signatures_anonymized_at,
	signature_threshold,
	signature_threshold_at,
	external_text_file_id
)

SELECT
	rowid,
	uuid,
	notes,
	sent_to_parliament_at,
	finished_in_parliament_at,
	discussion_end_email_sent_at,
	signing_end_email_sent_at,
	author_url,
	community_url,
	organizations,
	meetings,
	url,
	media_urls,
	signature_milestones,
	phase,
	government_change_urls,
	public_change_urls,
	has_paper_signatures,
	received_by_parliament_at,
	accepted_by_parliament_at,
	archived_at,
	parliament_decision,
	parliament_committee,
	parliament_uuid,
	external,
	title,
	author_name,
	created_at,
	parliament_synced_at,
	government_agency,
	sent_to_government_at,
	finished_in_government_at,
	government_contact,
	government_contact_details,
	government_decision,
	text,
	text_type,
	text_sha256,
	undersignable,
	parliament_token,
	destination,
	user_id,
	published_at,
	discussion_ends_at,
	signing_started_at,
	signing_ends_at,
	tags,
	signing_expired_at,
	signing_expiration_email_sent_at,
	language,
	author_contacts,
	received_by_government_at,
	accepted_by_government_at,
	signatures_anonymized_at,
	signature_threshold,
	signature_threshold_at,
	external_text_file_id

FROM initiatives;

PRAGMA foreign_keys = OFF;

DROP TABLE initiatives;
ALTER TABLE initiatives_new RENAME TO initiatives;

PRAGMA foreign_keys = ON;

CREATE UNIQUE INDEX index_initiatives_on_uuid ON initiatives (uuid);
CREATE INDEX index_initiatives_on_destination ON initiatives (destination);
CREATE INDEX index_initiatives_on_phase ON initiatives (phase);
CREATE INDEX index_initiatives_on_user_id ON initiatives (user_id);

CREATE UNIQUE INDEX index_initiatives_on_parliament_uuid
ON initiatives (parliament_uuid);

CREATE INDEX index_initiatives_on_external_text_file_id
ON initiatives (external_text_file_id);

COMMIT;
