var _ = require("root/lib/underscore")
var DateFns = require("date-fns")
var Router = require("express").Router
var Config = require("root/config")
var MediaType = require("medium-type")
var ResponseTypeMiddeware =
	require("root/lib/middleware/response_type_middleware")
var next = require("co-next")
var sqlite = require("root").sqlite
var {countSignaturesByIds} = require("root/lib/initiative")
var sql = require("sqlate")
var initiativesDb = require("root/db/initiatives_db")
var canonicalizeUrl = require("root/lib/middleware/canonical_site_middleware")
var PHASES = require("root/lib/initiative").PHASES
var ZERO_COUNTS = _.fromEntries(PHASES.map((name) => [name, 0]))

exports.router = Router({mergeParams: true})

exports.router.get("/", next(function*(req, res) {
	var gov = req.government
	var cutoff = DateFns.addDays(DateFns.startOfDay(new Date), -14)

	var initiatives = yield initiativesDb.search(sql`
		SELECT initiative.*, user.name AS user_name
		FROM initiatives AS initiative
		LEFT JOIN users AS user ON initiative.user_id = user.id

		WHERE archived_at IS NULL
		AND published_at IS NOT NULL
		AND (
			phase != 'edit' OR
			discussion_ends_at > ${cutoff}
		)
		AND (destination IS NULL OR destination ${
			gov == null ? sql`IS NOT NULL` :
			gov == "parliament" ? sql`= 'parliament'` : sql`!= 'parliament'`
		})
	`)

	var signatureCounts = yield countSignaturesByIds(_.map(initiatives, "uuid"))

	initiatives = initiatives.filter((initiative) => (
		initiative.external ||
		initiative.phase != "sign" ||
		initiative.signing_ends_at > cutoff ||
		signatureCounts[initiative.uuid] >= Config.votesRequired
	))

	if (gov == "local") res.render("home/local_page.jsx", {
		initiatives: initiatives,
		signatureCounts: signatureCounts
	})
	else {
		var statistics = yield {
			all: readStatistics(null),

			30: readStatistics([
				DateFns.addDays(DateFns.startOfDay(new Date), -30),
				new Date
			]),
		}

		res.render("home_page.jsx", {
			initiatives: initiatives,
			statistics: statistics,
			signatureCounts: signatureCounts
		})
	}
}))

_.each({
	"/about": "home/about_page.jsx",
	"/credits": "home/credits_page.jsx",
	"/api": "home/api_page.jsx"
}, (page, path) => (
	exports.router.get(path, canonicalizeUrl, (_req, res) => res.render(page))
))

exports.router.get("/statistics",
	canonicalizeUrl,
	new ResponseTypeMiddeware([
		new MediaType("application/vnd.rahvaalgatus.statistics+json; v=1")
	]),
	next(function*(_req, res) {
	res.setHeader("Content-Type", res.contentType)
	res.setHeader("Access-Control-Allow-Origin", "*")

	var countsByPhase = _.defaults(_.fromEntries(yield sqlite(sql`
		SELECT phase, COUNT(*) AS count
		FROM initiatives
		WHERE published_at IS NOT NULL
		AND NOT external
		GROUP BY phase
	`).then((rows) => rows.map((row) => [row.phase, row.count]))), ZERO_COUNTS)

	// TODO: These two active-initiative queries could be combined.
	var activeCountsByPhase = yield {
		edit: sqlite(sql`
			SELECT COUNT(*) AS count
			FROM initiatives
			WHERE phase = 'edit'
			AND published_at IS NOT NULL
			AND discussion_ends_at > ${new Date}
		`).then(_.first).then((res) => res.count),

		sign: sqlite(sql`
			SELECT COUNT(*) AS count
			FROM initiatives
			WHERE phase = 'sign'
			AND published_at IS NOT NULL
			AND signing_ends_at > ${new Date}
		`).then(_.first).then((res) => res.count),
	}

	res.send({
		initiativeCountsByPhase: countsByPhase,
		activeInitiativeCountsByPhase: activeCountsByPhase,
		signatureCount: yield readSignatureCount(null)
	})
}))

function* readStatistics(range) {
	// The discussion counter on the home page is really the total initiatives
	// counter. Worth renaming in code, too, perhaps.
	//
	// https://github.com/rahvaalgatus/rahvaalgatus/issues/176#issuecomment-531594684.
	var discussionsCount = yield sqlite(sql`
		SELECT COUNT(*) AS count
		FROM initiatives
		WHERE NOT external
		AND published_at IS NOT NULL

		${range ? sql`
			AND created_at >= ${range[0]}
			AND created_at < ${range[1]}
		` : sql``}
	`).then(_.first).then((res) => res.count)

	var initiativesCount = yield sqlite(sql`
		SELECT COUNT(*) AS count
		FROM initiatives
		WHERE phase != 'edit'
		AND NOT external

		${range ? sql`
			AND "signing_started_at" >= ${range[0]}
			AND "signing_started_at" < ${range[1]}
		` : sql``}
	`).then(_.first).then((res) => res.count)

	var signatureCount = yield readSignatureCount(range)

	var parliamentCounts = yield sqlite(sql`
		SELECT
			COALESCE(SUM(NOT external), 0) AS sent,
			COALESCE(SUM(external), 0) AS external
		FROM initiatives
		WHERE phase IN ('parliament', 'government', 'done')

		${range ? sql`AND (
			external
			OR "sent_to_parliament_at" >= ${range[0]}
			AND "sent_to_parliament_at" < ${range[1]}
		)` : sql``}
	`).then(_.first).then((res) => res)

	return {
		discussionsCount: discussionsCount,
		initiativesCount: initiativesCount,
		signatureCount: signatureCount,
		parliamentCounts: parliamentCounts
	}
}

function readSignatureCount(range) {
	return sqlite(sql`
		SELECT COUNT(*) AS count
		FROM initiative_signatures

		${range ? sql`
			WHERE created_at >= ${range[0]}
			AND created_at < ${range[1]}
		` : sql``}

		UNION SELECT COUNT(*) AS count
		FROM initiative_citizenos_signatures

		${range ? sql`
			WHERE created_at >= ${range[0]}
			AND created_at < ${range[1]}
		` : sql``}
	`).then((rows) => _.sum(rows.map((row) => row.count)))
}
