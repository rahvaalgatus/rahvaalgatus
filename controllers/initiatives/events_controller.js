var _ = require("root/lib/underscore")
var Config = require("root/config")
var Router = require("express").Router
var DateFns = require("date-fns")
var HttpError = require("standard-http-error")
var Initiative = require("root/lib/initiative")
var Subscription = require("root/lib/subscription")
var next = require("co-next")
var renderEmail = require("root/lib/i18n").email.bind(null, "et")
var messagesDb = require("root/db/initiative_messages_db")
var eventsDb = require("root/db/initiative_events_db")
var subscriptionsDb = require("root/db/initiative_subscriptions_db")
var sql = require("sqlate")
var EMPTY_EVENT = {title: "", content: ""}

exports.router = Router({mergeParams: true})

exports.router.get("/new", next(assertAdmin), next(function*(req, res) {
	var initiative = req.initiative

	var subscriberCount =
		yield subscriptionsDb.countConfirmedByInitiativeIdForAuthor(initiative.id)

	res.render("initiatives/events/create_page.jsx", {
		attrs: EMPTY_EVENT,
		subscriberCount: subscriberCount
	})
}))

exports.router.post("/", next(assertAdmin), next(function*(req, res) {
	var initiative = req.initiative

	var event = yield eventsDb.create({
		__proto__: parseEvent(req.body),
		initiative_uuid: initiative.id,
		created_at: new Date,
		occurred_at: new Date,
		updated_at: new Date,
		created_by: req.user.id,
		origin: "author"
	})

	var message = yield messagesDb.create({
		initiative_uuid: initiative.id,
		origin: "event",
		created_at: new Date,
		updated_at: new Date,

		title: req.t("EMAIL_INITIATIVE_AUTHOR_EVENT_TITLE", {
			title: event.title,
			initiativeTitle: initiative.title,
		}),

		text: renderEmail("EMAIL_INITIATIVE_AUTHOR_EVENT_BODY", {
			initiativeTitle: initiative.title,
			initiativeUrl: `${Config.url}/initiatives/${initiative.id}`,
			title: event.title,
			text: _.quoteEmail(event.content)
		})
	})

	yield Subscription.send(
		message,
		yield subscriptionsDb.searchConfirmedByInitiativeIdForAuthor(initiative.id)
	)

	res.flash("notice", req.t("INITIATIVE_EVENT_BY_AUTHOR_CREATED"))
	res.redirect("/initiatives/" + initiative.id)
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

function* assertAdmin(req, _res, next) {
	if (req.user == null) throw new HttpError(401)

	if (!Initiative.can("admin", req.initiative))
		throw new HttpError(403, "Not an Initiative Admin")
	if (!Initiative.canCreateEvents(req.initiative))
		throw new HttpError(403, "Cannot Create Events")

	var until = yield rateLimit(req.user, req.initiative)
	if (until) throw new HttpError(429, "Too Many Events", {until: until})

	next()
}

function parseEvent(obj) {
	return {
		title: obj.title,
		type: "text",
		content: obj.content
	}
}

function* rateLimit(user, initiative) {
	var events = yield eventsDb.search(sql`
		SELECT created_at FROM initiative_events
		WHERE initiative_uuid = ${initiative.id}
		AND created_by = ${user.id}
		AND created_at > ${DateFns.addMinutes(new Date, -15)}
		ORDER BY created_at ASC
		LIMIT 3
	`)

	return events.length < 3 ? null : DateFns.addMinutes(events[0].created_at, 15)
}
