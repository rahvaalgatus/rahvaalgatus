def present: if . == "" then null else . end;

.feed.entry |

map({
	key: ."gsx$id"."$t",
		value: {
		ehak: ."gsx$ehak"."$t",
		name: ."gsx$name"."$t",
		county: ."gsx$county"."$t",
		population: ."gsx$population"."$t" | tonumber,
		initiativesEmail: ."gsx$initiativesemail"."$t" | present,
		kompassUrl: ."gsx$kompassurl"."$t" | present,
		rahandusministeeriumUrl: ."gsx$rahandusministeerium"."$t" | present
	}
}) |

from_entries
