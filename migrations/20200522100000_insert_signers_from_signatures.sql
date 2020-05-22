INSERT INTO signers (country, personal_id, first_signed_at, last_signed_at)

SELECT country, personal_id, created_at, created_at
FROM initiative_citizenos_signatures

UNION SELECT country, personal_id, created_at, created_at
FROM initiative_signatures
WHERE true -- The WHERE is necessary to disambiguate "ON CONFLICT".

ON CONFLICT (country, personal_id)
WHERE length(personal_id) > 7
DO UPDATE SET
	first_signed_at = min(first_signed_at, excluded.first_signed_at),
	last_signed_at = max(last_signed_at, excluded.last_signed_at);
