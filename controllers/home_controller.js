var _ = require("lodash")
var Router = require("express").Router
var Config = require("root/config")
var api = require("root/lib/citizen_os")
var next = require("co-next")
var ARR = Array.prototype

exports.router = Router({mergeParams: true})

exports.router.get("/", next(function*(req, res, next) {
	var path = "/api/topics"
	path += `?sourcePartnerId=${Config.apiPartnerId}`
	path += "&include[]=vote"
	path += "&limit=100"
	var initiatives = (yield api(path)).body.data.rows
	initiatives = _.groupBy(initiatives, "status")

	initiatives = yield {
		discussions: initiatives.inProgress || ARR,
		votings: initiatives.voting || ARR,
		processes: initiatives.followUp || ARR,
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
