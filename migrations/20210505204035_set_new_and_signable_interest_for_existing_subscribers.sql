UPDATE initiative_subscriptions
SET new_interest = 1, signable_interest = 1
WHERE initiative_uuid IS NULL
AND event_interest;
