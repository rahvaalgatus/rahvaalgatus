var _ = require("root/lib/underscore")
var Router = require("express").Router
var redirect = require("root/lib/redirect")
var cosApi = require("root/lib/citizenos_api")
var readInitiativesWithStatus = cosApi.readInitiativesWithStatus
var next = require("co-next")
var initiativesDb = require("root/db/initiatives_db")
var cosDb = require("root").cosDb
var encode = encodeURIComponent
var concat = Array.prototype.concat.bind(Array.prototype)
var parseCitizenInitiative = cosApi.parseCitizenInitiative
var parseCitizenEvent = cosApi.parseCitizenEvent
var newUuid = require("uuid/v4")
var STATUSES = ["followUp", "closed"]
exports = module.exports = Router()

exports.get("/", redirect(302, "/initiatives"))

exports.get("/initiatives", next(function*(_req, res) {
	var parliamented = yield readInitiativesWithStatus("followUp")
	var closed = yield readInitiativesWithStatus("closed")

	var dbInitiatives = yield initiativesDb.search(
		concat(parliamented, closed).map((i) => i.id)
	)

	res.render("admin/initiatives/index", {
		parliamented: parliamented,
		closed: closed,
		dbInitiatives: _.indexBy(dbInitiatives, "uuid")
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
	var events = yield readEvents(req.initiative.id)
	events = events.sort((a, b) => +b.createdAt - +a.createdAt)

	res.render("admin/initiatives/read", {
		initiative: req.initiative,
		dbInitiative: req.dbInitiative,
		events: events
	})
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
	res.render("admin/initiatives/events/create", {
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
	res.render("admin/initiatives/events/update", {
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
