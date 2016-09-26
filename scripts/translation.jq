.feed.entry |
map(select(."gsx$identifier"."$t" | test("\\A\\s*\\Z") | not)) |
map({key: ."gsx$identifier"."$t", value: .["gsx$" + $lang]."$t"}) |
map(select(.value == "" | not)) |
from_entries
