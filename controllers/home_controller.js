var _ = require("root/lib/underscore")
var DateFns = require("date-fns")
var {Router} = require("express")
var MediaType = require("medium-type")
var ResponseTypeMiddeware =
	require("root/lib/middleware/response_type_middleware")
var {sqlite} = require("root")
var {getSignatureThreshold} = require("root/lib/initiative")
var sql = require("sqlate")
var initiativesDb = require("root/db/initiatives_db")
var newsDb = require("root/db/news_db")
var {PHASES} = require("root/lib/initiative")
var ZERO_COUNTS = _.fromEntries(PHASES.map((name) => [name, 0]))
var HIDE_EXPIRED_AFTER_DAYS = 14

exports.router = Router({mergeParams: true})

exports.router.get("/", function(_req, res) {
	var initiatives = searchInitiatives(null)

	var statistics = {
		all: readStatistics(null, null),

		30: readStatistics(null, [
			DateFns.addDays(DateFns.startOfDay(new Date), -30),
			new Date
		])
	}

	var recentInitiatives = searchRecentInitiatives(initiatives)

	var news = newsDb.search(sql`
		SELECT * FROM news, json_each(news.categories) AS category
		WHERE category.value = 'Rahvaalgatusveeb'
		ORDER BY published_at DESC
		LIMIT 3
	`)

	res.render("home_page.jsx", {
		initiatives,
		statistics,
		recentInitiatives,
		news
	})
})

exports.router.get("/parliament", function(_req, res) {
	var initiatives = searchInitiatives("parliament")

	var statistics = {
		all: readStatistics("parliament", null),

		30: readStatistics("parliament", [
			DateFns.addDays(DateFns.startOfDay(new Date), -30),
			new Date
		])
	}

	res.render("home/parliament_home_page.jsx", {initiatives, statistics})
})

exports.router.get("/local", function(_req, res) {
	var initiatives = searchInitiatives("local")

	res.render("home/local_home_page.jsx", {
		initiatives,
		initiativeCounts: readPhaseInitiativeCounts()
	})
})

_.each({
	"/about": "home/about_page.jsx",
	"/eu": "home/eu_page.jsx",
	"/credits": "home/credits_page.jsx",
	"/api": "home/api_page.jsx",
	"/help/kov-guide": "home/help/kov_guide_page.jsx"
}, (page, path) => (
	exports.router.get(path, (_req, res) => res.render(page))
))

exports.router.get("/statistics",
	new ResponseTypeMiddeware([
		new MediaType("application/vnd.rahvaalgatus.statistics+json; v=1")
	]),
	function(_req, res) {
	res.setHeader("Content-Type", res.contentType)
	res.setHeader("Access-Control-Allow-Origin", "*")

	var countsByPhase = _.defaults(_.fromEntries(sqlite(sql`
		SELECT phase, COUNT(*) AS count
		FROM initiatives
		WHERE published_at IS NOT NULL
		AND NOT external
		GROUP BY phase
	`).map((row) => [row.phase, row.count])), ZERO_COUNTS)

	// TODO: These two active-initiative queries could be combined.
	var activeCountsByPhase = {
		edit: sqlite(sql`
			SELECT COUNT(*) AS count
			FROM initiatives
			WHERE phase = 'edit'
			AND published_at IS NOT NULL
			AND discussion_ends_at > ${new Date}
		`)[0].count,

		sign: sqlite(sql`
			SELECT COUNT(*) AS count
			FROM initiatives
			WHERE phase = 'sign'
			AND published_at IS NOT NULL
			AND signing_ends_at > ${new Date}
			AND signing_expired_at IS NULL
		`)[0].count
	}

	res.send({
		initiativeCountsByPhase: countsByPhase,
		activeInitiativeCountsByPhase: activeCountsByPhase,
		signatureCount: readSignatureCount(null, null)
	})
})

function searchInitiatives(destination) {
	var cutoff = getExpirationCutoff(new Date)

	var initiatives = initiativesDb.search(sql`
		SELECT
			initiative.*,
			user.name AS user_name,
			${initiativesDb.countSignatures(sql`initiative_uuid = initiative.uuid`)}
			AS signature_count

		FROM initiatives AS initiative
		LEFT JOIN users AS user ON initiative.user_id = user.id

		WHERE initiative.archived_at IS NULL
		AND initiative.published_at IS NOT NULL
		AND initiative.signing_expired_at IS NULL
		AND (
			initiative.phase != 'edit' OR
			initiative.discussion_ends_at > ${cutoff}
		)
		AND (initiative.destination IS NULL OR initiative.destination ${
			destination == null ? sql`IS NOT NULL` :
			destination == "parliament" ? sql`= 'parliament'` :
			destination == "local" ? sql`!= 'parliament'` : sql`= ${destination}`
		})
	`)

	return initiatives.filter((initiative) => (
		initiative.external ||
		initiative.phase != "sign" ||
		initiative.signing_ends_at > cutoff ||
		initiative.signature_count >= getSignatureThreshold(initiative)
	))
}

function readStatistics(destination, range) {
	// The discussion counter on the home page is really the total initiatives
	// counter at the start of the funnel.
	//
	// https://github.com/rahvaalgatus/rahvaalgatus/issues/176#issuecomment-531594684.
	var discussionsCount = sqlite(sql`
		SELECT COUNT(*) AS count
		FROM initiatives
		WHERE NOT external
		AND published_at IS NOT NULL

		${range ? sql`
			AND published_at >= ${range[0]}
			AND published_at < ${range[1]}
		` : sql``}

		${destination ? sql`AND (
			destination = ${destination}
		)` : sql``}
	`)[0].count

	var initiativeCounts = sqlite(sql`
		SELECT
			COUNT(*) AS "all",
			COALESCE(SUM(destination = 'parliament'), 0) AS parliament,

			COALESCE(SUM(
				destination IS NOT NULL
				AND destination != 'parliament'
			), 0) AS local

		FROM initiatives
		WHERE phase != 'edit'
		AND NOT external

		${range ? sql`
			AND "signing_started_at" >= ${range[0]}
			AND "signing_started_at" < ${range[1]}
		` : sql``}

		${destination ? sql`AND destination = ${destination}` : sql``}
	`)[0]

	var signatureCount = readSignatureCount(destination, range)

	var governmentCounts = sqlite(sql`
		SELECT
			COALESCE(SUM(NOT external), 0) AS sent,

			COALESCE(SUM(
				NOT external
				AND destination = 'parliament'
			), 0) AS sent_parliament,

			COALESCE(SUM(
				NOT external
				AND destination != 'parliament'
			), 0) AS sent_local,

			COALESCE(SUM(external), 0) AS external

		FROM initiatives
		WHERE phase IN ('parliament', 'government', 'done')

		${range ? sql`AND (
			external

			OR destination = 'parliament'
			AND "sent_to_parliament_at" >= ${range[0]}
			AND "sent_to_parliament_at" < ${range[1]}

			OR destination != 'parliament'
			AND "sent_to_government_at" >= ${range[0]}
			AND "sent_to_government_at" < ${range[1]}
		)` : sql``}

		${destination ? sql`AND destination = ${destination}` : sql``}
	`)[0]

	return {
		discussionsCount: discussionsCount,
		initiativeCounts: initiativeCounts,
		signatureCount: signatureCount,
		governmentCounts: governmentCounts
	}
}

function readSignatureCount(destination, range) {
	return sqlite(sql`
		WITH signatures AS (
			SELECT initiative_uuid, created_at FROM initiative_signatures
			UNION ALL
			SELECT initiative_uuid, created_at FROM initiative_citizenos_signatures
		)

		SELECT COUNT(*) AS count FROM signatures AS signature
		JOIN initiatives AS initiative
		ON initiative.uuid = signature.initiative_uuid
		WHERE 1 = 1

		${destination ? sql`AND initiative.destination = ${destination}` : sql``}

		${range ? sql`
			AND signature.created_at >= ${range[0]}
			AND signature.created_at < ${range[1]}
		` : sql``}
	`)[0].count
}

function searchRecentInitiatives() {
	// Intentionally ignoring imported CitizenOS signatures as those originate
	// from Feb 2020 and earlier.
	var recents = _.fromEntries(_.uniqBy(sqlite(sql`
		SELECT uuid, last_comment_created_at AS at, 'commented' AS reason
		FROM initiatives
		WHERE published_at IS NOT NULL
		AND last_comment_created_at IS NOT NULL

		UNION ALL

		SELECT initiative_uuid AS uuid, max(created_at) AS at, 'signed' AS reason
		FROM initiative_signatures
		GROUP BY initiative_uuid

		UNION ALL

		SELECT uuid, last_event_created_at AS at, 'event' AS reason
		FROM initiatives
		WHERE published_at IS NOT NULL
		AND last_event_created_at IS NOT NULL

		ORDER BY at DESC
		LIMIT 6 * 3
	`), "uuid").slice(0, 6).map((r, i) => [r.uuid, _.assign(r, {position: i})]))

	return _.sortBy(initiativesDb.search(sql`
		SELECT
			initiative.*,
			user.name AS user_name,
			${initiativesDb.countSignatures(sql`initiative_uuid = initiative.uuid`)}
			AS signature_count

		FROM initiatives AS initiative
		LEFT JOIN users AS user ON user.id = initiative.user_id
		WHERE initiative.uuid IN ${sql.in(_.keys(recents))}
	`), (i) => recents[i.uuid].position).map((i) => _.assign(
		i,
		{reason: recents[i.uuid].reason}
	))
}

function readPhaseInitiativeCounts() {
	var cutoff = getExpirationCutoff(new Date)

	return _.mapValues(_.groupBy(initiativesDb.search(sql`
		SELECT
			destination,
			phase,
			discussion_ends_at,
			signing_ends_at,
			signing_expired_at,
			archived_at,

			CASE phase WHEN 'sign' THEN
			${initiativesDb.countSignatures(sql`initiative_uuid = initiative.uuid`)}
			END AS signature_count

		FROM initiatives AS initiative
		WHERE destination IS NOT NULL AND destination != 'parliament'
		AND published_at IS NOT NULL
	`), "destination"), (initiatives) => _.countBy(initiatives, (initiative) => {
		switch (initiative.phase) {
			case "edit":
				if (initiative.discussion_ends_at <= cutoff) return "archive"
				return "edit"

			case "sign":
				if (
					initiative.signing_ends_at <= cutoff &&
					initiative.signature_count < getSignatureThreshold(initiative)
				) return "archive"

				if (initiative.signing_expired_at) return "archive"
				return "sign"

			case "parliament":
			case "government": return "government"
			case "done": return "archive"
			default: return null
		}
	}))
}

function getExpirationCutoff(now) {
	return DateFns.addDays(DateFns.startOfDay(now), -HIDE_EXPIRED_AFTER_DAYS)
}
