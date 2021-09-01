def lines: sub("\\s+$"; "") | split("\n");

.table |
(.cols | map(.label)) as $header |
($header | index("Id")) as $id_column |
($header | index("EHAK")) as $ehak_column |
($header | index("Name")) as $name_column |
($header | index("Population")) as $population_column |
($header | index("County")) as $county_column |
($header | index("Initiatives Emails")) as $emails_column |
($header | index("Signature Download Personal Ids")) as $personal_ids_column |
($header | index("Kompass URL")) as $kompass_column |
($header | index("Rahandusministeerium")) as $rahandusmin_column |
.rows |

map(.c | {
	key: .[$id_column].v,
	value: {
		ehak: .[$ehak_column].v,
		name: .[$name_column].v,
		county: .[$county_column].v,
		population: .[$population_column].v,
		initiativesEmails: (.[$emails_column].v // "") | lines,
		signatureDownloadPersonalIds: (.[$personal_ids_column].v // "") | lines,
		kompassUrl: .[$kompass_column].v,
		rahandusministeeriumUrl: .[$rahandusmin_column].v
	}
}) |

from_entries
