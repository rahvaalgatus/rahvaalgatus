UPDATE initiative_events
SET content = '{}'
WHERE type = 'parliament-accepted' AND content IS NULL;
