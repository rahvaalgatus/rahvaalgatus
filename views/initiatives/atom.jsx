/** @jsx Jsx */
var _ = require("root/lib/underscore")
var Jsx = require("j6pack/xml")
var Config = require("root/config")
var t = require("root/lib/i18n").t.bind(null, "et")

var CATEGORIES = {
	admin: "official",
	author: "initiator"
}

module.exports = function(attrs) {
	var req = attrs.req
	var initiative = attrs.initiative
	var topic = attrs.topic
	var events = attrs.events
	var url = Config.url + req.baseUrl + req.url

	var updatedAt = events.length
		? _.last(events).updated_at
		: topic && topic.updatedAt || initiative.created_at

	return <feed xmlns="http://www.w3.org/2005/Atom">
		<id>{url + ".atom"}</id>
		<title>{t("ATOM_INITIATIVE_FEED_TITLE", {title: initiative.title})}</title>
		<link rel="alternate" href={Config.url} />
		<link rel="self" href={url + ".atom"} />
		<updated>{updatedAt.toJSON()}</updated>

		<author>
			<name>{Config.title}</name>
			<uri>{Config.url}</uri>
		</author>

		{_.reject(events, isParliamentEvent).map(function(event) {
			var title
			var content
			var category = CATEGORIES[event.origin]

			switch (event.type) {
				case "sent-to-parliament":
					title = t("INITIATIVE_SENT_TO_PARLIAMENT_TITLE")
					content = t("INITIATIVE_SENT_TO_PARLIAMENT_BODY")
					break

				case "parliament-finished":
					title = t("PARLIAMENT_FINISHED")
					break

				case "signature-milestone":
					title = t("SIGNATURE_MILESTONE_EVENT_TITLE", {
						milestone: event.content
					})
					break

				case "text":
					title = event.title
					content = event.content
					break

				default:
					throw new RangeError("Unsupported event type: " + event.type)
			}

			return <entry>
				<id>{url + "/events/" + event.id}</id>
				<title>{title}</title>
				<published>{event.occurred_at.toJSON()}</published>
				<updated>{event.updated_at.toJSON()}</updated>
				{category ? <category term={category} /> : null}
				{content ? <content type="text">{content}</content> : null}
				</entry>
		})}
	</feed>
}

function isParliamentEvent(event) { return event.origin == "parliament" }
