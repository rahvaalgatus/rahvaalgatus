var _ = require("root/lib/underscore")
var Router = require("express").Router
var Config = require("root/config")
var HttpError = require("standard-http-error")
var DateFns = require("date-fns")
var Subscription = require("root/lib/subscription")
var Time = require("root/lib/time")
var subscriptionsDb = require("root/db/initiative_subscriptions_db")
var commentsDb = require("root/db/comments_db")
var next = require("co-next")
var searchTopics = require("root/lib/citizenos_db").searchTopics
var initiativesDb = require("root/db/initiatives_db")
var messagesDb = require("root/db/initiative_messages_db")
var eventsDb = require("root/db/initiative_events_db")
var cosDb = require("root").cosDb
var sqlite = require("root").sqlite
var sql = require("sqlate")
var t = require("root/lib/i18n").t.bind(null, "et")
var renderEmail = require("root/lib/i18n").email.bind(null, "et")
var concat = Array.prototype.concat.bind(Array.prototype)
var trim = Function.call.bind(String.prototype.trim)
var EMPTY = Object.prototype
var UPDATEABLE_PHASES = ["sign", "parliament", "government", "done"]
var PARTNER_IDS = concat(Config.apiPartnerId, _.keys(Config.partners))
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

exports.get("/", next(function*(req, res) {
	var from = req.query.from
		? Time.parseDate(req.query.from)
		: DateFns.startOfMonth(new Date)

	var to = req.query.to ? Time.parseDate(req.query.to) : null

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

	var signerCount = yield cosDb.query(sql`
		WITH signatures AS (
			SELECT DISTINCT ON (sig."voteId", sig."userId")
				sig."userId",
				opt.value AS support

			FROM "VoteLists" AS sig
			JOIN "VoteOptions" AS opt ON opt.id = sig."optionId"
			WHERE sig."createdAt" >= ${from}
			${to ? sql`AND sig."createdAt" < ${to}` : sql``}
			ORDER BY sig."voteId", sig."userId", sig."createdAt" DESC
		),

		signers AS (
			SELECT DISTINCT ON ("userId") *
			FROM signatures
			WHERE support = 'Yes'
		)

		SELECT COUNT(*) AS count FROM signers
	`).then(_.first).then((res) => res.count)

	var topicCount = yield cosDb.query(sql`
		SELECT COUNT(*)
		FROM "Topics"
		WHERE "createdAt" >= ${from}
		${to ? sql`AND "createdAt" < ${to}` : sql``}
		AND "deletedAt" IS NULL
		AND "visibility" = 'public'
		AND "sourcePartnerId" IN ${sql.in(PARTNER_IDS)}
	`).then(_.first).then((res) => res.count)

	var externalInitiativesCount = yield initiativesDb.select1(sql`
		SELECT COUNT(*) AS count
		FROM initiatives
		WHERE external
		AND "created_at" >= ${from}
		${to ? sql`AND "created_at" < ${to}` : sql``}
	`).then((res) => res.count)

	var milestones = yield initiativesDb.search(sql`
		SELECT signature_milestones
		FROM initiatives
		WHERE signature_milestones != '{}'
	`).then((rows) => rows.map((row) => row.signature_milestones))

	var successfulCount = _.sum(_.map(milestones, (milestones) => (
		milestones[1000] &&
		milestones[1000] >= from &&
		milestones[1000] < to ? 1 : 0
	)))

	var voteCount = yield cosDb.query(sql`
		SELECT COUNT(*)
		FROM "Topics" AS topic
		JOIN "TopicVotes" AS tv ON tv."topicId" = topic.id
		JOIN "Votes" AS vote ON vote.id = tv."voteId"

		WHERE vote."createdAt" >= ${from}
		${to ? sql`AND vote."createdAt" < ${to}` : sql``}
		AND topic."deletedAt" IS NULL
		AND topic."sourcePartnerId" IN ${sql.in(PARTNER_IDS)}
	`).then(_.first).then((res) => res.count)

	var subscriberCount = yield subscriptionsDb.search(sql`
		WITH emails AS (
			SELECT DISTINCT email
			FROM initiative_subscriptions
			WHERE confirmed_at >= ${from}
			${to ? sql`AND confirmed_at < ${to}` : sql``}
		)

		SELECT COUNT(*) as count FROM emails
	`).then(_.first).then((res) => res.count)

	var lastSubscriptions = yield subscriptionsDb.search(sql`
		SELECT *
		FROM initiative_subscriptions
		ORDER BY created_at DESC
		LIMIT 15
	`)

	var initiatives = _.indexBy(yield cosDb.query(sql`
		SELECT id, title
		FROM "Topics"

		WHERE id IN ${sql.in(_.uniq(lastSubscriptions.map((s) => (
			s.initiative_uuid)
		)))}
	`), "id")

	lastSubscriptions.forEach(function(subscription) {
		subscription.initiative = initiatives[subscription.initiative_uuid]
	})

	res.render("admin/dashboard_page.jsx", {
		from: from,
		to: to,
		lastSubscriptions: lastSubscriptions,
		signatureCount: signatureCount,
		subscriberCount: subscriberCount,
		successfulCount: successfulCount,
		initiativesCount: topicCount,
		externalInitiativesCount: externalInitiativesCount,
		voteCount: voteCount,
		signerCount: signerCount
	})
}))

exports.get("/initiatives", next(function*(_req, res) {
	var initiatives = yield initiativesDb.search(sql`SELECT * FROM initiatives`)

	var topics = _.indexBy(yield searchTopics(sql`
		topic.id IN ${sql.in(initiatives.map((i) => i.uuid))}
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

	var subscriberCounts = yield sqlite(sql`
		SELECT initiative_uuid, COUNT(*) as count
		FROM initiative_subscriptions
		WHERE initiative_uuid IN ${sql.in(initiatives.map((i) => i.uuid))}
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
	var initiative = yield initiativesDb.read(req.params.id)
	if (initiative == null) return void next(new HttpError(404))

	var topic = yield searchTopics(sql`
		topic.id = ${initiative.uuid} AND topic.visibility = 'public'
	`).then(_.first)

	// Populate initiative's title from CitizenOS until we've found a way to sync
	// them.
	if (topic) initiative.title = topic.title

	req.topic = topic
	req.initiative = initiative
	res.locals.topic = topic
	res.locals.initiative = initiative
	next()
}))

exports.get("/initiatives/:id", next(function*(req, res) {
	var initiative = req.initiative

	var events = yield eventsDb.search(sql`
		SELECT * FROM initiative_events
		WHERE initiative_uuid = ${initiative.uuid}
		ORDER BY "occurred_at" DESC
	`)

	var subscriberCount = yield sqlite(sql`
		SELECT
			COUNT(*) AS "all",
			COALESCE(SUM(CASE WHEN confirmed_at IS NOT NULL THEN 1 ELSE 0 END), 0)
			AS confirmed

		FROM initiative_subscriptions
		WHERE initiative_uuid = ${initiative.uuid}
	`).then(_.first)

	var messages = yield messagesDb.search(sql`
		SELECT * FROM initiative_messages
		WHERE initiative_uuid = ${initiative.uuid}
		ORDER BY created_at DESC
	`)

	res.render("admin/initiatives/read_page.jsx", {
		events: events,
		subscriberCount: subscriberCount,
		messages: messages
	})
}))

exports.get("/initiatives/:id/subscriptions.:ext?", next(function*(req, res) {
	var initiative = req.initiative

	var subs = yield subscriptionsDb.search(sql`
		SELECT * FROM initiative_subscriptions
		WHERE initiative_uuid = ${initiative.uuid}
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
	var topic = req.topic
	var initiative = req.initiative
	var attrs = parseInitiative(req.body)
	var topicAttrs = parseInitiativeForTopic(req.body)

	if (!_.isEmpty(attrs))
		yield initiativesDb.update(initiative.uuid, parseInitiative(req.body))

	// The "closed" status will eventually be brought over to SQLite to an
	// "archived_at" column.
	if (topic && topic.status != "closed" && !_.isEmpty(topicAttrs))
		yield cosDb("Topics").where("id", initiative.uuid).update(topicAttrs)

	res.flash("notice", "Initiative updated.")
	res.redirect(req.baseUrl + "/initiatives/" + initiative.uuid)
}))

exports.get("/initiatives/:id/events/new", function(_req, res) {
	res.render("admin/initiatives/events/create_page.jsx", {
		event: {occurred_at: new Date, title: "", type: "text", content: ""}
	})
})

exports.post("/initiatives/:id/events", next(function*(req, res) {
	var initiative = req.initiative

	var attrs = _.assign(parseEvent(null, req.body), {
		initiative_uuid: initiative.uuid,
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
				initiative_uuid: initiative.uuid,
				origin: "event",
				created_at: new Date,
				updated_at: new Date,
			})

			yield Subscription.send(
				message,
				yield subscriptionsDb.searchConfirmedByInitiativeIdForOfficial(
					initiative.uuid
				)
			)

			res.flash("notice", "Event created and message sent.")
			res.redirect(req.baseUrl + "/initiatives/" + initiative.uuid)
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
	var initiative = req.initiative
	var event = req.event
	var attrs = _.assign(parseEvent(event, req.body), {updated_at: new Date})
	yield eventsDb.update(event, attrs)
	res.flash("notice", "Event updated.")
	res.redirect(req.baseUrl + "/initiatives/" + initiative.uuid)
}))

exports.delete("/initiatives/:id/events/:eventId", next(function*(req, res) {
	var initiative = req.initiative
	yield eventsDb.delete(req.event.id)
	res.flash("notice", "Event deleted.")
	res.redirect(req.baseUrl + "/initiatives/" + initiative.uuid)
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
				initiativeUrl: `${Config.url}/initiatives/${initiative.uuid}`
			})
		},

		subscriptions: yield subscriptionsDb.searchConfirmedByInitiativeId(
			initiative.uuid
		)
	})
}))

exports.post("/initiatives/:id/messages", next(function*(req, res) {
	var initiative = req.initiative
	var attrs = req.body

	switch (attrs.action) {
		case "send":
			var message = yield messagesDb.create({
				initiative_uuid: initiative.uuid,
				origin: "message",
				title: attrs.title,
				text: attrs.text,
				created_at: new Date,
				updated_at: new Date,
			})

			yield Subscription.send(
				message,
				yield subscriptionsDb.searchConfirmedByInitiativeId(initiative.uuid)
			)

			res.flash("notice", "Message sent.")
			res.redirect(req.baseUrl + "/initiatives/" + initiative.uuid)
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
					initiative.uuid
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
		WHERE id IN ${sql.in(comments.map((c) => c.user_uuid))}
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

	if ("parliamentCommittee" in obj)
		attrs.parliament_committee = obj.parliamentCommittee

	if ("governmentAgency" in obj)
		attrs.government_agency = obj.governmentAgency

	if ("governmentContact" in obj)
		attrs.government_contact = obj.governmentContact

	if ("governmentContactDetails" in obj)
		attrs.government_contact_details = obj.governmentContactDetails

	if ("governmentDecision" in obj)
		attrs.government_decision = obj.governmentDecision

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

	if ("sentToGovernmentOn" in obj)
		attrs.sent_to_government_at = obj.sentToGovernmentOn
			? Time.parseDate(obj.sentToGovernmentOn)
			: null

	if ("finishedInGovernmentOn" in obj)
		attrs.finished_in_government_at = obj.finishedInGovernmentOn
			? Time.parseDate(obj.finishedInGovernmentOn)
			: null

	return attrs
}

function parseInitiativeForTopic(obj) {
	var attrs = {}

	if ("phase" in obj && _.contains(UPDATEABLE_PHASES, obj.phase))
		attrs.status = PHASE_TO_STATUS[obj.phase]

	if ("tags" in obj) attrs.categories = obj.tags.split(",").map(trim)

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

		case "parliament-committee-meeting":
		case "parliament-letter":
		case "parliament-decision":
			return {
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
		event.type == "parliament-decision" ||
		event.type == "parliament-letter" ||
		event.type == "text"
	)
}
