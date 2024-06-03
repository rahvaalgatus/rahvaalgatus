UPDATE initiatives
SET published_at = created_at
WHERE published_at IN ('1970-01-01T00:00:00Z', '1970-01-01T00:00:00.000Z');
