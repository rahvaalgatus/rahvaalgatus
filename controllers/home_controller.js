var _ = require("root/lib/underscore")
var DateFns = require("date-fns")
var Router = require("express").Router
var Config = require("root/config")
var next = require("co-next")
var searchTopics = require("root/lib/citizenos_db").searchTopics
var cosDb = require("root").cosDb
var sqlite = require("root").sqlite
var countSignaturesByIds = require("root/lib/citizenos_db").countSignaturesByIds
var sql = require("sqlate")
var initiativesDb = require("root/db/initiatives_db")
var concat = Array.prototype.concat.bind(Array.prototype)
var PARTNER_IDS = concat(Config.apiPartnerId, _.keys(Config.partners))

exports.router = Router({mergeParams: true})

exports.router.get("/", next(function*(_req, res) {
	var initiatives = yield initiativesDb.search(sql`
		SELECT * FROM initiatives WHERE archived_at IS NULL
	`)

	var cutoff = DateFns.addDays(DateFns.startOfDay(new Date), -14)

	var topics = _.indexBy(yield searchTopics(sql`
		topic.id IN ${sql.in(initiatives.map((i) => i.uuid))}
		AND (topic.status <> 'inProgress' OR topic."endsAt" > ${cutoff})
		AND topic.visibility = 'public'
	`), "id")

	initiatives = initiatives.filter((initiative) => (
		initiative.external ||
		topics[initiative.uuid]
	))

	initiatives.forEach(function(initiative) {
		var topic = topics[initiative.uuid]
		if (topic) initiative.title = topic.title
	})

	var signatureCounts = yield countSignaturesByIds(_.keys(topics))

	initiatives = initiatives.filter((initiative) => (
		initiative.external ||
		initiative.phase != "sign" ||
		topics[initiative.uuid].vote.endsAt > cutoff ||
		signatureCounts[initiative.uuid] >= Config.votesRequired
	))

	var statistics = yield {
		all: readStatistics(new Date(0)),
		30: readStatistics(DateFns.addDays(new Date, -30)),
	}

	res.render("home_page.jsx", {
		initiatives: initiatives,
		topics: topics,
		statistics: statistics,
		signatureCounts: signatureCounts
	})
}))

exports.router.get("/about", render.bind(null, "home/about_page.jsx"))
exports.router.get("/credits", render.bind(null, "home/credits_page.jsx"))
exports.router.get("/donate", alias.bind(null, "/donations/new"))
exports.router.get("/donated", alias.bind(null, "/donations/created"))

function* readStatistics(from, to) {
	var discussionsCount = yield cosDb.query(sql`
		SELECT COUNT(*)
		FROM "Topics"
		WHERE "createdAt" >= ${from}
		${to ? sql`AND "createdAt" < ${to}` : sql``}
		AND "deletedAt" IS NULL
		AND "visibility" = 'public'
		AND "sourcePartnerId" IN ${sql.in(PARTNER_IDS)}
	`).then(_.first).then((res) => res.count)

	var initiativesCount = yield cosDb.query(sql`
		SELECT COUNT(*)
		FROM "Topics" AS topic
		JOIN "TopicVotes" AS tv ON tv."topicId" = topic.id
		JOIN "Votes" AS vote ON vote.id = tv."voteId"
		WHERE vote."createdAt" >= ${from}
		${to ? sql`AND vote."createdAt" < ${to}` : sql``}
		AND topic."deletedAt" IS NULL
		AND topic."visibility" = 'public'
		AND topic."sourcePartnerId" IN ${sql.in(PARTNER_IDS)}
	`).then(_.first).then((res) => res.count)

	var signatureCount = yield cosDb.query(sql`
		WITH signatures AS (
			SELECT DISTINCT ON (sig."voteId", sig."userId") opt.value AS support
			FROM "VoteLists" AS sig
			JOIN "VoteOptions" AS opt ON opt.id = sig."optionId"
			WHERE sig."createdAt" >= ${from}
			${to ? sql`AND sig."createdAt" < ${to}` : sql``}
			ORDER BY sig."voteId", sig."userId", sig."createdAt" DESC
		)

		SELECT COUNT(*) as count FROM signatures
		WHERE support = 'Yes'
	`).then(_.first).then((res) => res.count)

	var parliamentCount = yield sqlite(sql`
		SELECT COUNT(*) as count
		FROM initiatives
		WHERE phase IN ('parliament', 'government', 'done')
		AND NOT external
		AND sent_to_parliament_at >= ${from}
		${to ? sql`AND sent_to_parliament_at < ${to}` : sql``}
	`).then(_.first).then((res) => res.count)

	return {
		discussionsCount: discussionsCount,
		initiativesCount: initiativesCount,
		signatureCount: signatureCount,
		parliamentCount: parliamentCount
	}
}

function alias(url, req, _res, next) { req.url = url; next() }
function render(page, _req, res) { res.render(page) }
