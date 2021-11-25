var _ = require("root/lib/underscore")
var HttpError = require("standard-http-error")
var MediaType = require("medium-type")
var Router = require("express").Router
var ResponseTypeMiddeware =
	require("root/lib/middleware/response_type_middleware")
var {searchInitiativesEvents} = require("./initiatives_controller")
var {serializeApiInitiative} = require("./initiatives_controller")
var next = require("co-next")
var initiativesDb = require("root/db/initiatives_db")
var renderEventTitle = require("root/lib/event").renderTitle
var sql = require("sqlate")

exports.router = Router({mergeParams: true})

exports.router.get("/",
	new ResponseTypeMiddeware([
		"application/atom+xml",
		"application/vnd.rahvaalgatus.initiative-event+json; v=1",
	].map(MediaType)),
	next(function*(req, res) {
	var initiatives = yield initiativesDb.search(sql`
		SELECT *
		FROM initiatives AS initiative
		WHERE published_at IS NOT NULL
		AND phase != 'edit'
		GROUP BY uuid
		ORDER BY ROWID
	`)

	var events = yield searchInitiativesEvents(initiatives)

	switch (res.contentType.name) {
		case "application/atom+xml":
			res.setHeader("Content-Type", res.contentType)

			res.render("initiative_events/atom.jsx", {
				initiatives: initiatives,
				events: events
			})
			break

		case "application/vnd.rahvaalgatus.initiative-event+json":
			res.setHeader("Content-Type", res.contentType)
			res.setHeader("Access-Control-Allow-Origin", "*")
			var initiativesByUuid = _.indexBy(initiatives, "uuid")

			var apiEvents = events.map(function(event) {
				var initiative = initiativesByUuid[event.initiative_uuid]
				var obj = serializeApiEvent(initiative, event)

				if (req.query.include == "initiative")
					obj.initiative = serializeApiInitiative(initiative)

				return obj
			})

			var order = req.query.order
			switch (order || undefined) {
				case "occurredAt":
				case "+occurredAt":
				case "-occurredAt":
					apiEvents = _.sortBy(apiEvents, order.replace(/^[-+ ]/, ""))
					if (order[0] == "-") apiEvents = _.reverse(apiEvents)
					break

				case undefined: break
				default: throw new HttpError(400, "Invalid Order")
			}

			var distinct = req.query.distinct
			switch (distinct || undefined) {
				case "initiativeId":
					apiEvents = _.uniqBy(apiEvents, "initiativeId")
					break

				case undefined: break
				default: throw new HttpError(400, "Invalid Distinct")
			}

			var limit = req.query.limit
			switch (limit || undefined) {
				case undefined: break
				default: apiEvents = apiEvents.slice(0, Number(limit))
			}

			res.send(apiEvents)
			break

		default: throw new HttpError(406)
	}
}))

function serializeApiEvent(initiative, event) {
	return {
		id: event.id,
		initiativeId: event.initiative_uuid,
		title: renderEventTitle(initiative, event),
		occurredAt: event.occurred_at
	}
}
