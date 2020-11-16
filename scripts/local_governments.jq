def present: if . == "" then null else . end;
def lines: sub("\\s+$"; "") | split("\n");

.feed.entry |

map({
	key: ."gsx$id"."$t",
		value: {
		ehak: ."gsx$ehak"."$t",
		name: ."gsx$name"."$t",
		county: ."gsx$county"."$t",
		population: ."gsx$population"."$t" | tonumber,
		initiativesEmails: ."gsx$initiativesemails"."$t" | lines,

		signatureDownloadPersonalIds: (
			."gsx$signaturedownloadpersonalids"."$t" | lines
		),

		kompassUrl: ."gsx$kompassurl"."$t" | present,
		rahandusministeeriumUrl: ."gsx$rahandusministeerium"."$t" | present
	}
}) |

from_entries
