var _ = require("lodash")
var Router = require("express").Router
var Initiative = require("root/lib/initiative")
var pseudoInt = require("root/lib/crypto").pseudoInt
var next = require("co-next")
var api = require("root/lib/api")
var readInitiativesWithStatus = api.readInitiativesWithStatus
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
		votings: votings,
		processes: processes,
		processed: EMPTY_ARR,
	})
}))

exports.router.get("/donate", function(req, res) {
	var transaction = "json" in req.query ? parseJson(req.query.json) : null
	var amount = transaction ? Number(transaction.amount) : 3 + pseudoInt(7)
	var reference = transaction ? transaction.reference : "donation-" + amount
	res.render("home/donate", {amount: amount, reference: reference})
})

exports.router.get("/about", (_req, res) => res.render("home/about"))
exports.router.get("/donated", (_req, res) => res.render("home/donated"))

function parseJson(json) {
	try { return JSON.parse(json) } catch (ex) { return null }
}
