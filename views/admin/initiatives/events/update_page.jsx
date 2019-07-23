/** @jsx Jsx */
var Jsx = require("j6pack")
var Page = require("../../page")
var Flash = Page.Flash
var EventForm = require("./create_page").EventForm

module.exports = function(attrs) {
	var req = attrs.req
	var dbInitiative = attrs.dbInitiative
	var event = attrs.event

	return <Page
		page="update-event"
		title={"Edit Event of " + dbInitiative.title}
		req={req}
	>
		<a href={req.baseUrl + "/initiatives"} class="admin-back-2">Initiatives</a>
		<a
			href={req.baseUrl + "/initiatives/" + dbInitiative.uuid}
			class="admin-back"
		>
			{dbInitiative.title}
		</a>

		<h1 class="admin-heading">Edit Event</h1>
		<Flash flash={req.flash} />
		<EventForm dbInitiative={dbInitiative} event={event} req={req} />
	</Page>
}
