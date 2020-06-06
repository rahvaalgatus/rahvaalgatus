var _ = require("root/lib/underscore")
var DateFns = require("date-fns")
var Router = require("express").Router
var MediaType = require("medium-type")
var ResponseTypeMiddeware =
	require("root/lib/middleware/response_type_middleware")
var next = require("co-next")
var sqlite = require("root").sqlite
var flatten = Function.apply.bind(Array.prototype.concat, Array.prototype)
var {getRequiredSignatureCount} = require("root/lib/initiative")
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
		WITH signatures AS (
			SELECT initiative_uuid FROM initiative_signatures
			UNION ALL
			SELECT initiative_uuid FROM initiative_citizenos_signatures
		)

		SELECT
			initiative.*,
			user.name AS user_name,
			COUNT(signature.initiative_uuid) AS signature_count

		FROM initiatives AS initiative
		LEFT JOIN users AS user ON initiative.user_id = user.id
		LEFT JOIN signatures AS signature
		ON signature.initiative_uuid = initiative.uuid

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

		GROUP BY initiative.uuid
	`)

	initiatives = initiatives.filter((initiative) => (
		initiative.external ||
		initiative.phase != "sign" ||
		initiative.signing_ends_at > cutoff ||
		initiative.signature_count >= getRequiredSignatureCount(initiative)
	))

	var statistics = gov == null || gov == "parliament" ? yield {
		all: readStatistics(gov, null),

		30: readStatistics(gov, [
			DateFns.addDays(DateFns.startOfDay(new Date), -30),
			new Date
		])
	} : null

	switch (gov) {
		case null:
			var recentInitiatives = yield searchRecentInitiatives(initiatives)

			res.render("home_page.jsx", {
				initiatives: initiatives,
				statistics: statistics,
				recentInitiatives: recentInitiatives
			})
			break

		case "parliament":
			res.render("home/parliament_home_page.jsx", {
				initiatives: initiatives,
				statistics: statistics
			})
			break

		case "local":
			var initiativeCounts = _.mapValues(
				_.indexBy(yield initiativesDb.search(sql`
					SELECT destination, COUNT(*) AS count
					FROM initiatives
					WHERE destination IS NOT NULL AND destination != 'parliament'
					AND published_at IS NOT NULL
					GROUP BY destination
				`), "destination"),
				(row) => row.count
			)

			res.render("home/local_home_page.jsx", {
				initiatives: initiatives,
				initiativeCounts: initiativeCounts
			})
			break

		default: throw new RangeError("Invalid government: " + gov)
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
		signatureCount: yield readSignatureCount(null, null)
	})
}))

function* readStatistics(gov, range) {
	// The discussion counter on the home page is really the total initiatives
	// counter at the start of the funnel.
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

		AND (destination IS NULL OR ${gov ? sql`destination = ${gov}` : sql`1 = 1`})
	`).then(_.first).then((res) => res.count)

	var initiativeCounts = yield sqlite(sql`
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

		${gov ? sql`AND destination = ${gov}` : sql``}
	`).then(_.first)

	var signatureCount = yield readSignatureCount(gov, range)

	var governmentCounts = yield sqlite(sql`
		SELECT
			COALESCE(SUM(NOT external), 0) AS sent,

			COALESCE(SUM(
				NOT external
				AND destination = 'parliament'
			), 0) AS sent_parliament,

			COALESCE(SUM(
				NOT external
				AND destination NOT NULL
				AND destination != 'parliament'
			), 0) AS sent_local,

			COALESCE(SUM(external), 0) AS external

		FROM initiatives
		WHERE phase IN ('parliament', 'government', 'done')

		${range ? sql`AND (
			external
			OR "sent_to_parliament_at" >= ${range[0]}
			AND "sent_to_parliament_at" < ${range[1]}
		)` : sql``}

		${gov ? sql`AND destination = ${gov}` : sql``}
	`).then(_.first)

	return {
		discussionsCount: discussionsCount,
		initiativeCounts: initiativeCounts,
		signatureCount: signatureCount,
		governmentCounts: governmentCounts
	}
}

function readSignatureCount(gov, range) {
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

		${gov ? sql`AND initiative.destination = ${gov}` : sql``}

		${range ? sql`
			AND signature.created_at >= ${range[0]}
			AND signature.created_at < ${range[1]}
		` : sql``}
	`).then(_.first).then((row) => row.count)
}

function* searchRecentInitiatives() {
	// Intentionally ignoring imported CitizenOS signatures as those originate
	// from Feb 2020 and earlier.
	var recents = _.fromEntries(_.uniqBy(_.reverse(_.sortBy(flatten(yield [
		sqlite(sql`
			SELECT
				comment.initiative_uuid AS uuid,
				max(comment.created_at) AS at,
				'commented' AS reason

			FROM comments AS comment
			JOIN initiatives AS initiative
			ON initiative.uuid = comment.initiative_uuid
			WHERE initiative.published_at IS NOT NULL
			GROUP BY initiative_uuid
			ORDER BY at DESC
			LIMIT 6
		`),

		sqlite(sql`
			SELECT
				initiative_uuid AS uuid,
				max(created_at) AS at,
				'signed' AS reason

			FROM initiative_signatures
			GROUP BY initiative_uuid
			ORDER BY at DESC
			LIMIT 6
		`)
	]).map(function(row) {
		row.at = new Date(row.at)
		return row
	}), "at")), "uuid").slice(0, 6).map((r, i) => [
		r.uuid,
		_.assign(r, {position: i})
	]))

	return _.sortBy(yield initiativesDb.search(sql`
		WITH signatures AS (
			SELECT initiative_uuid FROM initiative_signatures
			UNION ALL
			SELECT initiative_uuid FROM initiative_citizenos_signatures
		)

		SELECT
			initiative.*,
			user.name AS user_name,
			COUNT(signature.initiative_uuid) AS signature_count

		FROM initiatives AS initiative
		LEFT JOIN users AS user ON initiative.user_id = user.id
		LEFT JOIN signatures AS signature
		ON signature.initiative_uuid = initiative.uuid

		WHERE initiative.uuid IN ${sql.in(_.keys(recents))}

		GROUP BY initiative.uuid
	`), (i) => recents[i.uuid].position).map((i) => _.assign(
		i,
		{reason: recents[i.uuid].reason}
	))
}
