.table.rows |
(.[0].c | map(.v)) as $header |
($header | index("Identifier")) as $id_column |
($header | index($lang)) as $lang_column |
.[1:] |
map(.c | {key: .[$id_column].v, value: .[$lang_column].v?}) |
map(select(.key | test("\\A\\s*\\Z") | not)) |
map(select(.value)) |
from_entries
