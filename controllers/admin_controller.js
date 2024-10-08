var _ = require("root/lib/underscore")
var Config = require("root").config
var {Router} = require("express")
var HttpError = require("standard-http-error")
var DateFns = require("date-fns")
var Time = require("root/lib/time")
var {YearMonth} = require("root/lib/time")
var {getAdminPermissions} = require("root/lib/user")
var subscriptionsDb = require("root/db/initiative_subscriptions_db")
var commentsDb = require("root/db/comments_db")
var initiativesDb = require("root/db/initiatives_db")
var {sqlite} = require("root")
var redirect = require("root/lib/redirect")
var sql = require("sqlate")
exports = module.exports = Router()

// The AdminController is mounted under /admin on staging. That's why its
// contents is not in bin/adm.
exports.use(function(req, _res, next) {
	if (req.user == null) return void next(new HttpError(401, "Not an Admin"))
	var perms = getAdminPermissions(req.user)
	if (perms == null) return void next(new HttpError(403, "Not an Admin"))
	req.adminPermissions = perms
	next()
})

exports.use(function(_req, res, next) {
	res.setHeader("Cache-Control", "no-store")
  next()
})

exports.use(function(req, _res, next) {
	req.rootUrl = req.baseUrl
	next()
})

exports.get("/", function(req, res) {
	var from = (
		req.query.from && Time.parseIsoDate(req.query.from) ||
		DateFns.startOfMonth(new Date)
	)

	var to = req.query.to ? Time.parseIsoDate(req.query.to) : null

	var initiativesCount = sqlite(sql`
		SELECT COUNT(*) AS count
		FROM initiatives
		WHERE created_at >= ${from}
		${to ? sql`AND created_at < ${to}` : sql``}
	`)[0].count

	var publishedInitiativesCount = sqlite(sql`
		SELECT
			COUNT(*) AS "all",
			COALESCE(SUM(destination = 'parliament'), 0) AS parliament,
			COALESCE(SUM(destination != 'parliament'), 0) AS local

		FROM initiatives
		WHERE published_at >= ${from}
		${to ? sql`AND published_at < ${to}` : sql``}
		AND published_at IS NOT NULL
	`)[0]

	var externalInitiativesCount = sqlite(sql`
		SELECT COUNT(*) AS count
		FROM initiatives
		WHERE external
		AND "created_at" >= ${from}
		${to ? sql`AND "created_at" < ${to}` : sql``}
	`)[0].count

	var milestones = initiativesDb.search(sql`
		SELECT signature_milestones
		FROM initiatives
		WHERE signature_milestones != '{}'
		AND destination = 'parliament'
	`).map((row) => row.signature_milestones)

	// TODO: This should probably take the saved signature threshold into account
	// should that ever change for the parliament.
	var successfulInitiativesCount = _.sum(milestones.map((milestones) => (
		milestones[Config.votesRequired] &&
		milestones[Config.votesRequired] >= from &&
		(to == null || milestones[Config.votesRequired] < to) ? 1 : 0
	)))

	var signingStartedCount = sqlite(sql`
		SELECT
			COUNT(*) AS "all",
			COALESCE(SUM(destination = 'parliament'), 0) AS parliament,
			COALESCE(SUM(destination != 'parliament'), 0) AS local

		FROM initiatives
		WHERE signing_started_at >= ${from}
		${to ? sql`AND signing_started_at < ${to}` : sql``}
	`)[0]

	var sentInitiativesCount = sqlite(sql`
		SELECT
			COUNT(*) AS "all",
			COALESCE(SUM(destination = 'parliament'), 0) AS parliament,
			COALESCE(SUM(destination != 'parliament'), 0) AS local

		FROM initiatives
		WHERE phase IN ('parliament', 'government', 'done')
		AND NOT external

		AND (
			destination = 'parliament'
			AND sent_to_parliament_at >= ${from}
			${to ? sql`AND sent_to_parliament_at < ${to}` : sql``}
			OR
			destination != 'parliament'
			AND sent_to_government_at >= ${from}
			${to ? sql`AND sent_to_government_at < ${to}` : sql``}
		)
	`)[0]

	var authenticationsCount = sqlite(sql`
		SELECT
			COUNT(*) AS "all",
			COALESCE(SUM(method == 'id-card'), 0) AS id_card,
			COALESCE(SUM(method == 'mobile-id'), 0) AS mobile_id,
			COALESCE(SUM(method == 'smart-id'), 0) AS smart_id

		FROM sessions
		WHERE created_at >= ${from}
		${to ? sql`AND created_at < ${to}` : sql``}
	`)[0]

	var signerCount = sqlite(sql`
		WITH signers AS (
			SELECT country, personal_id
			FROM initiative_signatures
			WHERE created_at >= ${from}
			${to ? sql`AND created_at < ${to}` : sql``}

			UNION SELECT country, personal_id
			FROM initiative_citizenos_signatures
			WHERE created_at >= ${from}
			${to ? sql`AND created_at < ${to}` : sql``}
		)

		SELECT COUNT(*) AS count FROM signers
	`)[0].count

	var signatureCount = sqlite(sql`
		SELECT
			COUNT(*) AS "all",
			COALESCE(SUM(sig.oversigned), 0) AS all_oversigned,
			COALESCE(SUM(sig.method == 'id-card'), 0) AS id_card,
			COALESCE(SUM(sig.method == 'mobile-id'), 0) AS mobile_id,
			COALESCE(SUM(sig.method == 'smart-id'), 0) AS smart_id,

			COALESCE(SUM(IIF(sig.method = 'id-card', sig.oversigned, 0)), 0)
			AS id_card_oversigned,

			COALESCE(SUM(IIF(sig.method = 'mobile-id', sig.oversigned, 0)), 0)
			AS mobile_id_oversigned,

			COALESCE(SUM(IIF(sig.method = 'smart-id', sig.oversigned, 0)), 0)
			AS smart_id_oversigned,

			COALESCE(SUM(initiative.destination = 'parliament'), 0) AS parliament,
			COALESCE(SUM(initiative.destination != 'parliament'), 0) AS local

		FROM initiative_signatures AS sig
		JOIN initiatives AS initiative ON initiative.uuid = sig.initiative_uuid
		WHERE sig.created_at >= ${from}
		${to ? sql`AND sig.created_at < ${to}` : sql``}
	`)[0]

	var citizenSignatureCount = sqlite(sql`
		SELECT
			COUNT(*) AS "all",
			COALESCE(SUM(initiative.destination = 'parliament'), 0) AS parliament,
			COALESCE(SUM(initiative.destination != 'parliament'), 0) AS local

		FROM initiative_citizenos_signatures AS sig
		JOIN initiatives AS initiative ON initiative.uuid = sig.initiative_uuid
		WHERE sig.created_at >= ${from}
		${to ? sql`AND sig.created_at < ${to}` : sql``}
	`)[0]

	var subscriberCount = sqlite(sql`
		WITH emails AS (
			SELECT DISTINCT email
			FROM initiative_subscriptions
			WHERE confirmed_at >= ${from}
			${to ? sql`AND confirmed_at < ${to}` : sql``}
		)

		SELECT COUNT(*) AS count FROM emails
	`)[0].count

	var lastSubscriptions = subscriptionsDb.search(sql`
		SELECT
			subscription.*,
			initiative.id AS initiative_id,
			initiative.slug AS initiative_slug,
			initiative.title AS initiative_title

		FROM initiative_subscriptions AS subscription
		LEFT JOIN initiatives AS initiative
		ON initiative.uuid = subscription.initiative_uuid
		ORDER BY subscription.created_at DESC
		LIMIT 15
	`)

	res.render("admin/dashboard_page.jsx", {
		from,
		to,
		lastSubscriptions,
		authenticationsCount,
		signatureCount,
		signerCount,
		citizenSignatureCount,
		subscriberCount,
		successfulInitiativesCount,
		initiativesCount,
		publishedInitiativesCount,
		externalInitiativesCount,
		signingStartedCount,
		sentInitiativesCount
	})
})

exports.get("/history", function(_req, res) {
	var authenticationCounts = sqlite(sql`
		SELECT
			strftime('%Y-%m', created_at, 'localtime') AS year_month,
			COUNT(*) AS "all",
			COALESCE(SUM(method == 'id-card'), 0) AS id_card,
			COALESCE(SUM(method == 'mobile-id'), 0) AS mobile_id,
			COALESCE(SUM(method == 'smart-id'), 0) AS smart_id

		FROM sessions
		GROUP BY year_month
	`).map(parseYearMonth)

	var signatureCounts = sqlite(sql`
		SELECT
			strftime('%Y-%m', sig.created_at, 'localtime') AS year_month,
			COUNT(*) AS "all",
			COALESCE(SUM(sig.oversigned), 0) AS all_oversigned,
			COALESCE(SUM(sig.method == 'id-card'), 0) AS id_card,
			COALESCE(SUM(sig.method == 'mobile-id'), 0) AS mobile_id,
			COALESCE(SUM(sig.method == 'smart-id'), 0) AS smart_id,

			COALESCE(SUM(IIF(sig.method = 'id-card', sig.oversigned, 0)), 0)
			AS id_card_oversigned,

			COALESCE(SUM(IIF(sig.method = 'mobile-id', sig.oversigned, 0)), 0)
			AS mobile_id_oversigned,

			COALESCE(SUM(IIF(sig.method = 'smart-id', sig.oversigned, 0)), 0)
			AS smart_id_oversigned

		FROM initiative_signatures AS sig
		JOIN initiatives AS initiative ON initiative.uuid = sig.initiative_uuid

		GROUP BY year_month
	`).map(parseYearMonth)

	res.render("admin/history_page.jsx", {
		authenticationCounts,
		signatureCounts
	})

	function parseYearMonth(row) {
		return _.assign(row, {year_month: YearMonth.parse(row.year_month)})
	}
})

_.each({
	"/overview": "/history"
}, (to, from) => exports.get(from, redirect(302, to)))

_.each({
	"/users": require("./admin/users_controller").router,
	"/destinations": require("./admin/destinations_controller").router,
	"/initiatives": require("./admin/initiatives_controller").router,
	"/signatures": require("./admin/initiative_signatures_controller").router,
	"/external-responses": require("./admin/external_responses_controller").router
}, (router, path) => exports.use(path, router))

exports.get("/comments", function(_req, res) {
	var comments = commentsDb.search(sql`
		SELECT
			comment.*,
			initiative.id AS initiative_id,
			initiative.slug AS initiative_slug,
			user.id AS user_id,
			user.name AS user_name

		FROM comments AS comment
		JOIN initiatives AS initiative ON initiative.uuid = comment.initiative_uuid
		JOIN users AS user ON comment.user_id = user.id
		ORDER BY created_at DESC
		LIMIT 15
	`)

	res.render("admin/comments/index_page.jsx", {comments: comments})
})

exports.get("/subscriptions", function(_req, res) {
	var subscriptions = subscriptionsDb.search(sql`
		SELECT *
		FROM initiative_subscriptions
		WHERE initiative_uuid IS NULL
		ORDER BY created_at DESC
	`)

	res.render("admin/subscriptions/index_page.jsx", {subscriptions})
})
