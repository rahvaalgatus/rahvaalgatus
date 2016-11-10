var _ = require("lodash")
var O = require("oolong")
var Router = require("express").Router
var api = require("root/lib/citizen_os")
var readInitiative = api.readInitiative
var next = require("co-next")

exports.router = Router({mergeParams: true})

exports.router.get("/", next(function*(req, res, next) {
	var initiatives = yield {
		discussions: readInitiatives("inProgress"),
		votings: readInitiatives("voting"),
		processes: readInitiatives("followUp"),
	}
		
	initiatives = O.map(initiatives, (res) => res.body.data.rows)
	var discussions = initiatives.discussions
	var votings = yield _.map(initiatives.votings, "id").map(readInitiative)
	var processes = yield _.map(initiatives.processes, "id").map(readInitiative)

	res.render("home/index", {
		page: "home",
		discussions: discussions,
		votings: votings,
		processes: processes
	})
}))

exports.router.get("/about", (req, res) => res.render("home/about"))
exports.router.get("/support", (req, res) => res.render("home/support"))
	
function readInitiatives(status) {
	return api(`/api/topics?statuses=${status}`)
}
