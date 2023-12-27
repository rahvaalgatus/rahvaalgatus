/** @jsx Jsx */
var Jsx = require("j6pack")
var Page = require("../../page")
var Config = require("root").config
var {Form} = Page
var {renderEventsEmail} = require("root/lib/subscription")
var linkify = require("root/lib/linkify")
var t = require("root/lib/i18n").t.bind(null, "et")

module.exports = function(attrs) {
	var {req} = attrs
	var {initiative} = attrs
	var {events} = attrs
	var {subscriberCount} = attrs
	var initiativePath = req.baseUrl + "/" + initiative.id
	var notificationsPath = initiativePath + "/events/notifications"

	var email = events.length > 0
		? renderEventsEmail(t, initiative, events)
		: null

	return <Page
		page="new-event-notification"
		title={"New Event Notification for " + initiative.title}
		req={req}
	>
		<a href={req.baseUrl} class="admin-back-2">Initiatives</a>
		<a
			href={req.baseUrl + "/" + initiative.id}
			class="admin-back"
		>
			{initiative.title}
		</a>

		<h1 class="admin-heading">New Event Notification</h1>

		{email ? <div>
			<EmailView email={email} />

			<Form
				req={req}
				action={notificationsPath}
				method="post"
				class="admin-form"
			>
				{events.map((ev) => <input
					type="hidden"
					name="event_ids[]"
					value={ev.id}
				/>)}

				<button class="admin-submit" type="submit">
					Notify
				</button>

				<p class="admin-paragraph">
					<strong>{subscriberCount}</strong> people will be emailed.
				</p>
			</Form>
		</div> : <p>
			No notifiable events found.
		</p>}
	</Page>
}

function EmailView({email}) {
	return <article class="admin-email-preview">
		<table>
			<tr>
				<th>From</th>
				<td>{email.from || Config.email.from}</td>
			</tr>
			<tr>
				<th>Subject</th>
				<td>{email.title}</td>
			</tr>
		</table>

		<p>{Jsx.html(linkify(email.text))}</p>
	</article>
}
