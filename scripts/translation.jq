.feed.entry |
map({key: ."gsx$identifier"."$t", value: .["gsx$" + $lang]."$t"}) |
map(select(.key | test("\\A\\s*\\Z") | not)) |
map(select(.value == "" | not)) |
from_entries
