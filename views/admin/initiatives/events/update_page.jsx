/** @jsx Jsx */
var Jsx = require("j6pack")
var Page = require("../../page")
var {EventForm} = require("./create_page")

module.exports = function(attrs) {
	var {req} = attrs
	var {initiative} = attrs
	var {event} = attrs

	return <Page
		page="update-event"
		title={"Edit Event of " + initiative.title}
		req={req}
	>
		<a href={req.baseUrl + "/initiatives"} class="admin-back-2">Initiatives</a>
		<a
			href={req.baseUrl + "/initiatives/" + initiative.uuid}
			class="admin-back"
		>
			{initiative.title}
		</a>

		<h1 class="admin-heading">Edit Event</h1>
		<EventForm initiative={initiative} event={event} req={req} />
	</Page>
}
