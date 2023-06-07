(
	$govs |
	to_entries |
	map({key: .value.ehak, value: (.value + {id: .key})}) |
	from_entries
) as $govs |

.features[].properties |=
	$govs[.OKOOD] as $gov | {
		id: $gov.id,
		name: $gov.name,
		population: $gov.population,
		rahandusministeeriumUrl: $gov.rahandusministeeriumUrl,
		dtvSchools: $gov.dtvSchools,
		threshold: [$gov.population * 0.01 | round, 5] | max
	}
