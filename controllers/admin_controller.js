var _ = require("root/lib/underscore")
var Router = require("express").Router
var Config = require("root/config")
var HttpError = require("standard-http-error")
var DateFns = require("date-fns")
var Subscription = require("root/lib/subscription")
var cosApi = require("root/lib/citizenos_api")
var readInitiativesWithStatus = cosApi.readInitiativesWithStatus
var subscriptionsDb = require("root/db/initiative_subscriptions_db")
var next = require("co-next")
var initiativesDb = require("root/db/initiatives_db")
var messagesDb = require("root/db/initiative_messages_db")
var eventsDb = require("root/db/initiative_events_db")
var cosDb = require("root").cosDb
var flatten = Function.apply.bind(Array.prototype.concat, Array.prototype)
var parseCitizenInitiative = cosApi.parseCitizenInitiative
var sqlite = require("root").sqlite
var sql = require("sqlate")
var t = require("root/lib/i18n").t.bind(null, "et")
var renderEmail = require("root/lib/i18n").email.bind(null, "et")
var UPDATEABLE_STATUSES = ["voting", "followUp", "closed"]
exports = module.exports = Router()

exports.use(function(req, _res, next) {
	if (req.user && _.contains(Config.adminUserIds, req.user.id)) next()
	else next(new HttpError(401, "Not an Admin"))
})

exports.get("/", next(function*(_req, res) {
	var signatures = yield cosDb.query(sql`
		WITH signatures AS (
			SELECT DISTINCT ON ("voteId", "userId") *
			FROM "VoteLists"
			WHERE "createdAt" >= ${DateFns.startOfMonth(new Date)}
			ORDER BY "voteId", "userId", "createdAt" DESC
		)

		SELECT COUNT(*) as count FROM signatures
	`).then(_.first)

	var subs = yield subscriptionsDb.search(sql`
		SELECT *
		FROM initiative_subscriptions
		ORDER BY created_at DESC
		LIMIT 15
	`)

	var initiatives = _.indexBy(yield cosDb.query(sql`
		SELECT id, title
		FROM "Topics"
		WHERE id IN ${sql.tuple(_.uniq(subs.map((s) => s.initiative_uuid)))}
	`), "id")

	subs.forEach(function(subscription) {
		subscription.initiative = initiatives[subscription.initiative_uuid]
	})

	res.render("admin/dashboard_page.jsx", {
		subscriptions: subs,
		signatureCount: signatures.count
	})
}))

exports.get("/initiatives", next(function*(_req, res) {
	var initiatives = yield {
		votings: readInitiativesWithStatus("voting"),
		parliamented: yield readInitiativesWithStatus("followUp"),
		closed: yield readInitiativesWithStatus("closed")
	}

	var uuids = flatten(_.values(initiatives)).map((i) => i.id)
	var dbInitiatives = yield initiativesDb.search(uuids, {create: true})
	dbInitiatives = _.indexBy(dbInitiatives, "uuid")

	var subscriberCounts = yield sqlite(sql`
		SELECT initiative_uuid, COUNT(*) as count
		FROM initiative_subscriptions
		WHERE initiative_uuid IN ${sql.tuple(uuids)}
		AND confirmed_at IS NOT NULL
		GROUP BY initiative_uuid
	`)

	subscriberCounts = _.mapValues(
		_.indexBy(subscriberCounts, "initiative_uuid"),
		(c) => c.count
	)

	res.render("admin/initiatives/index_page.jsx", {
		votings: initiatives.votings,
		parliamented: initiatives.parliamented,
		closed: initiatives.closed,
		dbInitiatives: dbInitiatives,
		subscriberCounts: subscriberCounts
	})
}))

exports.use("/initiatives/:id", next(function*(req, res, next) {
	var initiative = yield cosDb.query(sql`
		SELECT * FROM "Topics" WHERE id = ${req.params.id}
	`).then(_.first)

	if (initiative == null) return void next(new HttpError(404))

	initiative = parseCitizenInitiative(initiative)
	req.initiative = initiative
	req.dbInitiative = yield initiativesDb.read(initiative.id, {create: true})

	res.locals.initiative = req.initiative
	res.locals.dbInitiative = req.dbInitiative
	next()
}))

exports.get("/initiatives/:id", next(function*(req, res) {
	var initiative = req.initiative

	var events = yield eventsDb.search(sql`
		SELECT * FROM initiative_events
		WHERE initiative_uuid = ${initiative.id}
		ORDER BY "occurred_at" DESC
	`)

	var subscriberCount = yield sqlite(sql`
		SELECT
			COUNT(*) AS "all",
			COALESCE(SUM(CASE WHEN confirmed_at IS NOT NULL THEN 1 ELSE 0 END), 0)
			AS confirmed

		FROM initiative_subscriptions
		WHERE initiative_uuid = ${initiative.id}
	`).then(_.first)

	var messages = yield messagesDb.search(sql`
		SELECT * FROM initiative_messages
		WHERE initiative_uuid = ${initiative.id}
		ORDER BY created_at DESC
	`)

	res.render("admin/initiatives/read_page.jsx", {
		initiative: initiative,
		dbInitiative: req.dbInitiative,
		events: events,
		subscriberCount: subscriberCount,
		messages: messages
	})
}))

exports.get("/initiatives/:id/subscriptions.:ext?", next(function*(req, res) {
	var initiative = req.initiative

	var subs = yield subscriptionsDb.search(sql`
		SELECT * FROM initiative_subscriptions
		WHERE initiative_uuid = ${initiative.id}
		ORDER BY created_at DESC
	`)

	switch (req.params.ext) {
		case "txt":
			var confirmed = _.parseTrilean(req.query.confirmed)
			if (confirmed != null)
				subs = subs.filter((s) => !!s.confirmed_at == confirmed)

			res.setHeader("Content-Type", "text/plain; charset=utf-8")
			res.end(subs.map((s) => s.email).join("\n"))
			break
			
		default: res.render("admin/initiatives/subscriptions_page.jsx", {
			initiative: initiative,
			dbInitiative: req.dbInitiative,
			subscriptions: subs
		})
	}
}))

exports.put("/initiatives/:id", next(function*(req, res) {
	var attrs = parseInitiative(req.body)
	var citizenAttrs = parseInitiativeForCitizen(req.body)

	if (!_.isEmpty(attrs))
		yield initiativesDb.update(req.initiative.id, parseInitiative(req.body))
	if (!_.isEmpty(citizenAttrs))
		yield cosDb("Topics").where("id", req.params.id).update(citizenAttrs)

	res.flash("notice", "Initiative updated.")
	res.redirect(req.baseUrl + "/initiatives/" + req.initiative.id)
}))

exports.get("/initiatives/:id/events/new", function(_req, res) {
	res.render("admin/initiatives/events/create_page.jsx", {
		event: {occurred_at: new Date, title: "", text: ""}
	})
})

exports.post("/initiatives/:id/events", next(function*(req, res) {
	var initiative = req.initiative

	var attrs = _.assign(parseEvent(req.body), {
		initiative_uuid: req.initiative.id,
		created_at: new Date,
		updated_at: new Date,
		created_by: req.user.id
	})

	switch (req.body.action) {
		case "preview":
			res.render("admin/initiatives/events/create_page.jsx", {
				event: attrs,
				message: renderEventMessage(initiative, attrs)
			})
			break

		case "create":
			yield eventsDb.create(attrs)

			var message = yield messagesDb.create({
				__proto__: renderEventMessage(initiative, attrs),
				initiative_uuid: initiative.id,
				origin: "event",
				created_at: new Date,
				updated_at: new Date,
			})

			yield Subscription.send(
				message,
				yield subscriptionsDb.searchConfirmedByInitiativeId(initiative.id)
			)

			res.flash("notice", "Event created and message sent.")
			res.redirect(req.baseUrl + "/initiatives/" + req.initiative.id)
			break

		default: throw new HttpError(422, "Invalid Action")
	}
}))

exports.use("/initiatives/:id/events/:eventId",
	next(function*(req, _res, next) {
	var event = yield eventsDb.read(req.params.eventId)
	if (event == null) return void next(new HttpError(404))
	req.event = event
	next()
}))

exports.get("/initiatives/:id/events/:eventId/edit", function(req, res) {
	res.render("admin/initiatives/events/update_page.jsx", {event: req.event})
})

exports.put("/initiatives/:id/events/:eventId", next(function*(req, res) {
	var attrs = _.assign(parseEvent(req.body), {updated_at: new Date})
	yield eventsDb.update(req.event.id, attrs)
	res.flash("notice", "Event updated.")
	res.redirect(req.baseUrl + "/initiatives/" + req.initiative.id)
}))

exports.delete("/initiatives/:id/events/:eventId", next(function*(req, res) {
	yield eventsDb.delete(req.event.id)
	res.flash("notice", "Event deleted.")
	res.redirect(req.baseUrl + "/initiatives/" + req.initiative.id)
}))

exports.get("/initiatives/:id/messages/new", next(function*(req, res) {
	var initiative = req.initiative

	res.render("admin/initiatives/messages/create_page.jsx", {
		message: {
			title: t("DEFAULT_INITIATIVE_SUBSCRIPTION_MESSAGE_TITLE", {
				initiativeTitle: initiative.title,
			}),

			text: renderEmail("DEFAULT_INITIATIVE_SUBSCRIPTION_MESSAGE_BODY", {
				initiativeTitle: initiative.title,
				initiativeUrl: `${Config.url}/initiatives/${initiative.id}`
			})
		},

		subscriptions: yield subscriptionsDb.searchConfirmedByInitiativeId(
			initiative.id
		)
	})
}))

exports.post("/initiatives/:id/messages", next(function*(req, res) {
	var initiative = req.initiative
	var attrs = req.body

	switch (attrs.action) {
		case "send":
			var message = yield messagesDb.create({
				initiative_uuid: initiative.id,
				origin: "message",
				title: attrs.title,
				text: attrs.text,
				created_at: new Date,
				updated_at: new Date,
			})

			yield Subscription.send(
				message,
				yield subscriptionsDb.searchConfirmedByInitiativeId(initiative.id)
			)

			res.flash("notice", "Message sent.")
			res.redirect(req.baseUrl + "/initiatives/" + req.initiative.id)
			break

		case "preview":
			res.render("admin/initiatives/messages/create_page.jsx", {
				message: {
					title: attrs.title,
					text: attrs.text,
				},

				preview: {
					title: attrs.title,
					text: attrs.text
				},

				subscriptions: yield subscriptionsDb.searchConfirmedByInitiativeId(
					initiative.id
				)
			})
			break

		default: throw new HttpError(422, "Invalid Action")
	}
}))

exports.get("/subscriptions", next(function*(_req, res) {
	var subscriptions = yield subscriptionsDb.search(sql`
		SELECT *
		FROM initiative_subscriptions
		WHERE initiative_uuid IS NULL
		ORDER BY created_at DESC
	`)

	res.render("admin/subscriptions/index_page.jsx", {
		subscriptions: subscriptions
	})
}))

function parseInitiative(obj) {
	var attrs = {}

	if ("sentToParliamentOn" in obj)
		attrs.sent_to_parliament_at = obj.sentToParliamentOn
			? new Date(obj.sentToParliamentOn)
			: null

	if ("finishedInParliamentOn" in obj)
		attrs.finished_in_parliament_at = obj.finishedInParliamentOn
			? new Date(obj.finishedInParliamentOn)
			: null

	return attrs
}

function parseInitiativeForCitizen(obj) {
	var attrs = {}

	if ("status" in obj && _.contains(UPDATEABLE_STATUSES, obj.status))
		attrs.status = obj.status

	return attrs
}

function parseEvent(obj) {
	return {
		title: obj.title,
		text: obj.text,
		occurred_at: new Date(obj.occurredOn + " " + obj.occurredAt)
	}
}

function renderEventMessage(initiative, event) {
	return {
		title: t("DEFAULT_INITIATIVE_EVENT_MESSAGE_TITLE", {
			title: event.title,
			initiativeTitle: initiative.title,
		}),

		text: renderEmail("DEFAULT_INITIATIVE_EVENT_MESSAGE_BODY", {
			title: event.title,
			text: event.text,
			initiativeTitle: initiative.title,
			initiativeUrl: `${Config.url}/initiatives/${initiative.id}`,
		})
	}
}
