var _ = require("root/lib/underscore")
var Router = require("express").Router
var Subscription = require("root/lib/subscription")
var HttpError = require("standard-http-error")
var Initiative = require("root/lib/initiative")
var Time = require("root/lib/time")
var Image = require("root/lib/image")
var usersDb = require("root/db/users_db")
var subscriptionsDb = require("root/db/initiative_subscriptions_db")
var imagesDb = require("root/db/initiative_images_db")
var initiativesDb = require("root/db/initiatives_db")
var messagesDb = require("root/db/initiative_messages_db")
var eventsDb = require("root/db/initiative_events_db")
var t = require("root/lib/i18n").t.bind(null, "et")
var renderEmail = require("root/lib/i18n").email.bind(null, "et")
var sql = require("sqlate")
var trim = Function.call.bind(String.prototype.trim)
var next = require("co-next")
var sqlite = require("root").sqlite
var MEGABYTE = Math.pow(2, 20)
exports.isEditableEvent = isEditableEvent

exports.router = Router({mergeParams: true})

exports.router.get("/", next(function*(_req, res) {
	var initiatives = yield initiativesDb.search(sql`
		SELECT * FROM initiatives
		WHERE published_at IS NOT NULL
	`)

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

exports.router.use("/:id", next(function*(req, res, next) {
	var initiative = yield initiativesDb.read(req.params.id)
	if (initiative == null) return void next(new HttpError(404))

	if (!initiative.published_at)
		return void next(new HttpError(403, "Private Initiative"))

	req.initiative = initiative
	res.locals.initiative = initiative
	next()
}))

exports.router.get("/:id", next(function*(req, res) {
	var initiative = req.initiative

	var author = yield usersDb.read(sql`
		SELECT * FROM users WHERE id = ${initiative.user_id}
	`)

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

	var image = yield imagesDb.read(sql`
		SELECT initiative_uuid, type
		FROM initiative_images
		WHERE initiative_uuid = ${initiative.uuid}
	`)

	res.render("admin/initiatives/read_page.jsx", {
		author: author,
		image: image,
		events: events,
		subscriberCount: subscriberCount
	})
}))

exports.router.get("/:id/subscriptions.:ext?", next(function*(req, res) {
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

exports.router.put("/:id", next(function*(req, res) {
	var initiative = req.initiative
	var attrs = parseInitiative(initiative, req.body)
	if (!_.isEmpty(attrs)) yield initiativesDb.update(initiative.uuid, attrs)

	res.flash("notice", "Initiative updated.")
	res.redirect(req.baseUrl + "/" + initiative.uuid)
}))

// NOTE: This is a duplicate of the InitiativeImageController endpoint
// presented to initiative authors. Keeping this around for now, although it's
// better long-term to either extract commonalities or remove the admin's
// ability to edit images. They can't edit much else anyways.
exports.router.put("/:id/image", next(function*(req, res) {
	var initiative = req.initiative
	var image = req.files.image
  if (image == null) throw new HttpError(422, "Image Missing")

	if (image.size > 3 * MEGABYTE)
		throw new HttpError(422, "Image Larger Than 3MiB")

	if (
		!isValidImageType(image.mimetype) ||
		!isValidImageType(Image.identify(image.buffer))
	) throw new HttpError(422, "Invalid Image Format")

	yield imagesDb.delete(initiative.uuid)

	yield imagesDb.create({
		initiative_uuid: initiative.uuid,
		data: image.buffer,
		type: image.mimetype,
		preview: yield Image.resize(1200, 675, image.buffer)
	})

	res.flash("notice", "Image uploaded.")
	res.redirect(req.baseUrl + "/" + initiative.uuid)
}))

exports.router.delete("/:id/image", next(function*(req, res) {
	var initiative = req.initiative
	yield imagesDb.delete(initiative.uuid)
	res.flash("notice", "Image deleted.")
	res.redirect(req.baseUrl + "/" + initiative.uuid)
}))

exports.router.get("/:id/events/new", function(req, res) {
	res.render("admin/initiatives/events/create_page.jsx", {
		event: {
			occurred_at: new Date,
			type: req.query.type || "text",
			title: "",
			content: ""
		}
	})
})

exports.router.post("/:id/events", next(function*(req, res) {
	var initiative = req.initiative

	var attrs = _.assign(parseEvent(null, req.body), {
		initiative_uuid: initiative.uuid,
		user_id: req.user.id,
		created_at: new Date,
		updated_at: new Date
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
				yield subscriptionsDb.searchConfirmedByInitiativeIdForEvent(
					initiative.uuid
				)
			)

			res.flash("notice", "Event created and message sent.")
			res.redirect(req.baseUrl + "/" + initiative.uuid)
			break

		default: throw new HttpError(422, "Invalid Action")
	}
}))

exports.router.use("/:id/events/:eventId", next(function*(req, _res, next) {
	var event = yield eventsDb.read(req.params.eventId)
	if (event == null) throw new HttpError(404)
	if (!isEditableEvent(event)) throw new HttpError(403, "Not Editable")
	req.event = event
	next()
}))

exports.router.get("/:id/events/:eventId/edit", function(req, res) {
	res.render("admin/initiatives/events/update_page.jsx", {event: req.event})
})

exports.router.put("/:id/events/:eventId", next(function*(req, res) {
	var initiative = req.initiative
	var event = req.event
	var attrs = _.assign(parseEvent(event, req.body), {updated_at: new Date})
	yield eventsDb.update(event, attrs)
	res.flash("notice", "Event updated.")
	res.redirect(req.baseUrl + "/" + initiative.uuid)
}))

exports.router.delete("/:id/events/:eventId", next(function*(req, res) {
	var initiative = req.initiative
	yield eventsDb.delete(req.event.id)
	res.flash("notice", "Event deleted.")
	res.redirect(req.baseUrl + "/" + initiative.uuid)
}))

function parseInitiative(initiative, obj) {
	var attrs = {}

	if ("destination" in obj)
		attrs.destination = obj.destination || null

	if ("tags" in obj) attrs.tags = obj.tags.split(",").map(trim)

	if ("hasPaperSignatures" in obj)
		attrs.has_paper_signatures = _.parseBoolean(obj.hasPaperSignatures)

	if ("archived" in obj)
		attrs.archived_at = _.parseBoolean(obj.archived) ? new Date : null

	if ("signing_expired" in obj) attrs.signing_expired_at =
		_.parseBoolean(obj.signing_expired) ? new Date : null

	if (
		"phase" in obj &&
		initiative.phase != "edit" &&
		_.contains(["sign", "parliament", "government", "done"], obj.phase)
	) attrs.phase = obj.phase

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
			? Time.parseIsoDate(obj.sentToParliamentOn)
			: null

	if ("receivedByParliamentOn" in obj)
		attrs.received_by_parliament_at = obj.receivedByParliamentOn
			? Time.parseIsoDate(obj.receivedByParliamentOn)
			: null

	if ("acceptedByParliamentOn" in obj)
		attrs.accepted_by_parliament_at = obj.acceptedByParliamentOn
			? Time.parseIsoDate(obj.acceptedByParliamentOn)
			: null

	if ("finishedInParliamentOn" in obj)
		attrs.finished_in_parliament_at = obj.finishedInParliamentOn
			? Time.parseIsoDate(obj.finishedInParliamentOn)
			: null

	if ("sentToGovernmentOn" in obj)
		attrs.sent_to_government_at = obj.sentToGovernmentOn
			? Time.parseIsoDate(obj.sentToGovernmentOn)
			: null

	if ("finishedInGovernmentOn" in obj)
		attrs.finished_in_government_at = obj.finishedInGovernmentOn
			? Time.parseIsoDate(obj.finishedInGovernmentOn)
			: null

	return attrs
}

function parseEvent(event, obj) {
	switch (event ? event.type : obj.type || "text") {
		case "text": return {
			type: "text",
			title: obj.title,
			content: obj.content,
			occurred_at: parseOccurredAt(obj)
		}

		case "media-coverage": return {
			type: "media-coverage",
			title: obj.title,
			content: {url: obj.url, publisher: obj.publisher},
			occurred_at: parseOccurredAt(obj)
		}

		case "parliament-plenary-meeting":
		case "parliament-committee-meeting":
		case "parliament-letter":
		case "parliament-decision": return {
			type: event.type,

			content: _.merge({}, event.content, {
				summary: obj.content.summary || undefined
			})
		}

		default: throw new RangeError("Unsupported event type: " + event.type)
	}

	function parseOccurredAt(obj) {
		return Time.parseIsoDateTime(obj.occurredOn + "T" + obj.occurredAt + ":00")
	}
}

function renderEventMessage(initiative, event) {
	switch (event.type) {
		case "text": return {
			title: t("EMAIL_INITIATIVE_TEXT_EVENT_MESSAGE_TITLE", {
				title: event.title,
				initiativeTitle: initiative.title,
			}),

			text: renderEmail("EMAIL_INITIATIVE_TEXT_EVENT_MESSAGE_BODY", {
				title: event.title,
				text: _.quoteEmail(event.content),
				initiativeTitle: initiative.title,
				initiativeUrl: Initiative.initiativeUrl(initiative)
			})
		}

		case "media-coverage": return {
			title: t("EMAIL_INITIATIVE_MEDIA_COVERAGE_EVENT_MESSAGE_TITLE", {
				title: event.title,
				initiativeTitle: initiative.title,
			}),

			text: renderEmail("EMAIL_INITIATIVE_MEDIA_COVERAGE_EVENT_MESSAGE_BODY", {
				title: event.title,
				url: event.content.url,
				publisher: event.content.publisher,
				initiativeTitle: initiative.title,
				initiativeUrl: Initiative.initiativeUrl(initiative)
			})
		}

		default: throw new RangeError("Unsupported event type: " + event.type)
	}
}

function isEditableEvent(event) {
	return (
		event.type == "parliament-committee-meeting" ||
		event.type == "parliament-plenary-meeting" ||
		event.type == "parliament-decision" ||
		event.type == "parliament-letter" ||
		event.type == "text"
	)
}

function isValidImageType(type) {
  switch (type) {
    case "image/png":
    case "image/jpeg": return true
    default: return false
  }
}
