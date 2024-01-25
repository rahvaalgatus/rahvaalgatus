(
	$govs[0] |
	to_entries |
	map({key: .value.ehak, value: (.value + {id: .key})}) |
	from_entries
) as $govs |

.features[].properties |= $govs[.OKOOD] as $gov | {
	id: $gov.id,
	name: $gov.name,
	population: $gov.population,
	voterCount: $gov.voterCount,
	signatureThreshold: $gov.signatureThreshold,
	rahandusministeeriumUrl: $gov.rahandusministeeriumUrl,
	dtvSchools: $gov.dtvSchools,
	dialogs: $gov.dialogs
}
