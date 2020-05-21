ALTER TABLE initiative_signables
ADD COLUMN created_from TEXT;

ALTER TABLE initiative_signatures
ADD COLUMN created_from TEXT;
