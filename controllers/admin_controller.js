var _ = require("root/lib/underscore")
var Router = require("express").Router
var Config = require("root/config")
var HttpError = require("standard-http-error")
var DateFns = require("date-fns")
var Subscription = require("root/lib/subscription")
var Time = require("root/lib/time")
var cosApi = require("root/lib/citizenos_api")
var subscriptionsDb = require("root/db/initiative_subscriptions_db")
var commentsDb = require("root/db/comments_db")
var next = require("co-next")
var searchInitiatives = require("root/lib/citizenos_db").searchInitiatives
var initiativesDb = require("root/db/initiatives_db")
var messagesDb = require("root/db/initiative_messages_db")
var eventsDb = require("root/db/initiative_events_db")
var cosDb = require("root").cosDb
var parseCitizenInitiative = cosApi.parseCitizenInitiative
var sqlite = require("root").sqlite
var sql = require("sqlate")
var t = require("root/lib/i18n").t.bind(null, "et")
var renderEmail = require("root/lib/i18n").email.bind(null, "et")
var EMPTY = Object.prototype
var UPDATEABLE_PHASES = ["sign", "parliament", "government", "done"]
exports = module.exports = Router()
exports.isEditableEvent = isEditableEvent

var PHASE_TO_STATUS = {
	sign: "voting",
	parliament: "followUp",
	government: "followUp",
	done: "followUp"
}

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
	var initiatives = yield initiativesDb.search(sql`SELECT * FROM initiatives`)

	var topics = _.indexBy(yield searchInitiatives(sql`
		initiative.id IN ${sql.tuple(initiatives.map((i) => i.uuid))}
	`), "id")

	initiatives = initiatives.filter((initiative) => (
		initiative.external ||
		topics[initiative.uuid]
	))

	initiatives.forEach(function(initiative) {
		var topic = topics[initiative.uuid]
		if (topic) initiative.title = topic.title
	})

	var subscriberCounts = yield sqlite(sql`
		SELECT initiative_uuid, COUNT(*) as count
		FROM initiative_subscriptions
		WHERE initiative_uuid IN ${sql.tuple(initiatives.map((i) => i.uuid))}
		AND confirmed_at IS NOT NULL
		GROUP BY initiative_uuid
	`)

	subscriberCounts = _.mapValues(
		_.indexBy(subscriberCounts, "initiative_uuid"),
		(c) => c.count
	)

	res.render("admin/initiatives/index_page.jsx", {
		initiatives: initiatives,
		subscriberCounts: subscriberCounts
	})
}))

exports.use("/initiatives/:id", next(function*(req, res, next) {
	var dbInitiative = yield initiativesDb.read(req.params.id)
	if (dbInitiative == null) return void next(new HttpError(404))

	var initiative = yield cosDb.query(sql`
		SELECT * FROM "Topics" WHERE id = ${dbInitiative.uuid}
	`).then(_.first)

	initiative = initiative && parseCitizenInitiative(initiative)

	// Populate initiative's title from CitizenOS until we've found a way to sync
	// them.
	if (initiative) dbInitiative.title = initiative.title

	req.initiative = initiative
	req.dbInitiative = dbInitiative
	res.locals.initiative = initiative
	res.locals.dbInitiative = dbInitiative
	next()
}))

exports.get("/initiatives/:id", next(function*(req, res) {
	var dbInitiative = req.dbInitiative

	var events = yield eventsDb.search(sql`
		SELECT * FROM initiative_events
		WHERE initiative_uuid = ${dbInitiative.uuid}
		ORDER BY "occurred_at" DESC
	`)

	var subscriberCount = yield sqlite(sql`
		SELECT
			COUNT(*) AS "all",
			COALESCE(SUM(CASE WHEN confirmed_at IS NOT NULL THEN 1 ELSE 0 END), 0)
			AS confirmed

		FROM initiative_subscriptions
		WHERE initiative_uuid = ${dbInitiative.uuid}
	`).then(_.first)

	var messages = yield messagesDb.search(sql`
		SELECT * FROM initiative_messages
		WHERE initiative_uuid = ${dbInitiative.uuid}
		ORDER BY created_at DESC
	`)

	res.render("admin/initiatives/read_page.jsx", {
		events: events,
		subscriberCount: subscriberCount,
		messages: messages
	})
}))

exports.get("/initiatives/:id/subscriptions.:ext?", next(function*(req, res) {
	var dbInitiative = req.dbInitiative

	var subs = yield subscriptionsDb.search(sql`
		SELECT * FROM initiative_subscriptions
		WHERE initiative_uuid = ${dbInitiative.uuid}
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
			subscriptions: subs
		})
	}
}))

exports.put("/initiatives/:id", next(function*(req, res) {
	var initiative = req.initiative
	var dbInitiative = req.dbInitiative
	var attrs = parseInitiative(req.body)
	var citizenAttrs = parseInitiativeForCitizen(req.body)

	if (!_.isEmpty(attrs))
		yield initiativesDb.update(dbInitiative.uuid, parseInitiative(req.body))

	// The "closed" status will eventually be brought over to SQLite to an
	// "archived_at" column.
	if (initiative && initiative.status != "closed" && !_.isEmpty(citizenAttrs))
		yield cosDb("Topics").where("id", dbInitiative.uuid).update(citizenAttrs)

	res.flash("notice", "Initiative updated.")
	res.redirect(req.baseUrl + "/initiatives/" + dbInitiative.uuid)
}))

exports.get("/initiatives/:id/events/new", function(_req, res) {
	res.render("admin/initiatives/events/create_page.jsx", {
		event: {occurred_at: new Date, title: "", type: "text", content: ""}
	})
})

exports.post("/initiatives/:id/events", next(function*(req, res) {
	var dbInitiative = req.dbInitiative

	var attrs = _.assign(parseEvent(null, req.body), {
		initiative_uuid: dbInitiative.uuid,
		created_at: new Date,
		updated_at: new Date,
		created_by: req.user.id
	})

	switch (req.body.action) {
		case "preview":
			res.render("admin/initiatives/events/create_page.jsx", {
				event: attrs,
				message: renderEventMessage(dbInitiative, attrs)
			})
			break

		case "create":
			yield eventsDb.create(attrs)

			var message = yield messagesDb.create({
				__proto__: renderEventMessage(dbInitiative, attrs),
				initiative_uuid: dbInitiative.uuid,
				origin: "event",
				created_at: new Date,
				updated_at: new Date,
			})

			yield Subscription.send(
				message,
				yield subscriptionsDb.searchConfirmedByInitiativeIdForOfficial(
					dbInitiative.uuid
				)
			)

			res.flash("notice", "Event created and message sent.")
			res.redirect(req.baseUrl + "/initiatives/" + dbInitiative.uuid)
			break

		default: throw new HttpError(422, "Invalid Action")
	}
}))

exports.use("/initiatives/:id/events/:eventId",
	next(function*(req, _res, next) {
	var event = yield eventsDb.read(req.params.eventId)
	if (event == null) throw new HttpError(404)
	if (!isEditableEvent(event)) throw new HttpError(403, "Not Editable")
	req.event = event
	next()
}))

exports.get("/initiatives/:id/events/:eventId/edit", function(req, res) {
	res.render("admin/initiatives/events/update_page.jsx", {event: req.event})
})

exports.put("/initiatives/:id/events/:eventId", next(function*(req, res) {
	var dbInitiative = req.dbInitiative
	var event = req.event
	var attrs = _.assign(parseEvent(event, req.body), {updated_at: new Date})
	yield eventsDb.update(event, attrs)
	res.flash("notice", "Event updated.")
	res.redirect(req.baseUrl + "/initiatives/" + dbInitiative.uuid)
}))

exports.delete("/initiatives/:id/events/:eventId", next(function*(req, res) {
	var dbInitiative = req.dbInitiative
	yield eventsDb.delete(req.event.id)
	res.flash("notice", "Event deleted.")
	res.redirect(req.baseUrl + "/initiatives/" + dbInitiative.uuid)
}))

exports.get("/initiatives/:id/messages/new", next(function*(req, res) {
	var dbInitiative = req.dbInitiative

	res.render("admin/initiatives/messages/create_page.jsx", {
		message: {
			title: t("DEFAULT_INITIATIVE_SUBSCRIPTION_MESSAGE_TITLE", {
				initiativeTitle: dbInitiative.title,
			}),

			text: renderEmail("DEFAULT_INITIATIVE_SUBSCRIPTION_MESSAGE_BODY", {
				initiativeTitle: dbInitiative.title,
				initiativeUrl: `${Config.url}/initiatives/${dbInitiative.uuid}`
			})
		},

		subscriptions: yield subscriptionsDb.searchConfirmedByInitiativeId(
			dbInitiative.uuid
		)
	})
}))

exports.post("/initiatives/:id/messages", next(function*(req, res) {
	var dbInitiative = req.dbInitiative
	var attrs = req.body

	switch (attrs.action) {
		case "send":
			var message = yield messagesDb.create({
				initiative_uuid: dbInitiative.uuid,
				origin: "message",
				title: attrs.title,
				text: attrs.text,
				created_at: new Date,
				updated_at: new Date,
			})

			yield Subscription.send(
				message,
				yield subscriptionsDb.searchConfirmedByInitiativeId(dbInitiative.uuid)
			)

			res.flash("notice", "Message sent.")
			res.redirect(req.baseUrl + "/initiatives/" + dbInitiative.uuid)
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
					dbInitiative.uuid
				)
			})
			break

		default: throw new HttpError(422, "Invalid Action")
	}
}))

exports.get("/comments", next(function*(_req, res) {
	var comments = yield commentsDb.search(sql`
		SELECT *
		FROM comments
		ORDER BY created_at DESC
		LIMIT 15
	`)

	var usersById = comments.length > 0 ? _.indexBy(yield cosDb.query(sql`
		SELECT id, name, email FROM "Users"
		WHERE id IN ${sql.tuple(comments.map((c) => c.user_uuid))}
	`), "id") : EMPTY

	comments.forEach((comment) => comment.user = usersById[comment.user_uuid])

	res.render("admin/comments/index_page.jsx", {comments: comments})
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

	if ("hasPaperSignatures" in obj)
		attrs.has_paper_signatures = _.parseBoolean(obj.hasPaperSignatures)

	if ("archived" in obj)
		attrs.archived_at = _.parseBoolean(obj.archived) ? new Date : null

	if ("phase" in obj && _.contains(UPDATEABLE_PHASES, obj.phase))
		attrs.phase = obj.phase

	if ("sentToParliamentOn" in obj)
		attrs.sent_to_parliament_at = obj.sentToParliamentOn
			? Time.parseDate(obj.sentToParliamentOn)
			: null

	if ("receivedByParliamentOn" in obj)
		attrs.received_by_parliament_at = obj.receivedByParliamentOn
			? Time.parseDate(obj.receivedByParliamentOn)
			: null

	if ("acceptedByParliamentOn" in obj)
		attrs.accepted_by_parliament_at = obj.acceptedByParliamentOn
			? Time.parseDate(obj.acceptedByParliamentOn)
			: null

	if ("finishedInParliamentOn" in obj)
		attrs.finished_in_parliament_at = obj.finishedInParliamentOn
			? Time.parseDate(obj.finishedInParliamentOn)
			: null

	return attrs
}

function parseInitiativeForCitizen(obj) {
	var attrs = {}

	if ("phase" in obj && _.contains(UPDATEABLE_PHASES, obj.phase))
		attrs.status = PHASE_TO_STATUS[obj.phase]

	return attrs
}

function parseEvent(event, obj) {
	switch (event ? event.type : "text") {
		case "text": return {
			type: "text",
			title: obj.title,
			content: obj.content,
			occurred_at: Time.parseDateTime(
				obj.occurredOn + "T" + obj.occurredAt + ":00"
			)
		}

		case "parliament-committee-meeting": return {
			type: event.type,

			content: _.merge({}, event.content, {
				summary: obj.content.summary || undefined
			})
		}

		default: throw new RangeError("Unsupported event type: " + event.type)
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
			text: _.quoteEmail(event.content),
			initiativeTitle: initiative.title,
			initiativeUrl: `${Config.url}/initiatives/${initiative.uuid}`,
		})
	}
}

function isEditableEvent(event) {
	return (
		event.type == "parliament-committee-meeting" ||
		event.type == "text"
	)
}
