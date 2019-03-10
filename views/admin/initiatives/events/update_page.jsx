/** @jsx Jsx */
var Jsx = require("j6pack")
var Page = require("../../page")
var Flash = Page.Flash
var EventForm = require("./create_page").EventForm

module.exports = function(attrs) {
	var req = attrs.req
	var initiative = attrs.initiative
	var event = attrs.event

	return <Page
		page="update-event"
		title={"Edit Event of " + initiative.title}
		req={req}
	>
		<a href="/initiatives" class="admin-back-2">Initiatives</a>
		<a href={"/initiatives/" + initiative.id} class="admin-back">
			{initiative.title}
		</a>

		<h1 class="admin-heading">Edit Event</h1>
		<Flash flash={req.flash} />
		<EventForm initiative={initiative} event={event} req={req} />
	</Page>
}
