ALTER TABLE initiatives
ADD COLUMN discussion_end_email_sent_at TEXT NULL;

ALTER TABLE initiatives
ADD COLUMN signing_end_email_sent_at TEXT NULL;
