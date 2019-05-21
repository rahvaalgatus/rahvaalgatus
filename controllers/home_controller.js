var _ = require("root/lib/underscore")
var Router = require("express").Router
var Initiative = require("root/lib/initiative")
var countVotes = Initiative.countSignatures.bind(null, "Yes")
var next = require("co-next")
var cosApi = require("root/lib/citizenos_api")
var readInitiativesWithStatus = cosApi.readInitiativesWithStatus
var flatten = Function.apply.bind(Array.prototype.concat, Array.prototype)
var initiativesDb = require("root/db/initiatives_db")

exports.router = Router({mergeParams: true})

exports.router.get("/", next(function*(_req, res) {
	var initiatives = yield {
		discussions: readInitiativesWithStatus("inProgress"),
		votings: readInitiativesWithStatus("voting"),
		processes: readInitiativesWithStatus("followUp"),
	}

	var uuids = flatten(_.values(initiatives)).map((i) => i.id)
	var dbInitiatives = yield initiativesDb.search(uuids, {create: true})
	dbInitiatives = _.indexBy(dbInitiatives, "uuid")

	var hasEnded = Initiative.hasDiscussionEnded.bind(null, new Date)
	var discussions = _.reject(initiatives.discussions, hasEnded)

	var votings = _.reject(initiatives.votings, (initiative) => (
		Initiative.hasVoteFailed(new Date, initiative, dbInitiatives[initiative.id])
	))

	res.render("home_page.jsx", {
		discussions: _.sortBy(discussions, "createdAt").reverse(),
		votings: _.sortBy(votings, countVotes).reverse(),

		processes: _.sortBy(initiatives.processes, function(initiative) {
			var dbInitiative = dbInitiatives[initiative.id]
			return dbInitiative.sent_to_parliament_at || initiative.vote.createdAt
		}).reverse(),

		dbInitiatives: dbInitiatives
	})
}))

exports.router.get("/about", (_req, res) => res.render("home/about_page.jsx"))
exports.router.get("/donate", alias.bind(null, "/donations/new"))
exports.router.get("/donated", alias.bind(null, "/donations/created"))

function alias(url, req, _res, next) { req.url = url; next() }
