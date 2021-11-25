UPDATE initiative_events
SET notified_at = created_at
WHERE created_at >= '2019-05-24T00:00:00Z';
