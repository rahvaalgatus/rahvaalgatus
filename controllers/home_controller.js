var _ = require("root/lib/underscore")
var Router = require("express").Router
var Initiative = require("root/lib/initiative")
var countVotes = Initiative.countSignatures.bind(null, "Yes")
var next = require("co-next")
var searchInitiatives = require("root/lib/citizenos_db").searchInitiatives
var sql = require("sqlate")
var initiativesDb = require("root/db/initiatives_db")

exports.router = Router({mergeParams: true})

exports.router.get("/", next(function*(_req, res) {
	var initiatives = yield searchInitiatives(sql`
		initiative.status IN ('inProgress', 'voting', 'followUp')
		AND (initiative.status <> 'inProgress' OR initiative."endsAt" > ${new Date})
	`)

	var uuids = initiatives.map((i) => i.id)
	var dbInitiatives = yield initiativesDb.search(uuids, {create: true})
	dbInitiatives = _.indexBy(dbInitiatives, "uuid")

	initiatives = _.groupBy(initiatives, "status")

	var votings = _.reject(initiatives.voting || [], (initiative) => (
		Initiative.hasVoteFailed(new Date, initiative, dbInitiatives[initiative.id])
	))

	res.render("home_page.jsx", {
		discussions: _.sortBy(initiatives.inProgress || [], "createdAt").reverse(),
		votings: _.sortBy(votings, countVotes).reverse(),

		processes: _.sortBy(initiatives.followUp || [], function(initiative) {
			var dbInitiative = dbInitiatives[initiative.id]
			return dbInitiative.sent_to_parliament_at || initiative.vote.createdAt
		}).reverse(),

		dbInitiatives: dbInitiatives
	})
}))

exports.router.get("/about", render.bind(null, "home/about_page.jsx"))
exports.router.get("/credits", render.bind(null, "home/credits_page.jsx"))
exports.router.get("/donate", alias.bind(null, "/donations/new"))
exports.router.get("/donated", alias.bind(null, "/donations/created"))

function alias(url, req, _res, next) { req.url = url; next() }
function render(page, _req, res) { res.render(page) }
