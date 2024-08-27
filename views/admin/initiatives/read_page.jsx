/** @jsx Jsx */
var _ = require("root/lib/underscore")
var Qs = require("qs")
var Jsx = require("j6pack")
var Config = require("root").config
var Page = require("../page")
var I18n = require("root/lib/i18n")
var {Form} = Page
var {FormButton} = Page
var {Flash} = Page
var Initiative = require("root/lib/initiative")
var serializeImageUrl = require("root/lib/initiative").imageUrl
var {isEditableEvent} = require("root/controllers/admin/initiatives_controller")
var isEventNotifiable = require("root/lib/event").isNotifiable
var {anonymizeSignaturesReceivedAfterDays} = require("root").config
var {InitiativeDestinationSelectView} =
	require("root/views/initiatives/read_page")
var {confirm} = require("root/lib/jsx")
var linkify = require("root/lib/linkify")
var UPDATEABLE_PHASES = ["sign", "parliament", "government", "done"]
var EXPIRATION_MONTHS = Config.expireSignaturesInMonths

module.exports = function(attrs) {
	var {req} = attrs
	var {t} = req
	var {initiative} = attrs
	var {author} = attrs
	var {image} = attrs
	var {subscriberCount} = attrs
	var initiativePath = `${req.baseUrl}/${initiative.id}`
	var {files} = attrs
	var {events} = attrs
	var {phase} = initiative
	var {signatureCounts} = attrs
	var pendingSubscriberCount = subscriberCount.all - subscriberCount.confirmed

	var expiresOn = initiative.phase == "sign"
		? Initiative.getExpirationDate(initiative)
		: null

	var initiativeUrl = Initiative.url(initiative)

	return <Page page="initiative" title={initiative.title} req={req}>
		<a href={req.baseUrl} class="admin-back">Initiatives</a>
		<h1 class="admin-heading">{initiative.title}</h1>

		<a
			id="production-link"
			href={Initiative.slugUrl(initiative)}
			class="admin-link"
		>
			View on Rahvaalgatus
		</a>

		<Flash flash={req.flash} />

		<table id="initiative-table" class="admin-horizontal-table">
			<tr>
				<th scope="row">Destination</th>
				<td>
					<Form
						req={req}
						id="phase-form"
						action={initiativePath}
						method="put"
						class="admin-inline-form"
					>
						<InitiativeDestinationSelectView
							t={t}
							name="destination"
							initiative={initiative}
							onchange="this.form.submit()"
						/>
					</Form>

					{initiative.parliament_token ? <p>
						Note that changing the destination at this point will invalidate
						the signatures download link.
					</p> : null}
				</td>
			</tr>

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

							<option
								value="sign"
								selected={phase == "sign"}
								disabled={phase == "edit"}
							>
								Sign
							</option>

							<option
								value="parliament"
								selected={phase == "parliament"}
								disabled={phase == "edit"}
							>
								Parliament
							</option>

							<option
								value="government"
								selected={phase == "government"}
								disabled={phase == "edit"}
							>
								Government
							</option>

							<option
								value="done"
								selected={phase == "done"}
								disabled={phase == "edit"}
							>
								Follow-Up
							</option>
						</select>
					</Form>
					{" or "}
					<FormButton
						req={req}
						action={initiativePath}
						name="archived"
						value={String(!initiative.archived_at)}>
						{initiative.archived_at ? "Unarchive" : "Archive"}
					</FormButton>

					{initiative.archived_at ? <p>
						Archived on {I18n.formatDate("iso", initiative.archived_at)}.
					</p> : null}

					<p>
						The follow-up phase is for initiatives that were accepted by either
						the parliament or government. Initiatives that were rejected should
						remain in their respective phase.
					</p>
				</td>
			</tr>

			<tr>
				<th scope="row">Has Paper Signatures</th>
				<td>
					<CheckboxForm
						req={req}
						action={initiativePath}
						name="hasPaperSignatures"
						checked={initiative.has_paper_signatures}
					/>
				</td>
			</tr>

			<tr>
				<th scope="row">Author</th>
				<td>{author ? <a
					href={req.rootUrl + "/users/" + author.id}
					class="admin-link"
				>{author.name}
				</a> : initiative.author_name}</td>
			</tr>

			{initiative.phase == "sign" && EXPIRATION_MONTHS > 0 ? <tr>
				<th scope="row">Signing Expiration</th>
				<td>{initiative.signing_expired_at ? <>
					Expired on {
						I18n.formatDateTime("isoish", initiative.signing_expired_at)
					}.
				</> : <>
					Will expire on {I18n.formatDateTime("isoish", expiresOn)}.
				</>}</td>
			</tr> : null}

			<tr>
				<th scope="row">Signatures Anonymized</th>
				<td>{initiative.signatures_anonymized_at ? "Yes" : "No"}</td>
			</tr>

			{initiative.signature_threshold != null ? <tr>
				<th scope="row">Signature Threshold</th>
				<td>
					<strong>{initiative.signature_threshold}</strong> saved at {
						I18n.formatDateTime("isoish", initiative.signing_expired_at)
					}.
					<br />
				</td>
			</tr> : null}

			{initiative.destination == "parliament" ? <tr>
				<th scope="row">Sent to Parliament</th>
				<td>
					<DateInputForm
						req={req}
						action={initiativePath}
						name="sentToParliamentOn"
						value={initiative.sent_to_parliament_at}
					/>
				</td>
			</tr> : null}

			{initiative.destination == "parliament" ? <tr>
				<th scope="row">
					Received by Parliament<br />

					<small>
						The date when Riigikogu confirmed reception of the initiative and its signatures. Signatures will not be downloadable after the initiative is marked received and will be anonymized {anonymizeSignaturesReceivedAfterDays} days later.
					</small>
				</th>

				<td>
					<DateInputForm
						req={req}
						action={initiativePath}
						name="receivedByParliamentOn"
						value={initiative.received_by_parliament_at}
					/>
				</td>
			</tr> : null}

			{initiative.destination == "parliament" ? <tr>
				<th scope="row">
					Accepted by Parliament<br />

					<small>
						The date when Riigikogu confirmed the signatures and accepted the initiative for deliberation.
					</small>
				</th>

				<td>
					<DateInputForm
						req={req}
						action={initiativePath}
						name="acceptedByParliamentOn"
						value={initiative.accepted_by_parliament_at}
					/>
				</td>
			</tr> : null}

			{initiative.destination == "parliament" ? <tr>
				<th scope="row">Parliament Committees</th>
				<td><ul>{initiative.parliament_committees.map((committee) => <li>
					{committee}
				</li>)}</ul></td>
			</tr> : null}

			{initiative.destination == "parliament" ? <tr>
				<th scope="row">
					Parliament Decision<br />
					<small>Imported from the Riigikogu API.</small>
				</th>
				<td>{initiative.parliament_decision}</td>
			</tr> : null}

			{initiative.destination == "parliament" ? <tr>
				<th scope="row">Finished in Parliament</th>
				<td>
					<DateInputForm
						req={req}
						action={initiativePath}
						name="finishedInParliamentOn"
						value={initiative.finished_in_parliament_at}
					/>
				</td>
			</tr> : null}

			<tr>
				<th scope="row">Sent to Government</th>
				<td>
					<DateInputForm
						req={req}
						action={initiativePath}
						name="sentToGovernmentOn"
						value={initiative.sent_to_government_at}
					/>

					{(
						initiative.parliament_token &&
						initiative.destination != "parliament"
					) ? <p>
						{signatureCounts.undersign > 0 ? <a
							class="admin-link"
							href={`${initiativeUrl}/signatures.asice?` + Qs.stringify({
								"parliament-token": initiative.parliament_token.toString("hex")
							})}
						>
							Download Signatures (ASiC-E)
						</a> : null}

						{signatureCounts.citizenos > 0 ? <><br /><a
							class="admin-link"
							href={`${initiativeUrl}/signatures.zip?` + Qs.stringify({
								type: "citizenos",
								"parliament-token": initiative.parliament_token.toString("hex")
							})}
						>
							Download CitizenOS Signatures (ZIP of ASiC-Es)
						</a></> : null}

						{(
							signatureCounts.undersign > 0 ||
							signatureCounts.citizenos > 0
						) ? <><br /><a
							class="admin-link"
							href={`${initiativeUrl}/signatures.csv?` + Qs.stringify({
								"parliament-token": initiative.parliament_token.toString("hex")
							})}
						>
							Download Signers (CSV)
						</a></> : null}

						<br />
						Signatures are only available for authorized government
						representatives.
					</p> : null}
				</td>
			</tr>

			<tr>
				<th scope="row">
					Received by Government<br />

					<small>
						The date when the government confirmed reception of the initiative and its signatures. Signatures will not be downloadable after the initiative is marked received and will be anonymized {anonymizeSignaturesReceivedAfterDays} days later.
					</small>
				</th>

				<td>
					<DateInputForm
						req={req}
						action={initiativePath}
						name="receivedByGovernmentOn"
						value={initiative.received_by_government_at}
					/>
				</td>
			</tr>

			<tr>
				<th scope="row">
					Accepted by Government<br />

					<small>
						The date when the government confirmed the signatures (unless the initiative was forwarded from the parliament) and accepted the initiative for deliberation.
					</small>
				</th>

				<td>
					<DateInputForm
						req={req}
						action={initiativePath}
						name="acceptedByGovernmentOn"
						value={initiative.accepted_by_government_at}
					/>
				</td>
			</tr>

			<tr>
				<th scope="row">Government Agency</th>
				<td>
					<InputForm
						req={req}
						action={initiativePath}
						name="governmentAgency"
						value={initiative.government_agency}
					/>
				</td>
			</tr>

			<tr>
				<th scope="row">
					Government Contact<br />
					<small>Person's name or job title</small>
				</th>

				<td>
					<InputForm
						req={req}
						action={initiativePath}
						name="governmentContact"
						value={initiative.government_contact}
					/>
				</td>
			</tr>

			<tr>
				<th scope="row">
					Government Contact Details<br />
					<small>Person's email, phone or other contact info.</small>
				</th>
				<td>
					<InputForm
						req={req}
						action={initiativePath}
						name="governmentContactDetails"
						value={initiative.government_contact_details}
					/>
				</td>
			</tr>

			<tr>
				<th scope="row">Government Decision</th>
				<td>
					<InputForm
						req={req}
						action={initiativePath}
						name="governmentDecision"
						value={initiative.government_decision}
					/>
				</td>
			</tr>

			<tr>
				<th scope="row">Finished in Government</th>
				<td>
					<DateInputForm
						req={req}
						action={initiativePath}
						name="finishedInGovernmentOn"
						value={initiative.finished_in_government_at}
					/>
				</td>
			</tr>

			<tr>
				<th scope="row">Tags</th>
				<td>
					<InputForm
						req={req}
						action={initiativePath}
						name="tags"
						value={initiative.tags.join(", ")}
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

			<tr>
				<th scope="row">Image</th>
				<td>
					<ImageForm
						req={req}
						name="image"
						action={initiativePath + "/image"}
						value={image ? serializeImageUrl(initiative, image) : null}
					/>
				</td>
			</tr>

			{initiative.external ? <tr>
				<th scope="row">External Text File</th>
				<td>
					<Form
						req={req}
						action={initiativePath}
						method="put"
						class="admin-inline-form"
					>
						<select name="external_text_file_id">{files.map((file) => <option
							value={file.id}
							selected={initiative.external_text_file_id == file.id}
						>
							{file.name}
						</option>)}</select>
						{" "}
						<button class="admin-submit">Set</button>
					</Form>
				</td>
			</tr> : null}
		</table>

		{files.length > 0 ? <div class="files">
			<h2 class="admin-subheading">
				Files <span class="admin-count">({files.length})</span>
			</h2>

			<table class="admin-table">
				<thead>
					<th>Id</th>
					<th>Title</th>
					<th>Name</th>
					<th>Content Type</th>
					<th>Size</th>
					<th>URL</th>
				</thead>

				<tbody>{files.map(function(file) {
					return <tr>
						<td>{file.id}</td>
						<td>{file.title}</td>

						<td>
							<a
								href={initiativeUrl + "/files/" + file.id}
								class="admin-link"
							>
								{file.name}
							</a>
						</td>

						<td>{file.content_type}</td>
						<td>{I18n.formatBytes(file.size)}</td>

						<td>
							<a href={file.url} class="admin-link">
								Riigikogu dokumendiregistris
							</a>
						</td>
					</tr>
				})}</tbody>
			</table>
		</div> : null}

		<div class="events">
			<h2 class="admin-subheading">
				Events <span class="admin-count">({events.length})</span>
			</h2>

			{events.some(isEventNotifiable.bind(null, new Date, initiative)) ? <div
				id="notify-events"
			>
				There are some events not yet notified of.
				{" "}
				<a
					class="admin-link"
					href={initiativePath + "/events/notifications/new"}
				>
					Preview Notifications
				</a>
			</div> : null}

			<table class="admin-table">
				<thead>
					<th>Occurred On</th>
					<th>Type</th>
					<th>Content</th>
					<th class="new-event">
						<a
							href={`${initiativePath}/events/new`}
							class="admin-primary-button new-event-button">
							New Event
						</a>
					</th>
				</thead>

				<tbody>{events.map(function(event) {
					var eventPath = `${initiativePath}/events/${event.id}`
					var toggleId = `show-event-${event.id}-text`
					var {title} = event
					var content, meeting

					switch (event.type) {
						case "text":
							content = <p class="text">{Jsx.html(linkify(event.content))}</p>
							break

						case "parliament-plenary-meeting":
							meeting = event.content

							content = <table class="admin-horizontal-table">
								{meeting.summary ? <tr>
									<th scope="row">Summary</th>
									<td>{Jsx.html(linkify(meeting.summary))}</td>
								</tr> : null}
							</table>
							break

						case "parliament-committee-meeting":
							meeting = event.content

							content = <table class="admin-horizontal-table">
								<tr>
									<th scope="row">Comittee</th>
									<td>{meeting.committee}</td>
								</tr>

								{meeting.decision ? <tr>
									<th scope="row">Decision</th>
									<td>{meeting.decision}</td>
								</tr> : null}

								{meeting.invitees ? <tr>
									<th scope="row">Invitees</th>
									<td>{meeting.invitees}</td>
								</tr> : null}

								{meeting.summary ? <tr>
									<th scope="row">Summary</th>
									<td>{Jsx.html(linkify(meeting.summary))}</td>
								</tr> : null}
							</table>
							break

						case "parliament-letter":
							var letter = event.content

							content = <table class="admin-horizontal-table">
								<tr>
									<th scope="row">Medium</th>
									<td>{letter.medium}</td>
								</tr>

								<tr>
									<th scope="row">Direction</th>
									<td>{letter.direction}</td>
								</tr>

								<tr>
									<th scope="row">Title</th>
									<td>{letter.title}</td>
								</tr>

								{letter.from ? <tr>
									<th scope="row">From</th>
									<td>{letter.from}</td>
								</tr> : null}

								{letter.to ? <tr>
									<th scope="row">To</th>
									<td>{letter.to}</td>
								</tr> : null}

								{letter.summary ? <tr>
									<th scope="row">Summary</th>
									<td>{Jsx.html(linkify(letter.summary))}</td>
								</tr> : null}
							</table>
							break

						case "parliament-decision":
							var {summary} = event.content
							if (summary)
								content = <p class="text">{Jsx.html(linkify(summary))}</p>
							break
					}

					return <tr class="event">
						<td>
							<time datetime={event.occurred_at.toJSON()}>
								{I18n.formatDateTime("isoish", event.occurred_at)}
							</time>

							{event.notified_at == null ? <>
								<br />
								<strong>Subscribers not yet notified.</strong>
							</> : null}
						</td>

						<td>{event.type}</td>

						<td>
							<h3>{title}</h3>

							<input
								id={toggleId}
								checked={event.type != "text"}
								hidden
								type="checkbox"
								class="text-toggle"
							/>

							<label for={toggleId} class="admin-link">Show</label>

							{content}
						</td>

						{isEditableEvent(event) ? <td>
							<a href={eventPath + "/edit"} class="admin-link">Edit</a>
							&nbsp;or&nbsp;

							<FormButton
								req={req}
								action={eventPath}
								name="_method"
								value="delete"
								onclick={confirm("Sure?")}
								class="admin-link">Delete</FormButton>
						</td> : <td />}
					</tr>
				})}</tbody>
			</table>
		</div>
	</Page>
}

function CheckboxForm(attrs) {
	var {req} = attrs
	var {action} = attrs
	var {name} = attrs
	var {checked} = attrs

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

function InputForm(attrs) {
	var {req} = attrs
	var {action} = attrs
	var {type} = attrs
	var {name} = attrs
	var {value} = attrs
	var label = attrs.label || "Set"
	var toggle = "show-" + name

	return <>
		{value ? <>{value}<br /></> : null}
		<input id={toggle} hidden type="checkbox" class="form-toggle" />

		<span class="form-toggle-buttons">
			{value ? <>
				<label for={toggle} class="admin-link">Edit</label>
				&nbsp;or&nbsp;

				<FormButton
					req={req}
					action={action}
					name={name}
					value=""
					onclick={confirm("Sure?")}
					class="admin-link">Remove</FormButton>
			</> : <label for={toggle} class="admin-link">{label}</label>}
		</span>

		<Form
			req={req}
			action={action}
			method="put"
			class="form-toggle-form admin-inline-form"
		>
			<input
				type={type}
				name={name}
				value={value}
				required
				class="admin-input"
			/>

			<button class="admin-submit">{label}</button>
			&nbsp;or&nbsp;
			<label for={toggle} class="admin-link">Cancel</label>
		</Form>
	</>
}

function DateInputForm(attrs) {
	return <InputForm
		{...attrs}
		type="date"
		label="Set Date"
		value={attrs.value && I18n.formatDate("iso", attrs.value)}
	/>
}

function ImageForm(attrs) {
	var {req} = attrs
	var {action} = attrs
	var {name} = attrs
	var {value} = attrs
	var toggle = "show-" + name

	return <>
		{value ? <>
			<img width="300" src={value} />
			<br />
		</> : null}

		<input id={toggle} hidden type="checkbox" class="form-toggle" />

		<span class="form-toggle-buttons">
			{value ? <>
				<label for={toggle} class="admin-link">Replace</label>
				&nbsp;or&nbsp;

				<FormButton
					req={req}
					action={action}
					name="_method"
					value="delete"
					onclick={confirm("Sure?")}
					class="admin-link">Remove</FormButton>
			</> : <label for={toggle} class="admin-link">Upload</label>}
		</span>

		<Form
			req={req}
			action={action}
			method="put"
			enctype="multipart/form-data"
			class="form-toggle-form admin-inline-form"
		>
			<input
				type="file"
				name={name}
				value={value}
				required
				class="admin-input"
			/>

			<button class="admin-submit">Upload</button>
			&nbsp;or&nbsp;
			<label for={toggle} class="admin-link">Cancel</label>
			<br />
			<small>Aim for a JPEG or PNG with a size of 1200x675px or larger.</small>
		</Form>
	</>
}
