/** @jsx Jsx */
var Jsx = require("j6pack")
var Fragment = Jsx.Fragment
var Page = require("../../page")
var Form = Page.Form
var Flash = Page.Flash
var Config = require("root/config")
var {selected} = require("root/lib/css")
var linkify = require("root/lib/linkify")
var formatDate = require("root/lib/i18n").formatDate
var formatTime = require("root/lib/i18n").formatTime
exports = module.exports = CreatePage
exports.EventForm = EventForm

function CreatePage(attrs) {
	var req = attrs.req
	var initiative = attrs.initiative
	var event = attrs.event
	var message = attrs.message
	var path = req.baseUrl + req.path
	var frozenType = !!(event.id || message)

	return <Page
		page="create-event"
		title={"New Event for " + initiative.title}
		req={req}
	>
		<a href={req.baseUrl} class="admin-back-2">Initiatives</a>
		<a
			href={req.baseUrl + "/" + initiative.uuid}
			class="admin-back"
		>
			{initiative.title}
		</a>

		<h1 class="admin-heading">New Event</h1>
		<Flash flash={req.flash} />

		{message ? <MessageView message={message} /> : null }

		<menu id="event-type-tabs">
			<a
				class={selected(event.type, "text")}
				href={frozenType ? null : path + "?type=text"}
				disabled={frozenType}
			>
				Text
			</a>

			<a
				class={selected(event.type, "media-coverage")}
				href={frozenType ? null : path + "?type=media-coverage"}
				disabled={frozenType}
			>
				Media Coverage
			</a>
		</menu>

		<div id="tab">
			<EventForm
				initiative={initiative}
				event={event}
				req={req}
				submit={message != null}>
				<button class="admin-submit" name="action" value="preview">
					Preview New Event
				</button>
			</EventForm>
		</div>
	</Page>
}

function EventForm(attrs, children) {
	var req = attrs.req
	var initiative = attrs.initiative
	var event = attrs.event
	var submit = attrs.submit

	var path = `${req.baseUrl}/${initiative.uuid}/events`
	if (event.id) path += "/" + event.id

	return <Form
		req={req}
		action={path}
		method={event.id ? "put" : "post"}
		class="admin-form"
	>
		<input type="hidden" name="type" value={event.type} />

		{function() {
			switch (event.type) {
				case "text": return <Fragment>
					<EventTimeView event={event} />

					<label class="admin-label">Title</label>
					<input
						name="title"
						value={event.title}
						required
						autofocus
						class="admin-input"
					/>

					<label class="admin-label">Content</label>
					<textarea
						name="content"
						required
						class="admin-input">
						{event.content}
					</textarea>
				</Fragment>

				case "media-coverage": return <Fragment>
					<EventTimeView event={event} />

					<label class="admin-label">Title</label>
					<input
						name="title"
						value={event.title}
						required
						autofocus
						class="admin-input"
					/>

					<label class="admin-label">Publisher</label>
					<input
						name="publisher"
						value={event.content.publisher}
						required
						class="admin-input"
					/>

					<label class="admin-label">URL</label>
					<input
						name="url"
						value={event.content.url}
						type="url"
						required
						class="admin-input"
					/>
				</Fragment>

				// Don't use the "require" attribute on the summary. This permits
				// clearing it out.
				case "parliament-committee-meeting":
				case "parliament-letter":
				case "parliament-decision": return <Fragment>
					<label class="admin-label">Summary</label>
					<textarea
						name="content[summary]"
						class="admin-input">
						{event.content.summary}
					</textarea>
				</Fragment>

				default: throw new RangeError("Unsupported event type: " + event.type)
			}
		}()}

		{children}

		{submit !== false ? <button
			class="admin-danger-button admin-submit"
			name="action"
			value="create">
			{event.id ? "Update Event" : "Create New Event"}
		</button> : null}
	</Form>
}

function EventTimeView(attrs) {
	var event = attrs.event

	return <Fragment>
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
	</Fragment>
}

function MessageView(attrs) {
	var msg = attrs.message

	return <article class="admin-message-preview">
		<table>
			<tr>
				<th>From</th>
				<td>{Config.email.from}</td>
			</tr>
			<tr>
				<th>Subject</th>
				<td>{msg.title}</td>
			</tr>
		</table>

		<p>{Jsx.html(linkify(msg.text))}</p>
	</article>
}
