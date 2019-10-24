var _ = require("root/lib/underscore")
var MediaType = require("medium-type")
var Router = require("express").Router
var ResponseTypeMiddeware =
	require("root/lib/middleware/response_type_middleware")
var {searchInitiativesEvents} = require("./initiatives_controller")
var {searchTopics} = require("root/lib/citizenos_db")
var next = require("co-next")
var initiativesDb = require("root/db/initiatives_db")
var sql = require("sqlate")

var RESPONSE_TYPES = [
	"application/atom+xml"
].map(MediaType)

exports.router = Router({mergeParams: true})

exports.router.get("/",
	new ResponseTypeMiddeware(RESPONSE_TYPES),
	next(function*(_req, res) {
	var initiatives = yield initiativesDb.search(sql`SELECT * FROM initiatives`)

	var topics = _.indexBy(yield searchTopics(sql`
		topic.id IN ${sql.in(initiatives.map((i) => i.uuid))}
		AND topic.visibility = 'public'
	`), "id")

	initiatives = initiatives.filter((initiative) => (
		initiative.external ||
		topics[initiative.uuid]
	))

	initiatives.forEach(function(initiative) {
		var topic = topics[initiative.uuid]
		if (topic) initiative.title = topic.title
	})

	res.setHeader("Content-Type", res.contentType)

	res.render("initiative_events/atom.jsx", {
		initiatives: initiatives,
		events: yield searchInitiativesEvents(initiatives)
	})
}))
