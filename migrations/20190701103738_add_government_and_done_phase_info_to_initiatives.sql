ALTER TABLE initiatives
ADD COLUMN government_change_urls TEXT NOT NULL DEFAULT "[]";

ALTER TABLE initiatives
ADD COLUMN public_change_urls TEXT NOT NULL DEFAULT "[]";
