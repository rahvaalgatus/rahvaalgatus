var _ = require("lodash")
var Router = require("express").Router
var isOk = require("root/lib/http").isOk
var catch400 = require("root/lib/fetch").catch.bind(null, 400)
var catch401 = require("root/lib/fetch").catch.bind(null, 401)
var translateCitizenError = require("root/lib/citizen_os").translateError
var next = require("co-next")
var api = require("root/lib/citizen_os")
var EMPTY = Object.prototype
var EMPTY_EVENT = {subject: "", text: ""}

exports.router = Router({mergeParams: true})

exports.router.get("/", next(function*(req, res) {
	var initiative = req.initiative
	var events = yield api(`/api/topics/${initiative.id}/events`)
	events = events.body.data.rows
	events = _.sortBy(events, (event) => new Date(event.createdAt))
	res.render("initiatives/events", {events: events})
}))

exports.router.get("/new", function(req, res) {
	res.render("initiatives/events/create", {attrs: EMPTY_EVENT})
})

exports.router.post("/", next(function*(req, res, next) {
	var initiative = req.initiative
	var token = req.query.token

	// Currently an external or anonymous token requires the endpoint to be
	// separate from when the token is of the user. This will hopefully be
	// unified so endpoints are not dependent on token sources.
	var path = `/api/topics/${initiative.id}/events`
	if (token == null) path = "/api/users/self" + path.slice(4)

	var created = yield req.api(path, {
		method: "POST",
		json: req.body,
		headers: token == null ? EMPTY : {Authorization: "Bearer "+ token}
	}).catch(catch400).catch(catch401)

	if (isOk(created))
		res.redirect(303, req.baseUrl)
	else res.status(422).render("initiatives/events/create", {
		error: translateCitizenError(req.t, created.body),
		attrs: req.body
	})
}))
