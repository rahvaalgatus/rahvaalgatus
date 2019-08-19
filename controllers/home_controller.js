var _ = require("root/lib/underscore")
var DateFns = require("date-fns")
var Router = require("express").Router
var Config = require("root/config")
var next = require("co-next")
var searchInitiatives = require("root/lib/citizenos_db").searchInitiatives
var countSignaturesByIds = require("root/lib/citizenos_db").countSignaturesByIds
var sql = require("sqlate")
var initiativesDb = require("root/db/initiatives_db")

exports.router = Router({mergeParams: true})

exports.router.get("/", next(function*(_req, res) {
	var initiatives = yield initiativesDb.search(sql`
		SELECT * FROM initiatives WHERE archived_at IS NULL
	`)

	var cutoff = DateFns.addDays(DateFns.startOfDay(new Date), -14)

	var topics = _.indexBy(yield searchInitiatives(sql`
		initiative.id IN ${sql.in(initiatives.map((i) => i.uuid))}
		AND (initiative.status <> 'inProgress' OR initiative."endsAt" > ${cutoff})
		AND initiative.visibility = 'public'
	`), "id")

	initiatives = initiatives.filter((initiative) => (
		initiative.external ||
		topics[initiative.uuid]
	))

	initiatives.forEach(function(initiative) {
		var topic = topics[initiative.uuid]
		if (topic) initiative.title = topic.title
	})

	var signatureCounts = yield countSignaturesByIds(_.keys(topics))

	initiatives = initiatives.filter((initiative) => (
		initiative.external ||
		initiative.phase != "sign" ||
		topics[initiative.uuid].vote.endsAt > cutoff ||
		signatureCounts[initiative.uuid] >= Config.votesRequired
	))

	res.render("home_page.jsx", {
		initiatives: initiatives,
		topics: topics,
		signatureCounts: signatureCounts
	})
}))

exports.router.get("/about", render.bind(null, "home/about_page.jsx"))
exports.router.get("/credits", render.bind(null, "home/credits_page.jsx"))
exports.router.get("/donate", alias.bind(null, "/donations/new"))
exports.router.get("/donated", alias.bind(null, "/donations/created"))

function alias(url, req, _res, next) { req.url = url; next() }
function render(page, _req, res) { res.render(page) }
