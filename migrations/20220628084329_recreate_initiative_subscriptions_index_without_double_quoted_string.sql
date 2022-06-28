DROP INDEX index_initiative_subscriptions_initiative_uuid_and_email;

CREATE UNIQUE INDEX index_initiative_subscriptions_initiative_uuid_and_email
ON initiative_subscriptions (COALESCE(initiative_uuid, ''), email);
