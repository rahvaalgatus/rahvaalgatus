BEGIN;

UPDATE initiatives SET parliament_committee = CASE parliament_committee
	WHEN 'Euroopa Liidu asjade komisjon' THEN 'eu-affairs'
	WHEN 'Keskkonnakomisjon' THEN 'environment'
	WHEN 'Kultuurikomisjon' THEN 'cultural-affairs'
	WHEN 'Maaelukomisjon' THEN 'rural-affairs'
	WHEN 'Majanduskomisjon' THEN 'economic-affairs'
	WHEN 'Põhiseaduskomisjon' THEN 'constitutional'
	WHEN 'Rahanduskomisjon' THEN 'finance'
	WHEN 'Riigikaitsekomisjon' THEN 'national-defence'
	WHEN 'Sotsiaalkomisjon' THEN 'social-affairs'
	WHEN 'Väliskomisjon' THEN 'foreign-affairs'
	WHEN 'Õiguskomisjon' THEN 'legal-affairs'
	-- NOTE: No special committee has been in the parliament API as of
	-- Aug 7, 2024.
	ELSE parliament_committee
	END

WHERE parliament_committee IS NOT NULL;

UPDATE initiative_events SET content = json_replace(content, '$.committee',
	CASE json_extract(content, '$.committee')
	WHEN 'Euroopa Liidu asjade komisjon' THEN 'eu-affairs'
	WHEN 'Keskkonnakomisjon' THEN 'environment'
	WHEN 'Kultuurikomisjon' THEN 'cultural-affairs'
	WHEN 'Maaelukomisjon' THEN 'rural-affairs'
	WHEN 'Majanduskomisjon' THEN 'economic-affairs'
	WHEN 'Põhiseaduskomisjon' THEN 'constitutional'
	WHEN 'Rahanduskomisjon' THEN 'finance'
	WHEN 'Riigikaitsekomisjon' THEN 'national-defence'
	WHEN 'Sotsiaalkomisjon' THEN 'social-affairs'
	WHEN 'Väliskomisjon' THEN 'foreign-affairs'
	WHEN 'Õiguskomisjon' THEN 'legal-affairs'
	ELSE json_extract(content, '$.committee')
	END
)
WHERE json_valid(content) AND json_extract(content, '$.committee') IS NOT NULL;

COMMIT;
