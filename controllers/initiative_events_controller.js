var _ = require("root/lib/underscore")
var HttpError = require("standard-http-error")
var MediaType = require("medium-type")
var {Router} = require("express")
var ResponseTypeMiddeware =
	require("root/lib/middleware/response_type_middleware")
var {searchInitiativesEventsForAtom} = require("./initiatives_controller")
var {synthesizeInitiativeEvents} = require("./initiatives_controller")
var {serializeApiInitiative} = require("./initiatives_controller")
var initiativesDb = require("root/db/initiatives_db")
var eventsDb = require("root/db/initiative_events_db")
var renderEventTitle = require("root/lib/event").renderTitle
var sql = require("sqlate")

exports.router = Router({mergeParams: true})

exports.router.get("/",
	new ResponseTypeMiddeware([
		"application/atom+xml",
		"application/vnd.rahvaalgatus.initiative-event+json; v=1",
	].map(MediaType)),
	function(req, res) {
	var initiatives = initiativesDb.search(sql`
		SELECT *
		FROM initiatives AS initiative
		WHERE phase != 'edit'
	`)

	var events
	switch (res.contentType.name) {
		case "application/atom+xml":
			events = searchInitiativesEventsForAtom(initiatives)
			res.setHeader("Content-Type", res.contentType)

			res.render("initiative_events/atom.jsx", {
				initiatives: initiatives,
				events: events
			})
			break

		case "application/vnd.rahvaalgatus.initiative-event+json":
			events = searchInitiativesEventsForApi(initiatives)
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

			var {order} = req.query
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

			var {distinct} = req.query
			switch (distinct || undefined) {
				case "initiativeId":
					apiEvents = _.uniqBy(apiEvents, "initiativeId")
					break

				case undefined: break
				default: throw new HttpError(400, "Invalid Distinct")
			}

			var {limit} = req.query
			switch (limit || undefined) {
				case undefined: break
				default: apiEvents = apiEvents.slice(0, Number(limit))
			}

			res.send(apiEvents)
			break

		default: throw new HttpError(406)
	}
})

function searchInitiativesEventsForApi(initiatives) {
	return synthesizeInitiativeEvents(initiatives, eventsDb.search(sql`
		SELECT
			event.id,
			event.initiative_uuid,
			event.type,
			event.title,
			event.content,
			event.occurred_at,
			user.name AS user_name

		FROM initiative_events AS event
		LEFT JOIN users AS user ON event.user_id = user.id
		WHERE event.initiative_uuid IN ${sql.in(initiatives.map((i) => i.uuid))}
		ORDER BY event.occurred_at ASC
	`))
}

function serializeApiEvent(initiative, event) {
	return {
		id: event.id,
		initiativeId: event.initiative_uuid,
		title: renderEventTitle(initiative, event),
		occurredAt: event.occurred_at
	}
}
