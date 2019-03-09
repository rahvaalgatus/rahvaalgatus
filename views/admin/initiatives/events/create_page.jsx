/** @jsx Jsx */
var Jsx = require("j6pack")
var Page = require("../../page")
var Form = Page.Form
var Flash = Page.Flash
var formatDate = require("root/lib/i18n").formatDate
exports = module.exports = CreatePage
exports.EventForm = EventForm

function CreatePage(attrs) {
	var req = attrs.req
	var initiative = attrs.initiative
	var event = attrs.event

	return <Page
		id="create-event"
		title={"New Event for " + initiative.title}
		req={req}
	>
		<a href="/initiatives" class="admin-back-2">Initiatives</a>
		<a href={"/initiatives/" + initiative.id} class="admin-back">
			{initiative.title}
		</a>

		<h1 class="admin-heading">New Event</h1>
		<Flash flash={req.flash} />
		<EventForm initiative={initiative} event={event} req={req} />
	</Page>
}

function EventForm(attrs) {
	var req = attrs.req
	var initiative = attrs.initiative
	var event = attrs.event

	var path = `/initiatives/${initiative.id}/events`
	if (event.id) path += "/" + event.id

	return <Form
		req={req}
		action={path}
		method={event.id ? "put" : "post"}
		class="admin-form"
	>
		<label class="admin-label">Created On</label>
		<input
			type="date"
			name="createdOn"
			value={formatDate("iso", event.createdAt)}
			required class="admin-input"
		/>

		<label class="admin-label">Title</label>
		<input
			name="title"
			value={event.title}
			required
			autofocus
			class="admin-input"
		/>

		<label class="admin-label">Text</label>
		<textarea
			name="text"
			required
			maxlength={10000}
			class="admin-input">
			{event.text}
		</textarea>

		<button class="admin-submit">
			{event.id ? "Update Event" : "Create New Event"}
		</button>
	</Form>
}
