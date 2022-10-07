var _ = require("root/lib/underscore")
var {Router} = require("express")
var HttpError = require("standard-http-error")
var DateFns = require("date-fns")
var Time = require("root/lib/time")
var {isAdmin} = require("root/lib/user")
var subscriptionsDb = require("root/db/initiative_subscriptions_db")
var commentsDb = require("root/db/comments_db")
var initiativesDb = require("root/db/initiatives_db")
var {sqlite} = require("root")
var sql = require("sqlate")
exports = module.exports = Router()

exports.use(function(req, _res, next) {
	if (req.user && isAdmin(req.user)) next()
	else if (req.user) next(new HttpError(403, "Not an Admin"))
	else next(new HttpError(401, "Not an Admin"))
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
	var from = req.query.from
		? Time.parseIsoDate(req.query.from)
		: DateFns.startOfMonth(new Date)

	var to = req.query.to ? Time.parseIsoDate(req.query.to) : null

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

	var signatureCount = sqlite(sql`
		SELECT
			COUNT(*) AS "all",
			COALESCE(SUM(method == 'id-card'), 0) AS id_card,
			COALESCE(SUM(method == 'mobile-id'), 0) AS mobile_id,
			COALESCE(SUM(method == 'smart-id'), 0) AS smart_id

		FROM initiative_signatures
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

	var citizenSignatureCount = sqlite(sql`
		SELECT COUNT(*) AS count
		FROM initiative_citizenos_signatures
		WHERE created_at >= ${from}
		${to ? sql`AND created_at < ${to}` : sql``}
	`)[0].count

	var initiativesCount = sqlite(sql`
		SELECT COUNT(*) AS count
		FROM initiatives
		WHERE created_at >= ${from}
		${to ? sql`AND created_at < ${to}` : sql``}
	`)[0].count

	var publishedInitiativesCount = sqlite(sql`
		SELECT COUNT(*) AS count
		FROM initiatives
		WHERE published_at >= ${from}
		${to ? sql`AND published_at < ${to}` : sql``}
		AND published_at IS NOT NULL
	`)[0].count

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
	`).map((row) => row.signature_milestones)

	var successfulCount = _.sum(_.map(milestones, (milestones) => (
		milestones[1000] &&
		milestones[1000] >= from &&
		milestones[1000] < to ? 1 : 0
	)))

	var signingStartedCount = sqlite(sql`
		SELECT COUNT(*) AS count
		FROM initiatives
		WHERE signing_started_at >= ${from}
		${to ? sql`AND signing_started_at < ${to}` : sql``}
	`)[0].count

	var sentCount = sqlite(sql`
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
		SELECT *
		FROM initiative_subscriptions
		ORDER BY created_at DESC
		LIMIT 15
	`)

	var subscriptionInitiatives = sqlite(sql`
		SELECT uuid, title
		FROM initiatives
		WHERE uuid IN ${sql.in(_.uniq(_.map(lastSubscriptions, "initiative_uuid")))}
	`)

	subscriptionInitiatives = _.indexBy(subscriptionInitiatives, "uuid")
	lastSubscriptions.forEach(function(sub) {
		sub.initiative = subscriptionInitiatives[sub.initiative_uuid]
	})

	res.render("admin/dashboard_page.jsx", {
		from: from,
		to: to,
		lastSubscriptions: lastSubscriptions,
		authenticationsCount: authenticationsCount,
		signatureCount: signatureCount,
		signerCount: signerCount,
		citizenSignatureCount: citizenSignatureCount,
		subscriberCount: subscriberCount,
		successfulCount: successfulCount,
		initiativesCount: initiativesCount,
		publishedInitiativesCount: publishedInitiativesCount,
		externalInitiativesCount: externalInitiativesCount,
		signingStartedCount: signingStartedCount,
		sentCount: sentCount
	})
})

_.each({
	"/users": require("./admin/users_controller").router,
	"/initiatives": require("./admin/initiatives_controller").router,
	"/signatures": require("./admin/initiative_signatures_controller").router
}, (router, path) => exports.use(path, router))

exports.get("/comments", function(_req, res) {
	var comments = commentsDb.search(sql`
		SELECT comment.*, user.id AS user_id, user.name AS user_name
		FROM comments AS comment
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

	res.render("admin/subscriptions/index_page.jsx", {
		subscriptions: subscriptions
	})
})
