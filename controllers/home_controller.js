var _ = require("root/lib/underscore")
var DateFns = require("date-fns")
var Router = require("express").Router
var Config = require("root/config")
var MediaType = require("medium-type")
var ResponseTypeMiddeware =
	require("root/lib/middleware/response_type_middleware")
var next = require("co-next")
var searchTopics = require("root/lib/citizenos_db").searchTopics
var cosDb = require("root").cosDb
var sqlite = require("root").sqlite
var {countSignaturesByIds} = require("root/lib/initiative")
var sql = require("sqlate")
var initiativesDb = require("root/db/initiatives_db")
var concat = Array.prototype.concat.bind(Array.prototype)
var PARTNER_IDS = concat(Config.apiPartnerId, _.keys(Config.partners))
var PHASES = require("root/lib/initiative").PHASES
var ZERO_COUNTS = _.fromEntries(PHASES.map((name) => [name, 0]))

exports.router = Router({mergeParams: true})

exports.router.get("/", next(function*(req, res) {
	var gov = req.government

	var initiatives = yield initiativesDb.search(sql`
		SELECT initiative.*, user.name AS user_name
		FROM initiatives AS initiative
		LEFT JOIN users AS user ON initiative.user_id = user.id

		WHERE initiative.archived_at IS NULL AND (
			destination IS NULL OR
			destination ${gov == "parliament" ? sql`==` : sql`!=`} "parliament"
		)
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

	if (gov == "local") res.render("home/local_page.jsx", {
		initiatives: initiatives,
		topics: topics,
		signatureCounts: signatureCounts
	})
	else {
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
	}
}))

exports.router.get("/about", render.bind(null, "home/about_page.jsx"))
exports.router.get("/credits", render.bind(null, "home/credits_page.jsx"))
exports.router.get("/donate", alias.bind(null, "/donations/new"))
exports.router.get("/donated", alias.bind(null, "/donations/created"))
exports.router.get("/api", render.bind(null, "home/api_page.jsx"))

exports.router.get("/statistics",
	new ResponseTypeMiddeware([
		new MediaType("application/vnd.rahvaalgatus.statistics+json; v=1")
	]),
	next(function*(_req, res) {
	res.setHeader("Content-Type", res.contentType)
	res.setHeader("Access-Control-Allow-Origin", "*")

	var countsByPhase = _.defaults(_.fromEntries(yield sqlite(sql`
		SELECT phase, COUNT(*) AS count
		FROM initiatives
		WHERE phase <> 'edit'
		AND NOT external
		GROUP BY phase
	`).then((rows) => rows.map((row) => [row.phase, row.count]))), ZERO_COUNTS)

	countsByPhase.edit = yield cosDb.query(sql`
		SELECT COUNT(*) AS count
		FROM "Topics"
		WHERE "sourcePartnerId" IN ${sql.in(PARTNER_IDS)}
		AND "deletedAt" IS NULL
		AND visibility = 'public'
		AND status = 'inProgress'
	`).then(_.first).then((res) => Number(res.count))

	var activeCountsByPhase = yield {
		edit: cosDb.query(sql`
			SELECT COUNT(*) AS count
			FROM "Topics"
			WHERE "sourcePartnerId" IN ${sql.in(PARTNER_IDS)}
			AND "deletedAt" IS NULL
			AND visibility = 'public'
			AND status = 'inProgress'
			AND "endsAt" > ${new Date}
		`).then(_.first).then((res) => Number(res.count)),

		sign: cosDb.query(sql`
			SELECT COUNT(*) AS count
			FROM "Topics" AS topic
			JOIN "TopicVotes" AS tv ON tv."topicId" = topic.id
			JOIN "Votes" AS vote ON vote.id = tv."voteId"
			WHERE topic."sourcePartnerId" IN ${sql.in(PARTNER_IDS)}
			AND topic."deletedAt" IS NULL
			AND topic."visibility" = 'public'
			AND status = 'voting'
			AND vote."endsAt" > ${new Date}
		`).then(_.first).then((res) => Number(res.count)),
	}

	res.send({
		initiativeCountsByPhase: countsByPhase,
		activeInitiativeCountsByPhase: activeCountsByPhase,
		signatureCount: yield readSignatureCount(new Date(0))
	})
}))

function* readStatistics(from, to) {
	// The discussion counter on the home page is really the total initiatives
	// counter. Worth renaming in code, too, perhaps.
	//
	// https://github.com/rahvaalgatus/rahvaalgatus/issues/176#issuecomment-531594684.
	var discussionsCount = yield cosDb.query(sql`
		SELECT COUNT(*) AS count
		FROM "Topics"
		WHERE "sourcePartnerId" IN ${sql.in(PARTNER_IDS)}
		AND "createdAt" >= ${from}
		${to ? sql`AND "createdAt" < ${to}` : sql``}
		AND "deletedAt" IS NULL
		AND "visibility" = 'public'
	`).then(_.first).then((res) => res.count)

	var initiativesCount = yield cosDb.query(sql`
		SELECT COUNT(*) AS count
		FROM "Topics" AS topic
		JOIN "TopicVotes" AS tv ON tv."topicId" = topic.id
		JOIN "Votes" AS vote ON vote.id = tv."voteId"
		WHERE topic."sourcePartnerId" IN ${sql.in(PARTNER_IDS)}
		AND vote."createdAt" >= ${from}
		${to ? sql`AND vote."createdAt" < ${to}` : sql``}
		AND topic."deletedAt" IS NULL
		AND topic."visibility" = 'public'
	`).then(_.first).then((res) => res.count)

	var signatureCount = yield readSignatureCount(from, to)

	var parliamentCounts = yield sqlite(sql`
		SELECT SUM(NOT external) AS sent, SUM(external) AS external
		FROM initiatives
		WHERE phase IN ('parliament', 'government', 'done')
		AND (sent_to_parliament_at >= ${from} OR external)
		${to ? sql`AND sent_to_parliament_at < ${to}` : sql``}
	`).then(_.first).then((res) => res)

	return {
		discussionsCount: discussionsCount,
		initiativesCount: initiativesCount,
		signatureCount: signatureCount,
		parliamentCounts: parliamentCounts
	}
}

function readSignatureCount(from, to) {
	var citizenSignatureCount = cosDb.query(sql`
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
	`).then(_.first).then((res) => Number(res.count))

	var signatureCount = sqlite(sql`
		SELECT COUNT(*) as count FROM initiative_signatures
		WHERE created_at >= ${from}
		${to ? sql`AND created_at < ${to}` : sql``}
	`).then(_.first).then((res) => Number(res.count))

	return Promise.all([citizenSignatureCount, signatureCount]).then(_.sum)
}

function alias(url, req, _res, next) { req.url = url; next() }
function render(page, _req, res) { res.render(page) }
