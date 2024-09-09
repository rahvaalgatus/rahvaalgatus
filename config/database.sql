CREATE TABLE initiative_messages (
	id INTEGER PRIMARY KEY NOT NULL,
	initiative_uuid TEXT NOT NULL,
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	title TEXT NOT NULL,
	"text" TEXT NOT NULL,
	sent_at TEXT,
	sent_to TEXT NOT NULL DEFAULT '[]', origin TEXT NOT NULL DEFAULT 'message',

	FOREIGN KEY (initiative_uuid) REFERENCES initiatives (uuid) ON DELETE CASCADE,

	CONSTRAINT initiative_messages_title_length
	CHECK (length(title) > 0),

	CONSTRAINT initiative_messages_text_length
	CHECK (length("text") > 0)
);
CREATE TABLE IF NOT EXISTS "initiative_events" (
	id INTEGER PRIMARY KEY NOT NULL,
	initiative_uuid TEXT NOT NULL,
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	occurred_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	created_by TEXT,
	title TEXT,
	content TEXT, origin TEXT NOT NULL DEFAULT 'admin', external_id TEXT, type TEXT NOT NULL DEFAULT 'text', user_id INTEGER, notified_at TEXT,

	FOREIGN KEY (initiative_uuid) REFERENCES initiatives (uuid),
	FOREIGN KEY (user_id) REFERENCES users (id),

	CONSTRAINT created_at_format CHECK (created_at GLOB '*-*-*T*:*:*Z'),
	CONSTRAINT updated_at_format CHECK (updated_at GLOB '*-*-*T*:*:*Z'),
	CONSTRAINT occurred_at_format CHECK (occurred_at GLOB '*-*-*T*:*:*Z'),
	CONSTRAINT notified_at_format CHECK (notified_at GLOB '*-*-*T*:*:*Z'),
	CONSTRAINT title_length CHECK (length(title) > 0),
	CONSTRAINT content_length CHECK (length(content) > 0),
	CONSTRAINT origin_length CHECK (length(origin) > 0),
	CONSTRAINT external_id_length CHECK (length(external_id) > 0),
	CONSTRAINT type_length CHECK (length(type) > 0)
);
CREATE INDEX index_initiative_events_on_initiative_uuid
ON initiative_events (initiative_uuid);
CREATE TABLE comments (
	id INTEGER PRIMARY KEY NOT NULL,
	uuid TEXT,
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	initiative_uuid TEXT NOT NULL,
	user_uuid TEXT NOT NULL,
	parent_id INTEGER,
	title TEXT NOT NULL DEFAULT '',
	"text" TEXT NOT NULL DEFAULT '', user_id INTEGER NOT NULL, anonymized_at TEXT, as_admin INTEGER NOT NULL DEFAULT 0,

	FOREIGN KEY (user_id) REFERENCES users (id),
	FOREIGN KEY (parent_id) REFERENCES comments (id),
	FOREIGN KEY (initiative_uuid) REFERENCES initiatives (uuid),

	CONSTRAINT created_at_format CHECK (created_at GLOB '*-*-*T*:*:*Z'),
	CONSTRAINT updated_at_format CHECK (updated_at GLOB '*-*-*T*:*:*Z'),

	CONSTRAINT comments_title_present
	CHECK (
		(title != '' AND parent_id IS NULL) OR
		(title = '' AND parent_id IS NOT NULL)
	),

	CONSTRAINT comments_title_length
	CHECK (length(title) <= 140),

	CONSTRAINT comments_text_length
	CHECK (text != '' AND length(text) <= 3000)
);
CREATE UNIQUE INDEX index_comments_on_uuid
ON comments (uuid);
CREATE INDEX index_comments_on_parent_id
ON comments (parent_id);
CREATE INDEX index_comments_on_initiative_uuid
ON comments (initiative_uuid);
CREATE TABLE IF NOT EXISTS "initiative_files" (
	id INTEGER PRIMARY KEY NOT NULL,
	initiative_uuid TEXT NOT NULL,
	event_id INTEGER,
	external_id TEXT,
	external_url TEXT,
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	name TEXT NOT NULL,
	title TEXT,
	url TEXT,
	content BLOB NOT NULL,
	content_type TEXT NOT NULL, created_by_id INTEGER,

	FOREIGN KEY (initiative_uuid) REFERENCES initiatives (uuid),
	FOREIGN KEY (event_id) REFERENCES initiative_events (id) ON DELETE CASCADE,
	FOREIGN KEY (created_by_id) REFERENCES users (id),

	CONSTRAINT initiative_files_external_id_length
	CHECK (length(external_id) > 0),

	CONSTRAINT initiative_files_external_url_length
	CHECK (length(external_url) > 0),

	CONSTRAINT initiative_files_name_length
	CHECK (length(name) > 0),

	CONSTRAINT initiative_files_title_length
	CHECK (length(title) > 0),

	CONSTRAINT initiative_files_url_length
	CHECK (length(url) > 0),

	CONSTRAINT initiative_files_content_length
	CHECK (length(content) > 0),

	CONSTRAINT initiative_files_content_type_length
	CHECK (length(content_type) > 0)
);
CREATE INDEX index_initiative_files_on_initiative_uuid
ON initiative_files (initiative_uuid);
CREATE INDEX index_initiative_files_on_event_id
ON initiative_files (event_id);
CREATE UNIQUE INDEX index_initiative_files_on_event_id_and_external_id
ON initiative_files (event_id, external_id);
CREATE TABLE initiative_images (
	initiative_uuid TEXT PRIMARY KEY NOT NULL,
	data BLOB NOT NULL,
	type TEXT NOT NULL,
	preview BLOB NOT NULL, author_name TEXT, author_url TEXT, uploaded_by_id INTEGER,

	FOREIGN KEY (initiative_uuid) REFERENCES initiatives (uuid) ON DELETE CASCADE,
	FOREIGN KEY (uploaded_by_id) REFERENCES users (id)
);
CREATE TABLE initiative_signables (
	initiative_uuid TEXT NOT NULL,
	country TEXT NOT NULL,
	personal_id TEXT NOT NULL,
  token BLOB UNIQUE NOT NULL DEFAULT (randomblob(12)),
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	xades TEXT NOT NULL,
	signed INTEGER NOT NULL DEFAULT 0,
	timestamped INTEGER NOT NULL DEFAULT 0,
	error TEXT, method TEXT NOT NULL, created_from TEXT, eid_session TEXT,

	FOREIGN KEY (initiative_uuid) REFERENCES initiatives (uuid) ON DELETE CASCADE,

	CONSTRAINT initiative_signables_country_length CHECK (length(country) = 2),

	CONSTRAINT initiative_signables_personal_id_length
	CHECK (length(personal_id) > 0),

	CONSTRAINT initiative_signables_token_length CHECK (length(token) > 0),
	CONSTRAINT initiative_signables_xades_length CHECK (length(xades) > 0),

	CONSTRAINT eid_session_json
	CHECK (eid_session IS NULL OR json_valid(eid_session))
);
CREATE INDEX index_signables_on_initiative_uuid
ON initiative_signables (initiative_uuid);
CREATE TABLE users (
	id INTEGER PRIMARY KEY NOT NULL,
	uuid BLOB UNIQUE NOT NULL,
	country TEXT,
	personal_id TEXT,
	name TEXT NOT NULL,
	official_name TEXT,
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	email TEXT UNIQUE COLLATE NOCASE,
	email_confirmed_at TEXT,
	unconfirmed_email TEXT COLLATE NOCASE,
	email_confirmation_token BLOB UNIQUE,
	email_confirmation_sent_at TEXT,
	language TEXT NOT NULL DEFAULT 'et', merged_with_id INTEGER,

	FOREIGN KEY (merged_with_id) REFERENCES users (id),

	CONSTRAINT users_uuid_length CHECK (length(uuid) == 16),
	CONSTRAINT users_country_length CHECK (length(country) == 2),
	CONSTRAINT users_personal_id_length CHECK (length(personal_id) > 0),
	CONSTRAINT users_name_length CHECK (length(name) > 0),
	CONSTRAINT users_official_name_length CHECK (length(official_name) > 0),
	CONSTRAINT users_email_length CHECK (length(email) >= 3),
	CONSTRAINT users_language_length CHECK (length(language) == 2),
	CONSTRAINT users_country_uppercase CHECK (country == upper(country)),
	CONSTRAINT users_language_lowercase CHECK (language == lower(language)),

	CONSTRAINT users_unconfirmed_email_length
	CHECK (length(unconfirmed_email) >= 3),

	CONSTRAINT users_email_format CHECK (email GLOB '*?@?*'),

	CONSTRAINT users_unconfirmed_email_format
	CHECK (unconfirmed_email GLOB '*?@?*'),

	CONSTRAINT users_email_confirmation_token
	CHECK (length(email_confirmation_token) > 0),

	CONSTRAINT users_email_confirmed
	CHECK ((email IS NULL) = (email_confirmed_at IS NULL)),

	CONSTRAINT users_unconfirmed_email_token
	CHECK ((unconfirmed_email IS NULL) = (email_confirmation_token IS NULL)),

	CONSTRAINT users_email_and_unconfirmed_email_different
	CHECK (email <> unconfirmed_email),

	CONSTRAINT users_country_and_personal_id
	CHECK ((country IS NULL) = (personal_id IS NULL)),

	CONSTRAINT users_personal_id_and_official_name
	CHECK ((personal_id IS NULL) = (official_name IS NULL)),

	CONSTRAINT users_personal_id_or_email
	CHECK (
		personal_id IS NOT NULL OR
		email IS NOT NULL OR
		unconfirmed_email IS NOT NULL
	)
);
CREATE UNIQUE INDEX index_users_on_country_and_personal_id
ON users (country, personal_id);
CREATE TABLE authentications (
	id INTEGER PRIMARY KEY NOT NULL,
	country TEXT NOT NULL,
	personal_id TEXT NOT NULL,
	method TEXT NOT NULL,
	certificate BLOB,
  token BLOB UNIQUE NOT NULL,
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	created_ip TEXT,
	created_user_agent TEXT,
	authenticated INTEGER NOT NULL DEFAULT 0,
	error TEXT, eid_session TEXT,

	CONSTRAINT authentications_country_length CHECK (length(country) = 2),
	CONSTRAINT authentications_personal_id_length
	CHECK (length(personal_id) > 0),

	CONSTRAINT authentications_certificate_length CHECK (length(certificate) > 0),
	CONSTRAINT authentications_token_sha256_length CHECK (length(token) > 0),

	CONSTRAINT authentications_country_uppercase
	CHECK (country == upper(country)),

	CONSTRAINT eid_session_json
	CHECK (eid_session IS NULL OR json_valid(eid_session))
);
CREATE TABLE sessions (
	id INTEGER PRIMARY KEY NOT NULL,
	user_id INTEGER NOT NULL,
  token_sha256 BLOB UNIQUE NOT NULL,
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	authentication_id INTEGER NOT NULL UNIQUE,
	method TEXT NOT NULL,
	created_ip TEXT,
	created_user_agent TEXT,
	deleted_at TEXT,

	FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
	FOREIGN KEY (authentication_id) REFERENCES authentications (id),

	CONSTRAINT sessions_token_sha256_length CHECK (length(token_sha256) == 32)
);
CREATE INDEX index_initiative_events_on_user_id ON initiative_events (user_id);
CREATE INDEX index_users_on_merged_with_id ON users (merged_with_id)
WHERE merged_with_id IS NOT NULL;
CREATE TABLE demo_signatures (
  id INTEGER PRIMARY KEY NOT NULL,
	country TEXT NOT NULL,
	personal_id TEXT NOT NULL,
	method TEXT NOT NULL,
	signed INTEGER NOT NULL DEFAULT 0,
	timestamped INTEGER NOT NULL DEFAULT 0,
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  token BLOB NOT NULL DEFAULT (randomblob(16)),
	xades TEXT,
	error TEXT,

	CONSTRAINT initiative_signables_country_length CHECK (length(country) = 2),

	CONSTRAINT initiative_signables_personal_id_length
	CHECK (length(personal_id) > 0),

	CONSTRAINT initiative_signables_token_length CHECK (length(token) > 0),
	CONSTRAINT initiative_signables_xades_length CHECK (length(xades) > 0)
);
CREATE TABLE initiative_texts (
	id INTEGER PRIMARY KEY NOT NULL,
	initiative_uuid TEXT NOT NULL,
	basis_id INTEGER,
	user_id INTEGER NOT NULL,
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	content BLOB NOT NULL,
	content_type TEXT NOT NULL, title TEXT NOT NULL, language TEXT NOT NULL DEFAULT 'et',

	FOREIGN KEY (initiative_uuid) REFERENCES initiatives (uuid),
	FOREIGN KEY (user_id) REFERENCES users (id),

	FOREIGN KEY (initiative_uuid, basis_id)
	REFERENCES initiative_texts (initiative_uuid, id),

	CONSTRAINT content_type_length CHECK (length(content_type) > 0),
	CONSTRAINT title_length CHECK (length(title) > 0)
);
CREATE INDEX index_initiative_texts_on_initiative_uuid_and_created_at
ON initiative_texts (initiative_uuid, created_at);
CREATE UNIQUE INDEX index_initiative_texts_on_initiative_uuid_and_id
ON initiative_texts (initiative_uuid, id);
CREATE INDEX index_initiative_texts_on_basis_id
ON initiative_texts (basis_id);
CREATE TABLE initiative_text_signatures (
  id INTEGER PRIMARY KEY NOT NULL,
	text_id INTEGER NOT NULL,
	country TEXT NOT NULL,
	personal_id TEXT NOT NULL,
	method TEXT NOT NULL,
	signed INTEGER NOT NULL DEFAULT 0,
	timestamped INTEGER NOT NULL DEFAULT 0,
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	signable BLOB NOT NULL,
	signable_type TEXT NOT NULL,
	xades TEXT,
	error TEXT,

	FOREIGN KEY (text_id) REFERENCES initiative_texts (id),

	CONSTRAINT country_length CHECK (length(country) = 2),
	CONSTRAINT personal_id_length CHECK (length(personal_id) > 0),
	CONSTRAINT signable_length CHECK (length(signable) > 0),
	CONSTRAINT xades_length CHECK (length(xades) > 0)
);
CREATE TABLE news (
  id INTEGER PRIMARY KEY NOT NULL,
	source TEXT NOT NULL,
	title TEXT NOT NULL,
	url TEXT NOT NULL,
	external_id TEXT NOT NULL,
	author_name TEXT,
	published_at TEXT NOT NULL, categories TEXT DEFAULT '[]',

	CONSTRAINT title_length CHECK (length(title) > 0),
	CONSTRAINT url_length CHECK (length(url) > 0),
	CONSTRAINT author_name_length CHECK (length(author_name) > 0)
);
CREATE UNIQUE INDEX index_news_on_source_and_external_id
ON news (source, external_id);
CREATE INDEX index_news_on_published_at
ON news (published_at);
CREATE UNIQUE INDEX index_users_on_id_and_country_and_personal_id
ON users (id, country, personal_id);
CREATE TABLE IF NOT EXISTS "initiative_coauthors" (
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
CREATE TABLE IF NOT EXISTS "initiative_signatures" (
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
CREATE INDEX index_signatures_on_initiatives_and_created_at
ON initiative_signatures (initiative_uuid, created_at);
CREATE UNIQUE INDEX index_signatures_on_initiative_country_and_personal_id
ON initiative_signatures (initiative_uuid, country, personal_id)
WHERE NOT anonymized;
CREATE INDEX index_signatures_on_country_and_personal_id
ON initiative_signatures (country, personal_id)
WHERE NOT anonymized;
CREATE TABLE IF NOT EXISTS "initiative_citizenos_signatures" (
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
CREATE INDEX index_citizenos_signatures_on_initiative_uuid_and_created_at
ON initiative_citizenos_signatures (initiative_uuid, created_at);
CREATE UNIQUE INDEX index_citizenos_signatures_on_initiative_country_and_personal_id
ON initiative_citizenos_signatures (initiative_uuid, country, personal_id)
WHERE NOT anonymized;
CREATE INDEX index_citizenos_signatures_on_country_and_personal_id
ON initiative_citizenos_signatures (country, personal_id)
WHERE NOT anonymized;
CREATE INDEX index_initiative_signatures_on_created_at
ON initiative_signatures (created_at);
CREATE INDEX index_initiative_citizenos_signatures_on_created_at
ON initiative_citizenos_signatures (created_at);
CREATE TABLE IF NOT EXISTS "initiative_subscriptions" (
	initiative_uuid TEXT,
	initiative_destination TEXT,
	email TEXT COLLATE NOCASE NOT NULL,
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	confirmed_at TEXT,
	confirmation_sent_at TEXT,
  update_token TEXT UNIQUE NOT NULL DEFAULT (lower(hex(randomblob(8)))),
  created_ip TEXT NULL,
  origin TEXT NULL,
  event_interest INTEGER NOT NULL DEFAULT 0,
	comment_interest INTEGER NOT NULL DEFAULT 0,
	new_interest INTEGER NOT NULL DEFAULT 0,
	signable_interest INTEGER NOT NULL DEFAULT 0,

	FOREIGN KEY (initiative_uuid) REFERENCES initiatives (uuid) ON DELETE CASCADE,

	CONSTRAINT initiative_uuid_nand_destination
	CHECK (initiative_uuid IS NULL OR initiative_destination IS NULL),

	CONSTRAINT initiative_destination_length
	CHECK (length(initiative_destination) > 0),

	CONSTRAINT email_length CHECK (length(email) > 0),
	CONSTRAINT update_token_length CHECK (length(update_token) > 0),

	CONSTRAINT new_interest_for_all_initiatives
	CHECK (initiative_uuid IS NULL OR NOT new_interest)
);
CREATE UNIQUE INDEX index_initiative_subscriptions_initiative_uuid_destination_and_email
ON initiative_subscriptions (
	COALESCE(initiative_uuid, ''),
	COALESCE(initiative_destination, ''),
	email
);
CREATE INDEX index_initiative_subscriptions_on_email
ON initiative_subscriptions (email);
CREATE INDEX index_initiative_subscriptions_on_initiative_destination
ON initiative_subscriptions (initiative_destination);
CREATE TABLE external_responses (
	id INTEGER PRIMARY KEY NOT NULL,
	origin TEXT NOT NULL,
	path TEXT NOT NULL,
	requested_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	requested_count INTEGER NOT NULL DEFAULT 1,
	updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	updated_count INTEGER NOT NULL DEFAULT 1,
	status_code INTEGER NOT NULL,
	status_message TEXT NOT NULL,
	headers TEXT NOT NULL DEFAULT '{}',
	etag TEXT,
	body_type TEXT,
	body BLOB,
	duration INTEGER,

	CONSTRAINT origin_length CHECK (length(origin) > 0),
	CONSTRAINT path_length CHECK (length(path) > 0),

	CONSTRAINT requested_at_format CHECK (requested_at GLOB '*-*-*T*:*:*Z'),
	CONSTRAINT updated_at_format CHECK (updated_at GLOB '*-*-*T*:*:*Z'),
	CONSTRAINT status_code_range CHECK (status_code >= 100 AND status_code < 600),
	CONSTRAINT headers_json CHECK (json_valid(headers)),
	CONSTRAINT etag_length CHECK (length(etag) > 0),
	CONSTRAINT body_type_length CHECK (length(body_type) > 0),
	CONSTRAINT duration_nonnegative CHECK (duration >= 0),
	CONSTRAINT requested_count_positive CHECK (requested_count > 0),
	CONSTRAINT updated_count_positive CHECK (updated_count > 0),

	CONSTRAINT updated_lte_requested_count
	CHECK (updated_count <= requested_count)
);
CREATE UNIQUE INDEX index_external_responses_on_origin_path
ON external_responses (origin, path);
CREATE TABLE IF NOT EXISTS "initiatives" (
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
	parliament_committees TEXT NOT NULL DEFAULT '[]',
	parliament_uuid TEXT,
	parliament_synced_at TEXT,
	parliament_token BLOB,

	government_agency TEXT,
	government_contact TEXT,
	government_contact_details TEXT,
	government_decision TEXT,

	external_text_file_id INTEGER, last_comment_created_at TEXT, last_event_created_at TEXT, last_signature_created_at TEXT,

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

	CONSTRAINT last_comment_created_at_format
	CHECK (last_comment_created_at GLOB '*-*-*T*:*:*Z'),

	CONSTRAINT last_event_created_at_format
	CHECK (last_event_created_at GLOB '*-*-*T*:*:*Z'),

	CONSTRAINT last_signature_created_at_format
	CHECK (last_signature_created_at GLOB '*-*-*T*:*:*Z'),

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

	CONSTRAINT parliament_committees_json
	CHECK (json_valid(parliament_committees)),

	CONSTRAINT parliament_uuid_length CHECK (length(parliament_uuid) == 36),

	CONSTRAINT parliament_synced_at_format
	CHECK (parliament_synced_at GLOB '*-*-*T*:*:*Z'),

	CONSTRAINT parliament_token_length CHECK (length(parliament_token) > 0)
);
CREATE UNIQUE INDEX index_initiatives_on_uuid ON initiatives (uuid);
CREATE INDEX index_initiatives_on_destination ON initiatives (destination);
CREATE INDEX index_initiatives_on_phase ON initiatives (phase);
CREATE INDEX index_initiatives_on_user_id ON initiatives (user_id);
CREATE UNIQUE INDEX index_initiatives_on_parliament_uuid
ON initiatives (parliament_uuid);
CREATE INDEX index_initiatives_on_external_text_file_id
ON initiatives (external_text_file_id);
CREATE TABLE initiative_signature_trustees (
	id INTEGER PRIMARY KEY NOT NULL,
	initiative_destination TEXT NOT NULL,
	country TEXT NOT NULL,
	personal_id TEXT NOT NULL,
	name TEXT NOT NULL,
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	created_by_id INTEGER NOT NULL,
	deleted_at TEXT,
	deleted_by_id INTEGER,

	FOREIGN KEY (created_by_id) REFERENCES users (id),
	FOREIGN KEY (deleted_by_id) REFERENCES users (id),

	CONSTRAINT initiative_destination_length
	CHECK (length(initiative_destination) > 0),

	CONSTRAINT country_format CHECK (country GLOB '[A-Z][A-Z]'),

	CONSTRAINT personal_id_format CHECK (CASE country
		WHEN 'EE' THEN
			personal_id GLOB '[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]'
		ELSE length(personal_id) > 0
	END),

	CONSTRAINT name CHECK (length(name) > 0),
	CONSTRAINT created_at_format CHECK (created_at GLOB '*-*-*T*:*:*Z'),
	CONSTRAINT deleted_at_format CHECK (deleted_at GLOB '*-*-*T*:*:*Z'),

	CONSTRAINT deleted_at_with_id
	CHECK ((deleted_at IS NULL) = (deleted_by_id IS NULL))
);
CREATE INDEX index_initiative_signature_trustees_on_destination
ON initiative_signature_trustees (initiative_destination);
CREATE UNIQUE INDEX index_initiative_signature_trustees_on_destination_and_personal_id
ON initiative_signature_trustees (initiative_destination, country, personal_id)
WHERE deleted_at IS NULL;
CREATE INDEX index_initiative_signature_trustees_on_created_by_id
ON initiative_signature_trustees (created_by_id);
CREATE INDEX index_initiative_signature_trustees_on_deleted_by_id
ON initiative_signature_trustees (deleted_by_id);
CREATE TRIGGER set_initiative_last_comment_created_at_on_create
AFTER INSERT ON comments
FOR EACH ROW BEGIN
  UPDATE initiatives SET last_comment_created_at = COALESCE(
		max(last_comment_created_at, NEW.created_at),
		NEW.created_at
	)
  WHERE uuid = NEW.initiative_uuid;
END;
CREATE INDEX index_initiatives_on_last_comment_created_at
ON initiatives (last_comment_created_at DESC)
WHERE last_comment_created_at IS NOT NULL;
CREATE TRIGGER set_initiative_last_event_created_at_on_create
AFTER INSERT ON initiative_events
FOR EACH ROW BEGIN
  UPDATE initiatives SET last_event_created_at = COALESCE(
		max(last_event_created_at, NEW.created_at),
		NEW.created_at
	)
  WHERE uuid = NEW.initiative_uuid;
END;
CREATE INDEX index_initiatives_on_last_event_created_at
ON initiatives (last_event_created_at DESC)
WHERE last_event_created_at IS NOT NULL;
CREATE TRIGGER set_initiative_last_signature_created_at_on_create
AFTER INSERT ON initiative_signatures
FOR EACH ROW BEGIN
  UPDATE initiatives SET last_signature_created_at = COALESCE(
		max(last_signature_created_at, NEW.created_at),
		NEW.created_at
	)
  WHERE uuid = NEW.initiative_uuid;
END;
CREATE INDEX index_initiatives_on_last_signature_created_at
ON initiatives (last_signature_created_at DESC)
WHERE last_signature_created_at IS NOT NULL;

PRAGMA foreign_keys=OFF;
BEGIN TRANSACTION;
CREATE TABLE migrations (version TEXT PRIMARY KEY NOT NULL);
INSERT INTO migrations VALUES('20181201195222');
INSERT INTO migrations VALUES('20181201200519');
INSERT INTO migrations VALUES('20181209204318');
INSERT INTO migrations VALUES('20181211192927');
INSERT INTO migrations VALUES('20190108102703');
INSERT INTO migrations VALUES('20190304110736');
INSERT INTO migrations VALUES('20190310164217');
INSERT INTO migrations VALUES('20190311183208');
INSERT INTO migrations VALUES('20190410080730');
INSERT INTO migrations VALUES('20190410173242');
INSERT INTO migrations VALUES('20190427232247');
INSERT INTO migrations VALUES('20190428103608');
INSERT INTO migrations VALUES('20190428114010');
INSERT INTO migrations VALUES('20190428170006');
INSERT INTO migrations VALUES('20190519192050');
INSERT INTO migrations VALUES('20190523150859');
INSERT INTO migrations VALUES('20190527092632');
INSERT INTO migrations VALUES('20190531131546');
INSERT INTO migrations VALUES('20190531132234');
INSERT INTO migrations VALUES('20190531141956');
INSERT INTO migrations VALUES('20190607111527');
INSERT INTO migrations VALUES('20190613120456');
INSERT INTO migrations VALUES('20190614131543');
INSERT INTO migrations VALUES('20190621112243');
INSERT INTO migrations VALUES('20190628153405');
INSERT INTO migrations VALUES('20190630200833');
INSERT INTO migrations VALUES('20190701103738');
INSERT INTO migrations VALUES('20190703115616');
INSERT INTO migrations VALUES('20190708080000');
INSERT INTO migrations VALUES('20190710214809');
INSERT INTO migrations VALUES('20190710215940');
INSERT INTO migrations VALUES('20190711000000');
INSERT INTO migrations VALUES('20190711000010');
INSERT INTO migrations VALUES('20190711000020');
INSERT INTO migrations VALUES('20190711000030');
INSERT INTO migrations VALUES('20190711000040');
INSERT INTO migrations VALUES('20190711000050');
INSERT INTO migrations VALUES('20190711000060');
INSERT INTO migrations VALUES('20190711000070');
INSERT INTO migrations VALUES('20190723152855');
INSERT INTO migrations VALUES('20190724225535');
INSERT INTO migrations VALUES('20190726112230');
INSERT INTO migrations VALUES('20190819103432');
INSERT INTO migrations VALUES('20190825222200');
INSERT INTO migrations VALUES('20190902090222');
INSERT INTO migrations VALUES('20190902091043');
INSERT INTO migrations VALUES('20190902091235');
INSERT INTO migrations VALUES('20190912160618');
INSERT INTO migrations VALUES('20191021102603');
INSERT INTO migrations VALUES('20191118142601');
INSERT INTO migrations VALUES('20191118184000');
INSERT INTO migrations VALUES('20191118184010');
INSERT INTO migrations VALUES('20191118184020');
INSERT INTO migrations VALUES('20191118184030');
INSERT INTO migrations VALUES('20200106000042');
INSERT INTO migrations VALUES('20200106000100');
INSERT INTO migrations VALUES('20200106000105');
INSERT INTO migrations VALUES('20200106000110');
INSERT INTO migrations VALUES('20200106000120');
INSERT INTO migrations VALUES('20200106000130');
INSERT INTO migrations VALUES('20200124094227');
INSERT INTO migrations VALUES('20200124101632');
INSERT INTO migrations VALUES('20200124121145');
INSERT INTO migrations VALUES('20200124131836');
INSERT INTO migrations VALUES('20200125071216');
INSERT INTO migrations VALUES('20200125122607');
INSERT INTO migrations VALUES('20200302142858');
INSERT INTO migrations VALUES('20200304155422');
INSERT INTO migrations VALUES('20200304172142');
INSERT INTO migrations VALUES('20200327163241');
INSERT INTO migrations VALUES('20200418144000');
INSERT INTO migrations VALUES('20200418144010');
INSERT INTO migrations VALUES('20200418144020');
INSERT INTO migrations VALUES('20200418144030');
INSERT INTO migrations VALUES('20200418144113');
INSERT INTO migrations VALUES('20200509102953');
INSERT INTO migrations VALUES('20200515145257');
INSERT INTO migrations VALUES('20200521163812');
INSERT INTO migrations VALUES('20200522094931');
INSERT INTO migrations VALUES('20200522100000');
INSERT INTO migrations VALUES('20200522100010');
INSERT INTO migrations VALUES('20200522100020');
INSERT INTO migrations VALUES('20200601090000');
INSERT INTO migrations VALUES('20200601101617');
INSERT INTO migrations VALUES('20200618155253');
INSERT INTO migrations VALUES('20200618155300');
INSERT INTO migrations VALUES('20200618155310');
INSERT INTO migrations VALUES('20200618155320');
INSERT INTO migrations VALUES('20200709190642');
INSERT INTO migrations VALUES('20200727092343');
INSERT INTO migrations VALUES('20200811130443');
INSERT INTO migrations VALUES('20200813175316');
INSERT INTO migrations VALUES('20200815000000');
INSERT INTO migrations VALUES('20200815000010');
INSERT INTO migrations VALUES('20200822170508');
INSERT INTO migrations VALUES('20200923141919');
INSERT INTO migrations VALUES('20210504203340');
INSERT INTO migrations VALUES('20210504210115');
INSERT INTO migrations VALUES('20210505142844');
INSERT INTO migrations VALUES('20210505144421');
INSERT INTO migrations VALUES('20210505145407');
INSERT INTO migrations VALUES('20210505204035');
INSERT INTO migrations VALUES('20210902145013');
INSERT INTO migrations VALUES('20210921135127');
INSERT INTO migrations VALUES('20210922092306');
INSERT INTO migrations VALUES('20211115102500');
INSERT INTO migrations VALUES('20211115102510');
INSERT INTO migrations VALUES('20211125124900');
INSERT INTO migrations VALUES('20211125124910');
INSERT INTO migrations VALUES('20211125124920');
INSERT INTO migrations VALUES('20211125124930');
INSERT INTO migrations VALUES('20220628084329');
INSERT INTO migrations VALUES('20230228064416');
INSERT INTO migrations VALUES('20230331120000');
INSERT INTO migrations VALUES('20230503063630');
INSERT INTO migrations VALUES('20230920074135');
INSERT INTO migrations VALUES('20230920074150');
INSERT INTO migrations VALUES('20231020000000');
INSERT INTO migrations VALUES('20231102110120');
INSERT INTO migrations VALUES('20231102110130');
INSERT INTO migrations VALUES('20231102110140');
INSERT INTO migrations VALUES('20231120000000');
INSERT INTO migrations VALUES('20231122000000');
INSERT INTO migrations VALUES('20231124000000');
INSERT INTO migrations VALUES('20240603082158');
INSERT INTO migrations VALUES('20240620000000');
INSERT INTO migrations VALUES('20240807212157');
INSERT INTO migrations VALUES('20240827072953');
INSERT INTO migrations VALUES('20240908212900');
INSERT INTO migrations VALUES('20240908212957');
INSERT INTO migrations VALUES('20240908222218');
INSERT INTO migrations VALUES('20240909000159');
COMMIT;
