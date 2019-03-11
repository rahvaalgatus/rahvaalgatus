/** @jsx Jsx */
var Jsx = require("j6pack")
var Fragment = Jsx.Fragment
var Page = require("../page")
var Form = Page.Form
var FormButton = Page.FormButton
var Flash = Page.Flash
var formatDate = require("root/lib/i18n").formatDate
var linkify = require("root/lib/linkify")

module.exports = function(attrs) {
	var req = attrs.req
	var initiative = attrs.initiative
	var dbInitiative = attrs.dbInitiative
	var subscriberCount = attrs.subscriberCount
	var events = attrs.events
	var status = initiative.status
	var action = `/initiatives/${initiative.id}`
	var pendingSubscriberCount = subscriberCount.all - subscriberCount.confirmed

	return <Page page="initiative" title={initiative.title} req={req}>
		<a href="/initiatives" class="admin-back">Initiatives</a>
		<h1 class="admin-heading">{initiative.title}</h1>

		<Flash flash={req.flash} />

		<table id="initiative-table" class="admin-horizontal-table">
			{initiative.status == "followUp" || initiative.status == "closed" ? <tr>
				<th scope="row">Status</th>
				<td>
					<Form
						req={req}
						id="status-form"
						action={action}
						method="put"
						class="admin-inline-form"
					>
					<select name="status" onchange="this.form.submit()">
						<option value="followUp" selected={status == "followUp"}>
							In Parliament
						</option>
						<option value="closed" selected={status == "closed"}>
							Finished
						</option>
					</select>
					</Form>
				</td>
			</tr> : null}

			<tr>
				<th scope="row">Sent to Parliament</th>
				<td>
					<DateInputForm
						req={req}
						action={action}
						name={"sentToParliamentOn"}
						value={dbInitiative.sent_to_parliament_at}
					/>
				</td>
			</tr>

			<tr>
				<th scope="row">Finished in Parliament</th>
				<td>
					<DateInputForm
						req={req}
						action={action}
						name={"finishedInParliamentOn"}
						value={dbInitiative.finished_in_parliament_at}
					/>
				</td>
			</tr>

			<tr>
				<th scope="row">Subscriber Count</th>
				<td>
					<a
						class="admin-link"
						href={`/initiatives/${initiative.id}/subscriptions`}>
						{subscriberCount.confirmed}
					</a>

					{pendingSubscriberCount > 0 ?
						" and " + pendingSubscriberCount + " pending"
					: null}
				</td>
			</tr>
		</table>

		<div class="events">
			<h2 class="admin-subheading">
				Events <span class="admin-count">({events.length})</span>
			</h2>

			{events.length > 0 ? <table class="admin-table">
				<thead>
					<th>Created On</th>
					<th>Title</th>
					<th class="new-event">
						<a
							href={`/initiatives/${initiative.id}/events/new`}
							class="admin-primary-button new-event-button">
							New Event
						</a>
					</th>
				</thead>

				<tbody>
					{events.map(function(event) {
						var toggleId = `show-event-${event.id}-text`
						var path = `/initiatives/${initiative.id}/events/${event.id}`

						return <tr class="event">
							<td>
								<time datetime={event.createdAt.toJSON()}>
									{formatDate("iso", event.createdAt)}
								</time>
							</td>
							<td>
								<h3>{event.title}</h3>
								<input id={toggleId} hidden type="checkbox" class="text-toggle" />
								<label for={toggleId} class="admin-link">Show text</label>
								<p class="admin-text">{Jsx.html(linkify(event.text))}</p>
							</td>

							<td>
								<a href={path + "/edit"} class="admin-link">Edit</a>
								&nbsp;or&nbsp;

								<FormButton
									req={req}
									action={path}
									name="_method"
									value="delete"
									onclick="return confirm('Sure?')"
									class="admin-link">Delete</FormButton>
							</td>
						</tr>
					})}
				</tbody>
			</table> : null}
		</div>
	</Page>
}

function DateInputForm(attrs) {
	var req = attrs.req
	var action = attrs.action
	var name = attrs.name
	var value = attrs.value
	var toggle = "show-" + name

	return <Fragment>
		{value ? <Fragment>
			<time>{formatDate("iso", value)}</time>
			<br />
		</Fragment> : null}

		<input id={toggle} hidden type="checkbox" class="form-toggle" />

		<span class="form-toggle-buttons">
			{value ? <Fragment>
				<label for={toggle} class="admin-link">Edit</label>
				&nbsp;or&nbsp;

				<FormButton
					req={req}
					action={action}
					name={name}
					value=""
					onclick="return confirm('Sure?')"
					class="admin-link">Remove</FormButton>
			</Fragment> : <label for={toggle} class="admin-link">Set Date</label>}
		</span>

		<Form
			req={req}
			action={action}
			method="put"
			class="form-toggle-form admin-inline-form"
		>
			<input
				type="date"
				name={name}
				value={value && formatDate("iso", value)}
				required
				class="admin-input"
			/>

			<button class="admin-submit">Set Date</button>
			&nbsp;or&nbsp;
			<label for={toggle} class="admin-link">Cancel</label>
		</Form>
	</Fragment>
}
