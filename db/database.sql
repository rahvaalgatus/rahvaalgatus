CREATE TABLE initiatives (
	uuid STRING PRIMARY KEY NOT NULL,
	mailchimp_interest_id STRING NOT NULL UNIQUE,

	CONSTRAINT initiatives_uuid_length
	CHECK (length(uuid) == 36),

	CONSTRAINT initiatives_mailchimp_interest_id
	CHECK (length(mailchimp_interest_id) > 0)
);
