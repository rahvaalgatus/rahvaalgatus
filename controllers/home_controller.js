var _ = require("lodash")
var Router = require("express").Router
var Initiative = require("root/lib/initiative")
var api = require("root/lib/citizen_os")
var next = require("co-next")

exports.router = Router({mergeParams: true})

exports.router.get("/", next(function*(_req, res) {
	var initiatives = yield api.readInitiatives()

	var hasEnded = Initiative.hasDiscussionEnded.bind(null, new Date)
	initiatives.discussions = _.reject(initiatives.discussions, hasEnded)
	var hasFailed = Initiative.hasVoteFailed.bind(null, new Date)
	initiatives.votings = _.reject(initiatives.votings, hasFailed)

	res.render("home/index", initiatives)
}))

exports.router.get("/about", (_req, res) => res.render("home/about"))
exports.router.get("/donate", (_req, res) => res.render("home/donate"))
