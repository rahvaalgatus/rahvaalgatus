var Router = require("express").Router
var api = require("root/lib/citizen_os")
var next = require("co-next")

exports.router = Router({mergeParams: true})

exports.router.get("/", next(function*(req, res) {
	var initiative = req.initiative
	var events = yield api(`/api/topics/${initiative.id}/events`)
	events = events.body.data.rows

	res.render("initiatives/events", {
		subpage: "events",
		events: events,
	})
}))
