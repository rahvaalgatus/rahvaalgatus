/** @jsx Jsx */
var Jsx = require("j6pack")
var Page = require("./page")
var Form = Page.Form
var Config = require("root/config")
var formatDate = require("root/lib/i18n").formatDate
var formatDateTime = require("root/lib/i18n").formatDateTime

module.exports = function(attrs) {
	var req = attrs.req
	var from = attrs.from
	var to = attrs.to
	var lastSubscriptions = attrs.lastSubscriptions

	return <Page page="dashboard" title="Dashboard" req={req}>
		<h1 class="admin-heading">Dashboard</h1>

		<h2 class="admin-subheading">Overview</h2>

		<Form
			method="get"
			class="admin-inline-form overview-form"
			req={req}
		>
			<label class="admin-label">From</label>
			<input
				type="date"
				class="admin-input"
				name="from"
				value={from && formatDate("iso", from)}
			/>

			<label class="admin-label">To 00:00 of</label>
			<input
				type="date"
				class="admin-input"
				name="to"
				value={to && formatDate("iso", to)}
			/>

			<button class="admin-submit">Limit</button>
		</Form>

		<table class="admin-horizontal-table">
			<tr>
				<th scope="row">
					Initiatives created<br />
					<small>Created on Rahvaalgatus and not deleted. May be private.</small>
				</th>
				<td>{attrs.initiativesCount}</td>
			</tr>

			<tr>
				<th scope="row">
					Initiatives published<br />
					<small>Created on Rahvaalgatus, published and not deleted.</small>
				</th>
				<td>{attrs.publishedInitiativesCount}</td>
			</tr>

			<tr>
				<th scope="row">
					Initiatives created on Riigikogu<br />

					<small>
						Imported from the parliament. Dated by Riigikogu. Excludes ours.
					</small>
				</th>

				<td>{attrs.externalInitiativesCount}</td>
			</tr>

			<tr>
				<th scope="row">
					Initiatives sent to signing<br />

					<small>
						Sent to signing during given period, regardless of creation date.
					</small>
				</th>
				<td>{attrs.signingStartedCount}</td>
			</tr>

			<tr>
				<th scope="row">
					Initiatives passed {Config.votesRequired} signatures<br />
					<small>Milestone reached, regardless of creation date.</small>
				</th>

				<td>{attrs.successfulCount}</td>
			</tr>

			<tr>
				<th scope="row">
					Initiatives sent to Riigikogu<br />
					<small>Initiatives sent from Rahvaalgatus.</small>
				</th>

				<td>{attrs.sentToParliamentCount}</td>
			</tr>

			<tr>
				<th scope="row">
					Authentications<br />
					<small>Includes logged out sessions.</small>
				</th>

				<td>
					{attrs.authenticationsCount.all}

					<ul>
						<li>{attrs.authenticationsCount.id_card} with Id-card.</li>
						<li>{attrs.authenticationsCount.mobile_id} with Mobile-Id.</li>
						<li>{attrs.authenticationsCount.smart_id} with Smart-Id.</li>
					</ul>
				</td>
			</tr>

			<tr>
				<th scope="row">
					Signatures<br />

					<small>
						Counts initiative and user pairs.
						Excluded if deleted.
					</small>
				</th>

				<td>{attrs.signatureCount.all + attrs.citizenSignatureCount}</td>
			</tr>

			<tr>
				<th scope="row">
					Signatures via Undersign.js<br />

					<small>
						Counts initiative and user pairs.
						Excluded if deleted.
					</small>
				</th>

				<td>
					{attrs.signatureCount.all}

					<ul>
						<li>{attrs.signatureCount.id_card} with Id-card.</li>
						<li>{attrs.signatureCount.mobile_id} with Mobile-Id.</li>
						<li>{attrs.signatureCount.smart_id} with Smart-Id.</li>
					</ul>
				</td>
			</tr>

			<tr>
				<th scope="row">
					Unique signers via Undersign.js<br />

					<small>
						Unique signers for all initiatives.
						Excluded if deleted.
					</small>
				</th>

				<td>{attrs.signerCount}</td>
			</tr>

			<tr>
				<th scope="row">
					Signatures via CitizenOS<br />

					<small>
						Counts initiative and user pairs.
						Excluded if revoked.
					</small>
				</th>

				<td>{attrs.citizenSignatureCount}</td>
			</tr>

			<tr>
				<th scope="row">
					Unique signers via CitizenOS<br />

					<small>
						Unique signers for all initiatives.
						Excluded if revoked.
					</small>
				</th>

				<td>{attrs.citizenSignerCount}</td>
			</tr>

			<tr>
				<th scope="row">
					Unique subscriber count<br />
					<small>Confirmed subscribers. Counts unique emails.</small>
				</th>
				<td>{attrs.subscriberCount}</td>
			</tr>
		</table>

		<h2 class="admin-subheading">
			Last Subscriptions
			{" "}
			<span class="admin-count">({lastSubscriptions.length})</span>
		</h2>

		<SubscriptionsView req={req} subscriptions={lastSubscriptions} />
	</Page>
}

function SubscriptionsView(attrs) {
	var req = attrs.req
	var subscriptions = attrs.subscriptions

	return <table class="admin-table subscriptions-table">
		<thead>
			<th>Subscribed At</th>
			<th>Confirmed At</th>
			<th>Initiative</th>
			<th>Person</th>
		</thead>

		<tbody>{subscriptions.map(function(subscription) {
			var initiative = subscription.initiative

			return <tr>
				<td>{formatDateTime("numeric", subscription.created_at)}</td>

				<td>{subscription.confirmed_at
					? formatDateTime("numeric", subscription.confirmed_at)
					: null
				}</td>

				<td>{initiative ?
					<a
						href={`${req.baseUrl}/initiatives/${initiative.uuid}`}
						class="admin-link">
						{initiative.title}
					</a>
				: <i>All initiatives</i>}</td>

				<td>
					<a href={"mailto:" + subscription.email} class="admin-link">
						{subscription.email}
					</a>
					<br />
					<small>{subscription.created_ip}</small>
				</td>
			</tr>
		})}</tbody>
	</table>
}
