var _ = require("lodash")
var Router = require("express").Router
var Initiative = require("root/lib/initiative")
var countVotes = Initiative.countSignatures.bind(null, "Yes")
var next = require("co-next")
var cosApi = require("root/lib/citizenos_api")
var readInitiativesWithStatus = cosApi.readInitiativesWithStatus
var EMPTY_ARR = Array.prototype

exports.router = Router({mergeParams: true})

exports.router.get("/", next(function*(_req, res) {
	var initiatives = yield {
		discussions: readInitiativesWithStatus("inProgress"),
		votings: readInitiativesWithStatus("voting"),
		processes: readInitiativesWithStatus("followUp"),
	}

	var hasEnded = Initiative.hasDiscussionEnded.bind(null, new Date)
	var hasFailed = Initiative.hasVoteFailed.bind(null, new Date)
	var discussions = _.reject(initiatives.discussions, hasEnded)
	var votings = _.reject(initiatives.votings, hasFailed)
	var processes = initiatives.processes

	res.render("home/index", {
		discussions: discussions,
		votings: _.sortBy(votings, countVotes).reverse(),
		processes: processes,
		processed: EMPTY_ARR,
	})
}))

exports.router.get("/about", (_req, res) => res.render("home/about"))
exports.router.get("/donate", alias.bind(null, "/donations/new"))
exports.router.get("/donated", alias.bind(null, "/donations/created"))

function alias(url, req, _res, next) { req.url = url; next() }
