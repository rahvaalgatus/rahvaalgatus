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
	var events = attrs.events
	var url = Config.url + req.baseUrl + req.url

	var updatedAt = events.length
		? _.last(events).updated_at
		: initiative.updatedAt

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

		{events.map((event) => <entry>
			<id>{url + "/events/" + event.id}</id>
			<title>{event.title}</title>
			<published>{event.occurred_at.toJSON()}</published>
			<updated>{event.updated_at.toJSON()}</updated>
			<category term={CATEGORIES[event.origin]} />
			<content type="text">{event.text}</content>
		</entry>)}
	</feed>
}
