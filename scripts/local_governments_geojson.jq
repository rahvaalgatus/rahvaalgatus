(
	$govs |
	to_entries |
	map({key: .value.ehak, value: (.value + {id: .key})}) |
	from_entries
) as $govs |

.features[].properties |=
	$govs[.OKOOD] as $gov |
	$gov + {threshold: [$gov.population * 0.01 | round, 5] | max}
