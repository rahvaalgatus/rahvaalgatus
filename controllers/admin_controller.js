var _ = require("root/lib/underscore")
var Router = require("express").Router
var redirect = require("root/lib/redirect")
var cosApi = require("root/lib/citizenos_api")
var readInitiativesWithStatus = cosApi.readInitiativesWithStatus
var initiativeSubscriptionsDb = require("root/db/initiative_subscriptions_db")
var next = require("co-next")
var initiativesDb = require("root/db/initiatives_db")
var cosDb = require("root").cosDb
var encode = encodeURIComponent
var concat = Array.prototype.concat.bind(Array.prototype)
var parseCitizenInitiative = cosApi.parseCitizenInitiative
var parseCitizenEvent = cosApi.parseCitizenEvent
var newUuid = require("uuid/v4")
var sqlite = require("root").sqlite
var sql = require("sqlate")
var STATUSES = ["followUp", "closed"]
exports = module.exports = Router()

exports.get("/", redirect(302, "/initiatives"))

exports.get("/initiatives", next(function*(_req, res) {
	var parliamented = yield readInitiativesWithStatus("followUp")
	var closed = yield readInitiativesWithStatus("closed")

	var uuids = concat(parliamented, closed).map((i) => i.id)
	var dbInitiatives = yield initiativesDb.search(uuids, {create: true})
	dbInitiatives = _.indexBy(dbInitiatives, "uuid")

	var subscriberCounts = yield sqlite(sql`
		SELECT initiative_uuid, COUNT(*) as count
		FROM initiative_subscriptions
		WHERE initiative_uuid IN (${uuids})
		AND confirmed_at IS NOT NULL
		GROUP BY initiative_uuid
	`)

	subscriberCounts = _.mapValues(
		_.indexBy(subscriberCounts, "initiative_uuid"),
		(c) => c.count
	)

	res.render("admin/initiatives/index_page.jsx", {
		parliamented: parliamented,
		closed: closed,
		dbInitiatives: dbInitiatives,
		subscriberCounts: subscriberCounts
	})
}))

exports.use("/initiatives/:id", next(function*(req, res, next) {
	var path = `/api/topics/${encode(req.params.id)}?include[]=vote&include[]=event`
	req.initiative = yield cosApi(path).then(getBody).then(parseCitizenInitiative)
	req.dbInitiative = yield initiativesDb.read(req.initiative.id, {create: true})
	res.locals.initiative = req.initiative
	res.locals.dbInitiative = req.dbInitiative
	next()
}))

exports.get("/initiatives/:id", next(function*(req, res) {
	var initiative = req.initiative
	var events = yield readEvents(initiative.id)
	events = events.sort((a, b) => +b.createdAt - +a.createdAt)

	var subscriberCount = yield sqlite(sql`
		SELECT
			COUNT(*) AS "all",
			COALESCE(SUM(CASE WHEN confirmed_at IS NOT NULL THEN 1 ELSE 0 END), 0)
			AS confirmed

		FROM initiative_subscriptions
		WHERE initiative_uuid = ${initiative.id}
	`).then(_.first)

	res.render("admin/initiatives/read_page.jsx", {
		initiative: initiative,
		dbInitiative: req.dbInitiative,
		events: events,
		subscriberCount: subscriberCount
	})
}))

exports.get("/initiatives/:id/subscriptions.:ext?", next(function*(req, res) {
	var initiative = req.initiative

	var subs = yield initiativeSubscriptionsDb.search(sql`
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
	var attrs = parse(req.body)
	var citizenAttrs = parseForCitizen(req.body)

	if (!_.isEmpty(attrs))
		yield initiativesDb.update(req.initiative.id, parse(req.body))
	if (!_.isEmpty(citizenAttrs))
		yield cosDb("Topics").where("id", req.params.id).update(citizenAttrs)

	res.flash("notice", "Initiative updated.")
	res.redirect("/initiatives/" + req.initiative.id)
}))

exports.get("/initiatives/:id/events/new", function(_req, res) {
	res.render("admin/initiatives/events/create_page.jsx", {
		event: {createdAt: new Date, title: "", text: ""}
	})
})

exports.post("/initiatives/:id/events", next(function*(req, res) {
	var event = _.assign(parseEvent(req.body), {
		id: newUuid(),
		topicId: req.initiative.id,
		createdAt: new Date,
		updatedAt: new Date
	})

	yield cosDb("TopicEvents").insert(event)
	res.flash("notice", "Event created.")
	res.redirect("/initiatives/" + req.initiative.id)
}))

exports.get("/initiatives/:id/events/:eventId/edit", next(function*(req, res) {
	res.render("admin/initiatives/events/update_page.jsx", {
		event: yield readEvent(req.params.eventId)
	})
}))

exports.put("/initiatives/:id/events/:eventId", next(function*(req, res) {
	var event = _.assign(parseEvent(req.body), {updatedAt: new Date})
	var query = cosDb("TopicEvents").where("id", req.params.eventId)
	yield query.update(event)

	res.flash("notice", "Event updated.")
	res.redirect("/initiatives/" + req.initiative.id)
}))

exports.delete("/initiatives/:id/events/:eventId", next(function*(req, res) {
	var query = cosDb("TopicEvents").where("id", req.params.eventId)
	yield query.update({deletedAt: new Date})
	res.flash("notice", "Event deleted.")
	res.redirect("/initiatives/" + req.initiative.id)
}))

function parse(obj) {
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

function parseForCitizen(obj) {
	var attrs = {}

	if ("status" in obj && _.contains(STATUSES, obj.status))
		attrs.status = obj.status

	return attrs
}

function* readEvent(id) {
	var event = yield cosDb("TopicEvents").where("id", id).first()
	return parseCitizenEvent(event)
}

function* readEvents(initiativeId) {
	var events = yield cosDb("TopicEvents").where("topicId", initiativeId)
	return events.map(parseCitizenEvent)
}

function parseEvent(obj) {
  var title = obj.createdOn + " " + obj.title
	return {subject: title, text: obj.text}
}

function getBody(res) { return res.body.data }
