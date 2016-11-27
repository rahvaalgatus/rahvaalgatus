var _ = require("lodash")
var Router = require("express").Router
var Config = require("root/config")
var api = require("root/lib/citizen_os")
var readInitiative = api.readInitiative
var next = require("co-next")
var ARR = Array.prototype

exports.router = Router({mergeParams: true})

exports.router.get("/", next(function*(req, res, next) {
	var path = `/api/topics?sourcePartnerId=${Config.apiPartnerId}`
	var initiatives = (yield api(path)).body.data.rows
	initiatives = _.groupBy(initiatives, "status")

	initiatives = yield {
		discussions: initiatives.inProgress || ARR,
		votings: _.map(initiatives.voting || ARR, "id").map(readInitiative),
		processes: _.map(initiatives.followUp || ARR, "id").map(readInitiative)
	}

	res.render("home/index", {
		page: "home",
		discussions: initiatives.discussions,
		votings: initiatives.votings,
		processes: initiatives.processes
	})
}))

exports.router.get("/about", (req, res) => res.render("home/about"))
exports.router.get("/donate", (req, res) => res.render("home/donate"))
