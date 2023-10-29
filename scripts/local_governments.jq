def lines: sub("\\s+$"; "") | split("\n");

.table |
(.cols | map(.label)) as $header |
($header | index("Id")) as $id_column |
($header | index("EHAK")) as $ehak_column |
($header | index("Name")) as $name_column |
($header | index("Population")) as $population_column |
($header | index("Voters")) as $voters_column |
($header | index("County")) as $county_column |
($header | index("Initiatives Emails")) as $emails_column |
($header | index("Signature Download Personal Ids")) as $personal_ids_column |
($header | index("DTV Schools")) as $dtv_column |
($header | index("Dialogs")) as $dialogs_column |
($header | index("Rahandusministeerium")) as $rahandusmin_column |
.rows |

map(.c | {
	key: .[$id_column].v,
	value: {
		ehak: .[$ehak_column].v,
		name: .[$name_column].v,
		county: .[$county_column].v,
		population: .[$population_column].v,
		voterCount: .[$voters_column].v,
		signatureThreshold: [.[$voters_column].v * 0.01 | round, 5] | max,
		initiativesEmails: (.[$emails_column].v // "") | lines,
		signatureDownloadPersonalIds: (.[$personal_ids_column].v // "") | lines,

		dtvSchools: (.[$dtv_column].v // "")
			| lines
			| map(match("([^ ]+) (.*)") | {
				name: .captures[1].string,
				url: .captures[0].string
			}),

		dialogs: (.[$dialogs_column].v // "")
			| lines
			| map(match("([^ ]+) (.*)") | {
				name: .captures[1].string,
				url: .captures[0].string
			}),

		rahandusministeeriumUrl: .[$rahandusmin_column].v
	}
}) |

from_entries
