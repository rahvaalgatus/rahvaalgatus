ALTER TABLE initiative_subscriptions
ADD COLUMN official_interest INTEGER NOT NULL DEFAULT 1;

ALTER TABLE initiative_subscriptions
ADD COLUMN author_interest INTEGER NOT NULL DEFAULT 1;
