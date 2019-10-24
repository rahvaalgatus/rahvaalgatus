/** @jsx Jsx */
var _ = require("root/lib/underscore")
var Jsx = require("j6pack/xml")
var Config = require("root/config")
var t = require("root/lib/i18n").t.bind(null, "et")
var {EventEntryView} = require("../initiatives/atom")

module.exports = function(attrs) {
	var req = attrs.req
	var events = attrs.events
	var initiatives = attrs.initiatives
	var initiativesByUuid = _.indexBy(initiatives, "uuid")
	var url = Config.url + req.baseUrl + (req.url == "/" ? "" : req.url)

	var updatedAt = _.max(events.map((ev) => ev.updated_at)) || new Date

	return <feed xmlns="http://www.w3.org/2005/Atom">
		<id>{url}</id>
		<title>{t("ATOM_INITIATIVE_EVENTS_FEED_TITLE")}</title>
		<link rel="self" type="application/atom+xml" href={url + ".atom"} />
		<link rel="alternate" type="text/html" href={Config.url} />
		<updated>{updatedAt.toJSON()}</updated>

		<author>
			<name>{Config.title}</name>
			<uri>{Config.url}</uri>
		</author>

		{events.map(function(event) {
			var initiative = initiativesByUuid[event.initiative_uuid]

			return <EventEntryView
				initiative={initiative}
				initiativeUrl={Config.url + "/initiatives/" + initiative.uuid}
				event={event}
				sourced
			/>
		})}
	</feed>
}
