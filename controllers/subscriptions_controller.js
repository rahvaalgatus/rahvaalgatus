var _ = require("root/lib/underscore")
var Qs = require("qs")
var Http = require("root/lib/http")
var Router = require("express").Router
var SqliteError = require("root/lib/sqlite_error")
var sendEmail = require("root").sendEmail
var renderEmail = require("root/lib/i18n").email
var searchTopics = require("root/lib/citizenos_db").searchTopics
var next = require("co-next")
var db = require("root/db/initiative_subscriptions_db")
var initiativesDb = require("root/db/initiatives_db")
var sql = require("sqlate")
exports.parse = parse
exports.router = Router({mergeParams: true})

var readSubscriptionFromQuery = next(withSubscription.bind(null, (req) => [
	req.query.initiative,
	req.query["update-token"]
]))

exports.router.get("/", readSubscriptionFromQuery, next(function*(req, res) {
	var subscription = req.subscription

	var subscriptions = yield db.search(sql`
		SELECT * FROM initiative_subscriptions
		WHERE email = ${subscription.email}
		AND confirmed_at IS NOT NULL
		ORDER BY COALESCE(initiative_uuid, 0)
	`)

	var initiatives = yield initiativesDb.search(sql`
		SELECT * FROM initiatives
		WHERE uuid IN ${sql.in(subscriptions.map((s) => s.initiative_uuid))}
	`)

	var topics = _.indexBy(yield searchTopics(sql`
		topic.id IN ${sql.in(initiatives.map((i) => i.uuid))}
		AND topic.visibility = 'public'
	`), "id")

	initiatives.forEach(function(initiative) {
		var topic = topics[initiative.uuid]
		if (topic) initiative.title = topic.title
	})

	res.render("subscriptions/index_page.jsx", {
		subscription: subscription,
		subscriptions: subscriptions,
		initiatives: initiatives
	})
}))

exports.router.post("/", next(function*(req, res) {
	var email = req.body.email

	if (!_.isValidEmail(email))
		return void res.status(422).render("form_error_page.jsx", {
			errors: [req.t("INVALID_EMAIL")]
		})

	var subscription
	try {
		subscription = yield db.create({
			email: email,
			created_at: new Date,
			created_ip: req.ip,
			updated_at: new Date
		})
	}
	catch (err) {
		if (err instanceof SqliteError && err.type == "unique")
			subscription = yield db.read(sql`
				SELECT * FROM initiative_subscriptions
				WHERE initiative_uuid IS NULL AND email = ${email}
			`)

		else throw err
	}

	if (
		subscription.confirmation_sent_at == null ||
		new Date - subscription.confirmation_sent_at >= 3600 * 1000
	) {
		var token = subscription.update_token

		if (subscription.confirmed_at) {
			yield sendEmail({
				to: email,
				subject: req.t("ALREADY_SUBSCRIBED_TO_INITIATIVES_TITLE"),
				text: renderEmail(req.lang, "ALREADY_SUBSCRIBED_TO_INITIATIVES_BODY", {
					url: Http.link(req, req.baseUrl + "/" + token)
				})
			})
		}
		else yield sendEmail({
			to: email,
			subject: req.t("CONFIRM_INITIATIVES_SUBSCRIPTION_TITLE"),
			text: renderEmail(req.lang, "CONFIRM_INITIATIVES_SUBSCRIPTION_BODY", {
				url: Http.link(req, req.baseUrl + "/new?confirmation_token=" + token)
			})
		})

		yield db.update(subscription, {
			confirmation_sent_at: new Date,
			updated_at: new Date
		})
	}

	res.flash("notice", req.t("CONFIRM_INITIATIVES_SUBSCRIPTION"))
	res.redirect(303, "/")
}))

exports.router.put("/", readSubscriptionFromQuery, next(function*(req, res) {
	var subscription = req.subscription

	var attrsByInitiativeUuid = _.mapValues(_.filterValues(req.body, (_a, id) => (
		id == "null" || id.indexOf("-") >= 0
	)), parse)

	// Get all subscriptions for redirecting later.
	var subscriptions = yield db.search(sql`
		SELECT * FROM initiative_subscriptions
		WHERE email = ${subscription.email}
		AND confirmed_at IS NOT NULL
	`)

	subscriptions = (yield subscriptions.map(function(subscription) {
		var attrs = attrsByInitiativeUuid[subscription.initiative_uuid]
		if (attrs == null) return Promise.resolve(subscription)
		if (attrs.delete) return db.delete(subscription)
		return db.update(subscription, {__proto__: attrs, updated_at: new Date})
	})).filter(Boolean)

	res.flash("notice", req.t("INITIATIVE_SUBSCRIPTIONS_UPDATED"))

	var to = subscriptions.find((sub) => (
		sub.initiative_uuid == subscription.initiative_uuid
	)) || subscriptions[0]

	res.redirect(303, to ? "/subscriptions?" + tokenize(to) : "/")
}))

exports.router.delete("/", readSubscriptionFromQuery, next(function*(req, res) {
	var subscription = req.subscription

	yield db.execute(sql`
		DELETE FROM initiative_subscriptions
		WHERE email = ${subscription.email}
		AND confirmed_at IS NOT NULL
	`)

	res.flash("notice", req.t("INITIATIVES_SUBSCRIPTION_DELETED"))
	res.redirect(303, "/")
}))

exports.router.get("/new", next(function*(req, res) {
	var subscription = yield db.read(sql`
		SELECT * FROM initiative_subscriptions
		WHERE initiative_uuid IS NULL
		AND update_token = ${req.query.confirmation_token}
		LIMIT 1
	`)

	if (subscription) {
		if (!subscription.confirmed_at)
			yield db.update(subscription, {
				confirmed_at: new Date,
				updated_at: new Date
			})
		
		res.flash("notice", req.t("CONFIRMED_INITIATIVES_SUBSCRIPTION"))
		res.redirect(303, req.baseUrl + "/" + subscription.update_token)
	}
	else {
		res.statusCode = 404
		res.statusMessage = "Invalid Confirmation Token"

		res.render("error_page.jsx", {
			body: req.t("INVALID_INITIATIVES_SUBSCRIPTION_CONFIRMATION_TOKEN")
		})
	}
}))

exports.router.use("/:token",
	next(withSubscription.bind(null, (req) => [null, req.params.token])))

exports.router.get("/:token", function(req, res) {
	var subscription = req.subscription
	res.redirect(302, `${req.baseUrl}?update-token=${subscription.update_token}`)
})

function parse(obj) {
	var attrs = {}

	if ("delete" in obj)
		attrs.delete = _.parseBoolean(obj.delete)
	if ("official_interest" in obj)
		attrs.official_interest = _.parseBoolean(obj.official_interest)
	if ("author_interest" in obj)
		attrs.author_interest = _.parseBoolean(obj.author_interest)
	if ("comment_interest" in obj)
		attrs.comment_interest = _.parseBoolean(obj.comment_interest)

	return attrs
}

function* withSubscription(get, req, res, next) {
	var [uuid, token] = get(req)

	req.subscription = yield db.read(sql`
		SELECT * FROM initiative_subscriptions
		WHERE initiative_uuid ${uuid ? sql`= ${uuid}` : sql`IS NULL`}
		AND update_token = ${token}
		AND confirmed_at IS NOT NULL
		LIMIT 1
	`)

	if (req.subscription) return void next()

	return void res.status(404).render("error_page.jsx", {
		title: req.t("SUBSCRIPTION_NOT_FOUND_TITLE"),
		body: req.t("SUBSCRIPTION_NOT_FOUND_BODY")
	})
}

function tokenize(subscription) {
	return Qs.stringify({
		initiative: subscription.initiative_uuid || undefined,
		"update-token": subscription.update_token,
	})
}
