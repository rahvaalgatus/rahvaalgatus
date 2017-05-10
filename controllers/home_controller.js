var _ = require("lodash")
var Router = require("express").Router
var Initiative = require("root/lib/initiative")
var readInitiatives = require("root/lib/citizen_os").readInitiatives
var next = require("co-next")
var EMPTY_ARR = Array.prototype

exports.router = Router({mergeParams: true})

exports.router.get("/", next(function*(_req, res) {
	var initiatives = yield readInitiatives()

	var hasEnded = Initiative.hasDiscussionEnded.bind(null, new Date)
	initiatives.discussions = _.reject(initiatives.discussions, hasEnded)
	var hasFailed = Initiative.hasVoteFailed.bind(null, new Date)
	initiatives.votings = _.reject(initiatives.votings, hasFailed)
	initiatives.finished = EMPTY_ARR

	res.render("home/index", initiatives)
}))

exports.router.get("/about", (_req, res) => res.render("home/about"))
exports.router.get("/donate", (_req, res) => res.render("home/donate"))
exports.router.get("/effective-ideas", (_req, res) => res.render("home/ideas"))

exports.router.get("/effective-ideas/govermental", function(_req, res) {
	res.render("home/ideas-for-gov")
})
