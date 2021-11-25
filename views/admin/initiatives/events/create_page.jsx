/** @jsx Jsx */
var Jsx = require("j6pack")
var {Fragment} = Jsx
var Page = require("../../page")
var {Form} = Page
var {selected} = require("root/lib/css")
var {formatDate} = require("root/lib/i18n")
var {formatTime} = require("root/lib/i18n")
var {javascript} = require("root/lib/jsx")
exports = module.exports = CreatePage
exports.EventForm = EventForm

function CreatePage(attrs) {
	var {req} = attrs
	var {initiative} = attrs
	var {event} = attrs
	var {subscriberCount} = attrs
	var path = req.baseUrl + req.path
	var frozenType = event.id != null

	return <Page
		page="create-event"
		class="event-page"
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
				subscriberCount={subscriberCount}
				event={event}
				req={req}
			/>
		</div>
	</Page>
}

function EventForm(attrs) {
	var {req} = attrs
	var {initiative} = attrs
	var {event} = attrs
	var {subscriberCount} = attrs

	var path = `${req.baseUrl}/${initiative.uuid}/events`
	if (event.id) path += "/" + event.id

	return <Form
		req={req}
		action={path}
		method={event.id ? "put" : "post"}
		enctype="multipart/form-data"
		id="event-form"
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
				case "parliament-plenary-meeting":
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

		{event.id == null ? <Fragment>
			<label class="admin-label">Failid</label>

			<table id="files" class="admin-form-table">
				<thead><tr>
					<th>Fail</th>
					<th>Pealkiri</th>
					<th />
				</tr></thead>

				<tbody><tr>
					<td><input type="file" name="files[]" required /></td>

					<td class="title-column">
						<input
							type="text"
							class="admin-input"
							name="file_titles[]"
							required
							placeholder="Faili pealkiri"
						/>
					</td>

					<td>
						{event.id == null ? <button
							class="admin-link remove-file-button"
							type="button"
						>
							Eemalda
						</button> : null}
					</td>
				</tr></tbody>

				<tfoot><tr>
					<td colspan="3">
						<button
							id="add-files-button"
							class="admin-white-button"
							type="button"
						>
							Lisa fail
						</button>
					</td>
				</tr></tfoot>
			</table>

			<script>{javascript`
				var button = document.getElementById("add-files-button")
				var tBody = document.getElementById("files").tBodies[0]
				var row = tBody.removeChild(tBody.rows[0])

				button.addEventListener("click", function() {
					tBody.appendChild(row.cloneNode(true))
				})

				tBody.addEventListener("click", function(ev) {
					var el = ev.target

					if (!(
						el.tagName == "BUTTON" &&
						el.classList.contains("remove-file-button")
					)) return

					var row = el.closest("tr")
					row.parentNode.removeChild(row)
				})
			`}</script>
		</Fragment> : null}

		<div class="admin-submits">
			{event.id == null ? <Fragment>
				<button
					class="admin-submit"
					name="action"
					value="create-and-notify">
					Create Event and Notify
				</button>
				<span> or just </span>
				<button
					class="admin-link"
					name="action"
					value="create">
					Create Event
				</button>.
			</Fragment> : <button class="admin-submit">
				Update Event
			</button>}
		</div>

		{event.id == null ? <p class="admin-paragraph subscriber-count">
			<strong>{subscriberCount}</strong> people are subscribed
			to notifications.
		</p> : null}
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
