/** @jsx Jsx */
var Jsx = require("j6pack")
var Page = require("./page")
var formatDateTime = require("root/lib/i18n").formatDateTime

module.exports = function(attrs) {
	var req = attrs.req
	var subscriptions = attrs.subscriptions

	return <Page page="dashboard" title="Dashboard" req={attrs.req}>
		<h1 class="admin-heading">Dashboard</h1>

		<h2 class="admin-subheading">Signatures</h2>

		<table class="admin-horizontal-table">
			<th scope="row">Unique signatures this month</th>
			<td>{attrs.signatureCount}</td>
		</table>

		<h2 class="admin-subheading">
			Last Subscriptions
			{" "}
			<span class="admin-count">({subscriptions.length})</span>
		</h2>

		<SubscriptionsView req={req} subscriptions={subscriptions} />
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
						href={`${req.baseUrl}/initiatives/${initiative.id}`}
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
