def present: if . == "" then null else . end;

.feed.entry |

map({
	key: ."gsx$id"."$t",
		value: {
		name: ."gsx$name"."$t",
		county: ."gsx$county"."$t",
		population: ."gsx$population"."$t" | tonumber,
		initiativesEmail: ."gsx$initiativesemail"."$t" | present
	}
}) |

from_entries
