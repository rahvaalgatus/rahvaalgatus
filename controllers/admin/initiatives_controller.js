var _ = require("root/lib/underscore")
var {Router} = require("express")
var Subscription = require("root/lib/subscription")
var HttpError = require("standard-http-error")
var Crypto = require("crypto")
var Time = require("root/lib/time")
var Image = require("root/lib/image")
var usersDb = require("root/db/users_db")
var subscriptionsDb = require("root/db/initiative_subscriptions_db")
var imagesDb = require("root/db/initiative_images_db")
var initiativesDb = require("root/db/initiatives_db")
var filesDb = require("root/db/initiative_files_db")
var eventsDb = require("root/db/initiative_events_db")
var t = require("root/lib/i18n").t.bind(null, "et")
var sql = require("sqlate")
var isEventNotifiable = require("root/lib/event").isNotifiable
var {countUndersignedSignaturesById} = require("root/lib/initiative")
var {countCitizenOsSignaturesById} = require("root/lib/initiative")
var {parseId} = require("root/controllers/initiatives_controller")
var next = require("co-next")
var {sqlite} = require("root")
var trim = Function.call.bind(String.prototype.trim)
var MEGABYTE = Math.pow(2, 20)
exports.isEditableEvent = isEditableEvent

exports.router = Router({mergeParams: true})

exports.router.get("/", function(_req, res) {
	var initiatives = initiativesDb.search(sql`
		SELECT * FROM initiatives
		WHERE published_at IS NOT NULL
	`)

	var subscriberCounts = sqlite(sql`
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
})

exports.router.use("/:id", function(req, res, next) {
	var id = parseId(req.params.id)

	var initiative = initiativesDb.read(sql`
		SELECT * FROM initiatives WHERE ${id == null || typeof id == "string"
			? sql`uuid = ${id}`
			: sql`id = ${id.id}`
		}
	`)

	if (initiative == null) return void next(new HttpError(404))

	if (!initiative.published_at)
		return void next(new HttpError(403, "Private Initiative"))

	req.initiative = initiative
	res.locals.initiative = initiative
	next()
})

exports.router.get("/:id", function(req, res) {
	var {initiative} = req

	var author = usersDb.read(sql`
		SELECT * FROM users WHERE id = ${initiative.user_id}
	`)

	var files = filesDb.search(sql`
		SELECT id, name, title, url, content_type, length(content) AS size
		FROM initiative_files
		WHERE initiative_uuid = ${initiative.uuid}
		AND event_id IS NULL
	`)

	var events = eventsDb.search(sql`
		SELECT * FROM initiative_events
		WHERE initiative_uuid = ${initiative.uuid}
		ORDER BY "occurred_at" DESC
	`)

	var subscriberCount = sqlite(sql`
		SELECT
			COUNT(*) AS "all",
			COALESCE(SUM(CASE WHEN confirmed_at IS NOT NULL THEN 1 ELSE 0 END), 0)
			AS confirmed

		FROM initiative_subscriptions
		WHERE initiative_uuid = ${initiative.uuid}
	`)[0]

	var image = imagesDb.read(sql`
		SELECT initiative_uuid, type
		FROM initiative_images
		WHERE initiative_uuid = ${initiative.uuid}
	`)

	var citizenosSignatureCount = countCitizenOsSignaturesById(initiative.uuid)

	var undersignedSignatureCount =
		countUndersignedSignaturesById(initiative.uuid)

	res.render("admin/initiatives/read_page.jsx", {
		author,
		image,
		files,
		events,
		subscriberCount,

		signatureCounts: {
			undersign: undersignedSignatureCount,
			citizenos: citizenosSignatureCount
		}
	})
})

exports.router.get("/:id/subscriptions.:ext?", function(req, res) {
	var {initiative} = req

	var subs = subscriptionsDb.search(sql`
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
})

exports.router.put("/:id", function(req, res) {
	var {initiative} = req
	var attrs = parseInitiative(initiative, req.body)
	if (!_.isEmpty(attrs)) initiativesDb.update(initiative.id, attrs)

	res.flash("notice", "Initiative updated.")
	res.redirect(req.baseUrl + "/" + initiative.uuid)
})

// NOTE: This is a duplicate of the InitiativeImageController endpoint
// presented to initiative authors. Keeping this around for now, although it's
// better long-term to either extract commonalities or remove the admin's
// ability to edit images. They can't edit much else anyways.
exports.router.put("/:id/image", next(function*(req, res) {
	var {initiative} = req
	var {image} = req.files
  if (image == null) throw new HttpError(422, "Image Missing")

	if (image.size > 3 * MEGABYTE)
		throw new HttpError(422, "Image Larger Than 3MiB")

	if (
		!isValidImageType(image.mimetype) ||
		!isValidImageType(Image.identify(image.buffer))
	) throw new HttpError(422, "Invalid Image Format")

	imagesDb.delete(initiative.id)

	imagesDb.create({
		initiative_uuid: initiative.uuid,
		data: image.buffer,
		type: image.mimetype,
		preview: yield Image.resize(1200, 675, image.buffer)
	})

	res.flash("notice", "Image uploaded.")
	res.redirect(req.baseUrl + "/" + initiative.uuid)
}))

exports.router.delete("/:id/image", function(req, res) {
	var {initiative} = req
	imagesDb.delete(initiative.uuid)
	res.flash("notice", "Image deleted.")
	res.redirect(req.baseUrl + "/" + initiative.uuid)
})

exports.router.get("/:id/events/new", function(req, res) {
	var {initiative} = req

	var subscriberCount =
		subscriptionsDb.countConfirmedByInitiativeIdForEvent(initiative.uuid)

	res.render("admin/initiatives/events/create_page.jsx", {
		event: {
			occurred_at: new Date,
			type: req.query.type || "text",
			title: "",
			content: ""
		},

		subscriberCount
	})
})

exports.router.post("/:id/events/notifications", next(function*(req, res) {
	var {initiative} = req

	var events = searchInitiativeNotifiableEvents(initiative, sql`
		id IN ${sql.in(req.body.event_ids.map(Number))}
	`)

	if (events.length > 0) {
		var subscribers =
			subscriptionsDb.searchConfirmedByInitiativeForEvent(initiative)

		yield Subscription.send(
			Subscription.renderEventsEmail(t, initiative, events),
			subscribers
		)

		eventsDb.execute(sql`
			UPDATE initiative_events
			SET notified_at = ${new Date}
			WHERE id IN ${sql.in(events.map((ev) => ev.id))}
		`)

		res.statusMessage = "Notified"
		res.flash("notice", `Notified ${subscribers.length} people.`)
	}
	else {
		res.statusMessage = "No Events to Notify Of"
		res.flash("error", "No events to notify of.")
	}

	res.redirect(req.baseUrl + "/" + initiative.uuid)
}))

exports.router.get("/:id/events/notifications/new", function(req, res) {
	var {initiative} = req
	var events = searchInitiativeNotifiableEvents(initiative)

	var subscriberCount =
		subscriptionsDb.countConfirmedByInitiativeIdForEvent(initiative.uuid)

	res.render("admin/initiatives/events/notify_page.jsx", {
		events,
		subscriberCount
	})
})

exports.router.post("/:id/events", next(function*(req, res) {
	var {initiative} = req
	var {user} = req

	var attrs = _.assign(parseEvent(null, req.body), {
		initiative_uuid: initiative.uuid,
		user_id: user.id,
		created_at: new Date,
		updated_at: new Date
	})

	var event = eventsDb.create(attrs)

	if (req.files["files[]"]) {
		var fileTitles = req.body.file_titles

		filesDb.create(req.files["files[]"].map((file, i) => ({
			initiative_uuid: initiative.uuid,
			event_id: event.id,
			created_at: new Date,
			created_by_id: user.id,
			updated_at: new Date,
			name: file.originalname,
			title: fileTitles[i] || null,
			content: file.buffer,
			content_type: file.mimetype
		})))
	}

	if (req.body.action == "create-and-notify") {
		var subscribers =
			subscriptionsDb.searchConfirmedByInitiativeForEvent(initiative)

		yield Subscription.send(
			Subscription.renderEventsEmail(t, initiative, [event]),
			subscribers
		)

		eventsDb.update(event, {notified_at: new Date})

		res.flash(
			"notice",
			`Event created and ${subscribers.length} people notified.`
		)
	}
	else res.flash("notice", "Event created.")

	res.redirect(req.baseUrl + "/" + initiative.uuid)
}))

exports.router.use("/:id/events/:eventId", function(req, _res, next) {
	var event = eventsDb.read(req.params.eventId)
	if (event == null) throw new HttpError(404)
	if (!isEditableEvent(event)) throw new HttpError(403, "Not Editable")
	req.event = event
	next()
})

exports.router.get("/:id/events/:eventId/edit", function(req, res) {
	res.render("admin/initiatives/events/update_page.jsx", {event: req.event})
})

exports.router.put("/:id/events/:eventId", function(req, res) {
	var {initiative} = req
	var {event} = req
	var attrs = _.assign(parseEvent(event, req.body), {updated_at: new Date})
	eventsDb.update(event, attrs)
	res.flash("notice", "Event updated.")
	res.redirect(req.baseUrl + "/" + initiative.uuid)
})

exports.router.delete("/:id/events/:eventId", function(req, res) {
	var {initiative} = req
	eventsDb.delete(req.event.id)
	res.flash("notice", "Event deleted.")
	res.redirect(req.baseUrl + "/" + initiative.uuid)
})

function searchInitiativeNotifiableEvents(initiative, filter) {
	return eventsDb.search(sql`
		SELECT * FROM initiative_events
		WHERE initiative_uuid = ${initiative.uuid}
		${filter ? sql`AND ${filter}` : sql``}
		ORDER BY created_at ASC
	`).filter(isEventNotifiable.bind(null, new Date, initiative))
}

function parseInitiative(initiative, obj) {
	var attrs = {}

	if ("destination" in obj) {
		attrs.destination = obj.destination || null

		if (
			initiative.parliament_token &&
			initiative.destination != attrs.destination
		) attrs.parliament_token = Crypto.randomBytes(12)
	}

	if ("tags" in obj) attrs.tags = obj.tags.split(",").map(trim)

	if ("hasPaperSignatures" in obj)
		attrs.has_paper_signatures = _.parseBoolean(obj.hasPaperSignatures)

	if ("archived" in obj)
		attrs.archived_at = _.parseBoolean(obj.archived) ? new Date : null

	if (
		"phase" in obj &&
		initiative.phase != "edit" &&
		_.contains(["sign", "parliament", "government", "done"], obj.phase)
	) attrs.phase = obj.phase

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

	if ("receivedByGovernmentOn" in obj)
		attrs.received_by_government_at = obj.receivedByGovernmentOn
			? Time.parseIsoDate(obj.receivedByGovernmentOn)
			: null

	if ("acceptedByGovernmentOn" in obj)
		attrs.accepted_by_government_at = obj.acceptedByGovernmentOn
			? Time.parseIsoDate(obj.acceptedByGovernmentOn)
			: null

	if ("finishedInGovernmentOn" in obj)
		attrs.finished_in_government_at = obj.finishedInGovernmentOn
			? Time.parseIsoDate(obj.finishedInGovernmentOn)
			: null

	if (
		initiative.external &&
		"external_text_file_id" in obj
	) attrs.external_text_file_id = (
		obj.external_text_file_id && Number(obj.external_text_file_id) || null
	)

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
