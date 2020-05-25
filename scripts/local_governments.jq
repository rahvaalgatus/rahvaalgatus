.feed.entry |

map({
	key: ."gsx$id"."$t",
		value: {
		name: ."gsx$name"."$t",
		county: ."gsx$county"."$t",
		population: ."gsx$population"."$t" | tonumber
	}
}) |

from_entries
