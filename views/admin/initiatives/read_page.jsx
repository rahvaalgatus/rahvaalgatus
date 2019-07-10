/** @jsx Jsx */
var _ = require("root/lib/underscore")
var Jsx = require("j6pack")
var Fragment = Jsx.Fragment
var Config = require("root/config")
var Page = require("../page")
var Form = Page.Form
var FormButton = Page.FormButton
var Flash = Page.Flash
var formatDate = require("root/lib/i18n").formatDate
var confirm = require("root/lib/jsx").confirm
var linkify = require("root/lib/linkify")
var UPDATEABLE_PHASES = ["sign", "parliament", "government", "done"]

module.exports = function(attrs) {
	var req = attrs.req
	var initiative = attrs.initiative
	var dbInitiative = attrs.dbInitiative
	var subscriberCount = attrs.subscriberCount
	var initiativePath = `${req.baseUrl}/initiatives/${initiative.id}`
	var events = attrs.events
	var messages = attrs.messages
	var phase = dbInitiative.phase
	var pendingSubscriberCount = subscriberCount.all - subscriberCount.confirmed

	return <Page page="initiative" title={initiative.title} req={req}>
		<a href={req.baseUrl + "/initiatives"} class="admin-back">Initiatives</a>
		<h1 class="admin-heading">{initiative.title}</h1>

		<a
			id="production-link"
			href={Config.url + "/initiatives/" + initiative.id}
			class="admin-link"
		>View on Rahvaalgatus</a>

		<Flash flash={req.flash} />

		<table id="initiative-table" class="admin-horizontal-table">
			<tr>
				<th scope="row">Phase</th>
				<td>
					<Form
						req={req}
						id="phase-form"
						action={initiativePath}
						method="put"
						class="admin-inline-form"
					>
						<select
							name="phase"
							onchange="this.form.submit()"
							disabled={!_.contains(UPDATEABLE_PHASES, phase)}
						>
							<option value="edit" selected={phase == "edit"} disabled>
								Edit
							</option>
							<option value="sign" selected={phase == "sign"}>
								Sign
							</option>
							<option value="parliament" selected={phase == "parliament"}>
								Parliament
							</option>
							<option value="government" selected={phase == "government"}>
								Government
							</option>
							<option value="done" selected={phase == "done"}>
								Follow-Up
							</option>
						</select>
					</Form>
					{" "}
					<FormButton
						req={req}
						action={initiativePath}
						name="archived"
						value={String(!dbInitiative.archived_at)}>
						{dbInitiative.archived_at ? "Unarchive" : "Archive"}
					</FormButton>

					{dbInitiative.archived_at ? <p>
						Archived on {formatDate("iso", dbInitiative.archived_at)}.
					</p> : null}
				</td>
			</tr>

			<tr>
				<th scope="row">Sent to Parliament</th>
				<td>
					<DateInputForm
						req={req}
						action={initiativePath}
						name={"sentToParliamentOn"}
						value={dbInitiative.sent_to_parliament_at}
					/>
				</td>
			</tr>

			<tr>
				<th scope="row">Received by Parliament</th>
				<td>
					<DateInputForm
						req={req}
						action={initiativePath}
						name={"receivedByParliamentOn"}
						value={dbInitiative.received_by_parliament_at}
					/>
				</td>
			</tr>

			<tr>
				<th scope="row">Accepted by Parliament</th>
				<td>
					<DateInputForm
						req={req}
						action={initiativePath}
						name={"acceptedByParliamentOn"}
						value={dbInitiative.accepted_by_parliament_at}
					/>
				</td>
			</tr>

			<tr>
				<th scope="row">Finished in Parliament</th>
				<td>
					<DateInputForm
						req={req}
						action={initiativePath}
						name={"finishedInParliamentOn"}
						value={dbInitiative.finished_in_parliament_at}
					/>
				</td>
			</tr>

			<tr>
				<th scope="row">Has Paper Signatures</th>
				<td>
					<CheckboxForm
						req={req}
						action={initiativePath}
						name={"hasPaperSignatures"}
						checked={dbInitiative.has_paper_signatures}
					/>
				</td>
			</tr>

			<tr>
				<th scope="row">Subscriber Count</th>
				<td>
					<a
						class="admin-link"
						href={`${initiativePath}/subscriptions`}>
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

			<table class="admin-table">
				<thead>
					<th>Occurred On</th>
					<th>Title</th>
					<th class="new-event">
						<a
							href={`${initiativePath}/events/new`}
							class="admin-primary-button new-event-button">
							New Event
						</a>
					</th>
				</thead>

				<tbody>
					{events.map(function(event) {
						var eventPath = `${initiativePath}/events/${event.id}`
						var toggleId = `show-event-${event.id}-text`

						return <tr class="event">
							<td>
								<time datetime={event.occurred_at.toJSON()}>
									{formatDate("iso", event.occurred_at)}
								</time>
							</td>

							<td>
								<h3>{event.title}</h3>
								<input id={toggleId} hidden type="checkbox" class="text-toggle" />
								<label for={toggleId} class="admin-link">Show text</label>
								<p class="admin-text">{Jsx.html(linkify(event.text))}</p>
							</td>

							<td>
								<a href={eventPath + "/edit"} class="admin-link">Edit</a>
								&nbsp;or&nbsp;

								<FormButton
									req={req}
									action={eventPath}
									name="_method"
									value="delete"
									onclick={confirm("Sure?")}
									class="admin-link">Delete</FormButton>
							</td>
						</tr>
					})}
				</tbody>
			</table>
		</div>

		<div class="messages">
			<h2 class="admin-subheading">
				Sent Messages <span class="admin-count">({messages.length})</span>
			</h2>

			<table class="admin-table">
				<thead>
					<th>Sent On</th>
					<th>Title</th>
					<th class="new-message">
						<a
							href={`${initiativePath}/messages/new`}
							class="admin-primary-button new-message-button">
							New Message
						</a>
					</th>
				</thead>

				<tbody>
					{messages.map(function(message) {
						var toggleId = `show-message-${message.id}-text`

						return <tr class="message">
							<td>
								{message.sent_at ? <time datetime={message.sent_at.toJSON()}>
									{formatDate("iso", message.sent_at)}
								</time> : null}
							</td>

							<td colspan="2">
								<h3>{message.title}</h3>
								<input id={toggleId} hidden type="checkbox" class="text-toggle" />
								<label for={toggleId} class="admin-link">Show text</label>
								<p class="admin-text">{Jsx.html(linkify(message.text))}</p>
							</td>
						</tr>
					})}
				</tbody>
			</table>
		</div>
	</Page>
}

function CheckboxForm(attrs) {
	var req = attrs.req
	var action = attrs.action
	var name = attrs.name
	var checked = attrs.checked

	return <Form
		req={req}
		action={action}
		method="put"
		class="admin-inline-form"
	>
		<input type="hidden" name={name} />

		<input
			type="checkbox"
			name={name}
			checked={checked}
			class="admin-input"
			onchange="this.form.submit()"
		/>
	</Form>
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
					onclick={confirm("Sure?")}
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
