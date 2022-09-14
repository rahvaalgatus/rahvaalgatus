var _ = require("root/lib/underscore")
var Atom = require("root/lib/atom")
var Neodoc = require("neodoc")
var fetch = require("root/lib/fetch")
var newsDb = require("root/db/news_db")
var KOGU_ATOM_FEED = "https://kogu.ee/feed/atom/"
var SOURCE = "kogu.ee"
var UA = require("root").config.userAgent
var sql = require("sqlate")
var co = require("co")

fetch = require("fetch-defaults")(fetch, {
	// The Atom feed endpoint of theirs takes a good 10s to respond these days.
	timeout: 30000,
	headers: {"User-Agent": UA}
})

fetch = require("fetch-throw")(fetch)
fetch = require("fetch-parse")(fetch, {xml: true})

var USAGE_TEXT = `
Usage: cli news-sync (-h | --help)
       cli news-sync [options]

Options:
    -h, --help   Display this help and exit.
`

module.exports = co.wrap(function*(argv) {
  var args = Neodoc.run(USAGE_TEXT, {argv: argv || ["news-sync"]})
  if (args["--help"]) return void process.stdout.write(USAGE_TEXT.trimLeft())

	var res = yield fetch(KOGU_ATOM_FEED, {
		headers: {"Accept": "application/atom+xml"}
	})

	var {feed} = Atom.parse(res.body)

	_.asArray(feed.entry).forEach(function(entry) {
		var attrs = parse(entry)

		var news = newsDb.read(sql`
			SELECT * FROM news
			WHERE source = ${SOURCE}
			AND external_id = ${attrs.external_id}
		`)

		if (news) newsDb.update(news, attrs)
		else newsDb.create({__proto__: attrs, source: SOURCE})
	})
})

function parse(entry) {
	var alt = _.asArray(entry.link).find((link) => link.rel == "alternate")

	return {
		external_id: entry.id.$,
		title: entry.title.$,
		author_name: entry.author.name.$,
		published_at: new Date(entry.published.$),
		url: alt.href,
		categories: _.map(_.asArray(entry.category), "term")
	}
}
