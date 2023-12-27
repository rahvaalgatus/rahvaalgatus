var _ = require("root/lib/underscore")
var {Router} = require("express")
var DateFns = require("date-fns")
var HttpError = require("standard-http-error")
var Subscription = require("root/lib/subscription")
var Initiative = require("root/lib/initiative")
var next = require("co-next")
var renderEmail = require("root/lib/i18n").email.bind(null, "et")
var messagesDb = require("root/db/initiative_messages_db")
var eventsDb = require("root/db/initiative_events_db")
var subscriptionsDb = require("root/db/initiative_subscriptions_db")
var sql = require("sqlate")
var EVENT_TYPES = ["text", "media-coverage"]

exports.router = Router({mergeParams: true})

exports.router.get("/new", assertAuthor, rateLimit, function(req, res) {
	var {initiative} = req

	var subscriberCount =
		subscriptionsDb.countConfirmedByInitiativeIdForEvent(initiative.uuid)

	var {type} = req.query
	type = EVENT_TYPES.includes(type) ? type : "text"

	res.render("initiatives/events/create_page.jsx", {
		event: {type: type},
		subscriberCount: subscriberCount
	})
})

exports.router.get("/:id", function(req, res) {
	var {initiative} = req
	res.redirect(Initiative.slugPath(initiative) + "#event-" + req.params.id)
})

exports.router.post("/", assertAuthor, rateLimit, next(function*(req, res) {
	var {initiative} = req
	var message

	var event = eventsDb.create({
		__proto__: parse(req.body),
		initiative_uuid: initiative.uuid,
		created_at: new Date,
		occurred_at: new Date,
		updated_at: new Date,
		user_id: req.user.id,
		origin: "author"
	})

	switch (event.type) {
		case "text": message = messagesDb.create({
			initiative_uuid: initiative.uuid,
			origin: "event",
			created_at: new Date,
			updated_at: new Date,

			title: req.t("EMAIL_INITIATIVE_AUTHOR_TEXT_EVENT_TITLE", {
				title: event.title,
				initiativeTitle: initiative.title,
			}),

			text: renderEmail("EMAIL_INITIATIVE_AUTHOR_TEXT_EVENT_BODY", {
				initiativeTitle: initiative.title,
				initiativeUrl: Initiative.slugUrl(initiative),
				title: event.title,
				text: _.quoteEmail(event.content)
			})
		}); break

		case "media-coverage": message = messagesDb.create({
			initiative_uuid: initiative.uuid,
			origin: "event",
			created_at: new Date,
			updated_at: new Date,

			title: req.t("EMAIL_INITIATIVE_AUTHOR_MEDIA_COVERAGE_EVENT_TITLE", {
				initiativeTitle: initiative.title,
			}),

			text: renderEmail("EMAIL_INITIATIVE_AUTHOR_MEDIA_COVERAGE_EVENT_BODY", {
				initiativeTitle: initiative.title,
				initiativeUrl: Initiative.slugUrl(initiative),
				title: event.title,
				publisher: event.content.publisher,
				url: event.content.url
			})
		}); break
	}

	if (message) yield Subscription.send(
		message,
		subscriptionsDb.searchConfirmedByInitiativeForEvent(initiative)
	)

	res.flash("notice", req.t("INITIATIVE_EVENT_BY_AUTHOR_CREATED"))
	res.redirect(Initiative.slugPath(initiative))
}))

exports.router.use(function(err, req, res, next) {
	if (err instanceof HttpError && err.code == 429) {
		res.statusCode = err.code
		res.statusMessage = err.message

		var minutes = Math.max(
			Math.abs(DateFns.differenceInMinutes(new Date, err.until)),
			1
		)

		res.render("error_page.jsx", {
			title: req.t("INITIATIVE_EVENT_RATE_LIMIT_TITLE", {minutes: minutes}),
			body: req.t("INITIATIVE_EVENT_RATE_LIMIT_BODY", {minutes: minutes})
		})
	}
	else next(err)
})

function assertAuthor(req, _res, next) {
	var {user} = req
	if (user == null) throw new HttpError(401)

	var {initiative} = req

	if (!Initiative.isAuthor(user, initiative))
		throw new HttpError(403, "No Permission to Edit")

	if (initiative.archived_at || initiative.phase == "edit")
		throw new HttpError(403, "Cannot Create Events")

	next()
}

function rateLimit(req, res, next) {
	var {user, initiative} = req

	var events = eventsDb.search(sql`
		SELECT created_at FROM initiative_events
		WHERE initiative_uuid = ${initiative.uuid}
		AND user_id = ${user.id}
		AND created_at > ${DateFns.addMinutes(new Date, -15)}
		ORDER BY created_at ASC
		LIMIT 3
	`)

	var until = events.length < 3
		? null
		: DateFns.addMinutes(events[0].created_at, 15)

	if (until) {
		res.statusCode = 429
		res.statusMessage = "Too Many Events"

		var minutes = Math.max(DateFns.differenceInMinutes(until, new Date), 1)

		res.render("error_page.jsx", {
			title: req.t("INITIATIVE_EVENT_RATE_LIMIT_TITLE", {minutes: minutes}),
			body: req.t("INITIATIVE_EVENT_RATE_LIMIT_BODY", {minutes: minutes})
		})
	}
	else next()
}

// There are plenty of events in production with title lengths of 200–300.
var MAX_TITLE_LENGTH = 400

var validateTextEvent = require("root/lib/json_schema").new({
	type: "object",
	additionalProperties: false,

	properties: {
		type: {const: "text"},
		title: {type: "string", maxLength: MAX_TITLE_LENGTH},

		// The maximum in production as of Sep 8, 2022 is 35758 characters, for
		// a copy of a meeting's proceedings.
		content: {type: "string", maxLength: 40000}
	}
})

var validateMediaCoverageEvent = require("root/lib/json_schema").new({
	type: "object",
	additionalProperties: false,

	properties: {
		type: {const: "media-coverage"},
		title: {type: "string", maxLength: MAX_TITLE_LENGTH},

		content: {
			type: "object",
			additionalProperties: false,

			properties: {
				url: {type: "string", maxLength: 1024},
				publisher: {type: "string", maxLength: 200},
			}
		}
	}
})

exports.TEXT_EVENT_SCHEMA = validateTextEvent.schema
exports.MEDIA_COVERAGE_EVENT_SCHEMA = validateMediaCoverageEvent.schema

function parse(obj) {
	var err, attrs, validate

	switch (obj.type) {
		case "text":
			attrs = {
				title: obj.title,
				type: "text",
				content: String(obj.content)
			}

			validate = validateTextEvent
			break

		case "media-coverage":
			attrs = {
				type: "media-coverage",
				title: obj.title,
				content: {url: String(obj.url), publisher: String(obj.publisher)}
			}

			validate = validateMediaCoverageEvent
			break

		default: throw new HttpError(422, "Invalid Event Type")
	}

	if (err = validate(attrs)) throw new HttpError(422, "Invalid Attributes", {
		attributes: err
	})

	return attrs
}
