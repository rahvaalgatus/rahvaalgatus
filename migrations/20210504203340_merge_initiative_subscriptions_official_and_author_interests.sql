ALTER TABLE initiative_subscriptions
RENAME COLUMN official_interest TO event_interest;

UPDATE initiative_subscriptions
SET event_interest = 1
WHERE author_interest;
