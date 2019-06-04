var Config = require("root/config")
var Router = require("express").Router
var HttpError = require("standard-http-error")
var Initiative = require("root/lib/initiative")
var Subscription = require("root/lib/subscription")
var next = require("co-next")
var renderEmail = require("root/lib/i18n").email.bind(null, "et")
var messagesDb = require("root/db/initiative_messages_db")
var eventsDb = require("root/db/initiative_events_db")
var subscriptionsDb = require("root/db/initiative_subscriptions_db")
var EMPTY_EVENT = {title: "", text: ""}

exports.router = Router({mergeParams: true})

exports.router.use(function(req, _res, next) {
	if (req.user == null)
		return void next(new HttpError(401))

	if (!Initiative.can("admin", req.initiative))
		return void next(new HttpError(403, "Not an Initiative Admin"))
	if (!Initiative.canCreateEvents(req.initiative))
		return void next(new HttpError(403, "Cannot Create Events"))

	next()
})

exports.router.get("/new", next(function*(req, res) {
	var initiative = req.initiative

	var subscriberCount =
		yield subscriptionsDb.countConfirmedByInitiativeId(initiative.id)

	res.render("initiatives/events/create_page.jsx", {
		attrs: EMPTY_EVENT,
		subscriberCount: subscriberCount
	})
}))

exports.router.post("/", next(function*(req, res) {
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
			text: event.text
		})
	})

	yield Subscription.send(
		message,
		yield subscriptionsDb.searchConfirmedByInitiativeId(initiative.id)
	)

	res.flash("notice", req.t("INITIATIVE_EVENT_BY_AUTHOR_CREATED"))
	res.redirect("/initiatives/" + initiative.id)
}))

function parseEvent(obj) {
	return {
		title: obj.title,
		text: obj.text
	}
}
