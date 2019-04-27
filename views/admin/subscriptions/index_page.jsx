/** @jsx Jsx */
var Jsx = require("j6pack")
var Page = require("../page")
var formatTime = require("root/lib/i18n").formatTime

module.exports = function(attrs) {
	var subscriptions = attrs.subscriptions

	return <Page page="subscriptions" title="Subscriptions" req={attrs.req}>
		<h1 class="admin-heading">Subscriptions</h1>

		<h2 class="admin-subheading">
			Last Initiative Subscriptions
			{" "}
			<span class="admin-count">({subscriptions.length})</span>
		</h2>

		<SubscriptionsView subscriptions={subscriptions} />
	</Page>
}

function SubscriptionsView(attrs) {
	var subscriptions = attrs.subscriptions

	return <table class="admin-table">
		<thead>
			<th>Subscribed At</th>
			<th>Confirmed At</th>
			<th>Initiative</th>
			<th>Person</th>
		</thead>

		<tbody>{subscriptions.map(function(subscription) {
			var initiative = subscription.initiative

			return <tr>
				<td>{formatTime("numeric", subscription.created_at)}</td>

				<td>{subscription.confirmed_at
					? formatTime("numeric", subscription.confirmed_at)
					: null
				}</td>

				<td>
					<a class="admin-link" href={"/initiatives/" + initiative.id}>
						{initiative.title}
					</a>
				</td>

				<td>
					<a class="admin-link" href={"mailto:" + subscription.email}>
						{subscription.email}
					</a>
					<br />
					<small>{subscription.created_ip}</small>
				</td>
			</tr>
		})}</tbody>
	</table>
}
