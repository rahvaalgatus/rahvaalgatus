UPDATE initiative_signatures
SET oversigned = oversigned + 1
WHERE (initiative_uuid, country, personal_id) IN (
	SELECT
		sig.initiative_uuid,
		sig.country,
		sig.personal_id

	FROM initiative_signatures AS sig
	INNER JOIN initiative_citizenos_signatures cos
	ON cos.initiative_uuid = sig.initiative_uuid
	AND cos.country = sig.country
	AND cos.personal_id = sig.personal_id
);

DELETE FROM initiative_citizenos_signatures
WHERE (initiative_uuid, country, personal_id) IN (
	SELECT initiative_uuid, country, personal_id
	FROM initiative_signatures
);
