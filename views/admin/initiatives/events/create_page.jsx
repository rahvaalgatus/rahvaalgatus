/** @jsx Jsx */
var Jsx = require("j6pack")
var Page = require("../../page")
var MessageView = require("../messages/create_page").MessageView
var Form = Page.Form
var Flash = Page.Flash
var formatDate = require("root/lib/i18n").formatDate
var formatTime = require("root/lib/i18n").formatTime
exports = module.exports = CreatePage
exports.EventForm = EventForm

function CreatePage(attrs) {
	var req = attrs.req
	var initiative = attrs.initiative
	var event = attrs.event
	var message = attrs.message

	return <Page
		page="create-event"
		title={"New Event for " + initiative.title}
		req={req}
	>
		<a href={req.baseUrl + "/initiatives"} class="admin-back-2">Initiatives</a>
		<a href={req.baseUrl + "/initiatives/" + initiative.id} class="admin-back">
			{initiative.title}
		</a>

		<h1 class="admin-heading">New Event</h1>
		<Flash flash={req.flash} />
		{message ? <MessageView message={message} /> : null }

		<EventForm
			initiative={initiative}
			event={event}
			req={req}
			submit={message != null}>
			<button class="admin-submit" name="action" value="preview">
				Preview New Event
			</button>
		</EventForm>
	</Page>
}

function EventForm(attrs, children) {
	var req = attrs.req
	var initiative = attrs.initiative
	var event = attrs.event
	var submit = attrs.submit

	var path = `${req.baseUrl}/initiatives/${initiative.id}/events`
	if (event.id) path += "/" + event.id

	return <Form
		req={req}
		action={path}
		method={event.id ? "put" : "post"}
		class="admin-form"
	>
		<label class="admin-label">Occurred At</label>
		<div class="admin-datetime-input">
			<input
				type="date"
				name="occurredOn"
				required
				class="admin-input"
				value={event.occurred_at && formatDate("iso", event.occurred_at)}
			/>

			<input
				type="time"
				name="occurredAt"
				required
				class="admin-input"
				value={event.occurred_at && formatTime("iso", event.occurred_at)}
			/>
		</div>

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
			class="admin-input">
			{event.text}
		</textarea>

		{children}

		{submit !== false ? <button
			class="admin-danger-button"
			name="action"
			value="create">
			{event.id ? "Update Event" : "Create New Event"}
		</button> : null}
	</Form>
}
