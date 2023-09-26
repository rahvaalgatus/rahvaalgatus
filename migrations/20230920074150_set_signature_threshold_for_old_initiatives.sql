BEGIN;

UPDATE initiatives SET
	signature_threshold = CASE destination
		WHEN 'parliament' THEN 1000
		WHEN 'anija-vald' THEN 62
		WHEN 'harku-vald' THEN 148
		WHEN 'jõelähtme-vald' THEN 65
		WHEN 'keila-linn' THEN 100
		WHEN 'kiili-vald' THEN 54
		WHEN 'kose-vald' THEN 71
		WHEN 'kuusalu-vald' THEN 64
		WHEN 'loksa-linn' THEN 26
		WHEN 'lääne-harju-vald' THEN 126
		WHEN 'maardu-linn' THEN 155
		WHEN 'raasiku-vald' THEN 50
		WHEN 'rae-vald' THEN 190
		WHEN 'saku-vald' THEN 101
		WHEN 'saue-vald' THEN 221
		WHEN 'tallinn' THEN 4389
		WHEN 'viimsi-vald' THEN 201
		WHEN 'hiiumaa-vald' THEN 95
		WHEN 'alutaguse-vald' THEN 48
		WHEN 'jõhvi-vald' THEN 113
		WHEN 'kohtla-järve-linn' THEN 337
		WHEN 'lüganuse-vald' THEN 86
		WHEN 'narva-linn' THEN 565
		WHEN 'narva-jõesuu-linn' THEN 46
		WHEN 'sillamäe-linn' THEN 128
		WHEN 'toila-vald' THEN 48
		WHEN 'jõgeva-vald' THEN 135
		WHEN 'mustvee-vald' THEN 55
		WHEN 'põltsamaa-vald' THEN 98
		WHEN 'järva-vald' THEN 90
		WHEN 'paide-linn' THEN 105
		WHEN 'türi-vald' THEN 108
		WHEN 'haapsalu-linn' THEN 132
		WHEN 'lääne-nigula-vald' THEN 71
		WHEN 'vormsi-vald' THEN 5
		WHEN 'haljala-vald' THEN 44
		WHEN 'kadrina-vald' THEN 49
		WHEN 'rakvere-linn' THEN 151
		WHEN 'rakvere-vald' THEN 56
		WHEN 'tapa-vald' THEN 109
		WHEN 'vinni-vald' THEN 69
		WHEN 'viru-nigula-vald' THEN 59
		WHEN 'väike-maarja-vald' THEN 59
		WHEN 'kanepi-vald' THEN 48
		WHEN 'põlva-vald' THEN 140
		WHEN 'räpina-vald' THEN 64
		WHEN 'häädemeeste-vald' THEN 49
		WHEN 'kihnu-vald' THEN 7
		WHEN 'lääneranna-vald' THEN 54
		WHEN 'põhja-pärnumaa-vald' THEN 83
		WHEN 'pärnu-linn' THEN 513
		WHEN 'saarde-vald' THEN 46
		WHEN 'tori-vald' THEN 117
		WHEN 'kehtna-vald' THEN 55
		WHEN 'kohila-vald' THEN 72
		WHEN 'märjamaa-vald' THEN 76
		WHEN 'rapla-vald' THEN 132
		WHEN 'muhu-vald' THEN 19
		WHEN 'ruhnu-vald' THEN 5
		WHEN 'saaremaa-vald' THEN 315
		WHEN 'elva-vald' THEN 146
		WHEN 'kambja-vald' THEN 110
		WHEN 'kastre-vald' THEN 52
		WHEN 'luunja-vald' THEN 47
		WHEN 'nõo-vald' THEN 43
		WHEN 'peipsiääre-vald' THEN 56
		WHEN 'tartu-linn' THEN 953
		WHEN 'tartu-vald' THEN 108
		WHEN 'otepää-vald' THEN 66
		WHEN 'tõrva-vald' THEN 62
		WHEN 'valga-vald' THEN 156
		WHEN 'mulgi-vald' THEN 75
		WHEN 'põhja-sakala-vald' THEN 80
		WHEN 'viljandi-linn' THEN 173
		WHEN 'viljandi-vald' THEN 136
		WHEN 'antsla-vald' THEN 46
		WHEN 'rõuge-vald' THEN 55
		WHEN 'setomaa-vald' THEN 34
		WHEN 'võru-linn' THEN 118
		WHEN 'võru-vald' THEN 108
	END,

	signature_threshold_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')

WHERE signature_threshold IS NULL
AND (
	phase IN ('parliament', 'government', 'done') OR
	phase = 'sign' AND signing_expired_at IS NOT NULL OR
	phase = 'sign' AND archived_at IS NOT NULL
);

COMMIT;
