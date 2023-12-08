/** @jsx Jsx */
var _ = require("root/lib/underscore")
var Jsx = require("j6pack")
var Page = require("../page")
var {formatDateTime} = require("root/lib/i18n")
var LOCAL_GOVERNMENTS = require("root/lib/local_governments")
exports = module.exports = IndexPage
exports.SubscriptionsView = SubscriptionsView

function IndexPage(attrs) {
	var {subscriptions} = attrs
	var confirmed = subscriptions.filter((s) => s.confirmed_at)
	var pending = subscriptions.filter((s) => !s.confirmed_at)

	return <Page page="subscriptions" title="Subscriptions" req={attrs.req}>
		<h1 class="admin-heading">Subscriptions</h1>

		{confirmed.length > 0 ? <>
			<h2 class="admin-subheading">
				Confirmed <span class="admin-count">({confirmed.length})</span>
			</h2>

			<SubscriptionsView subscriptions={confirmed} showDestination />
		</> : null}

		{pending.length > 0 ? <>
			<h2 class="admin-subheading">
				Pending <span class="admin-count">({pending.length})</span>
			</h2>
			<SubscriptionsView subscriptions={pending} showDestination />
		</> : null}
	</Page>
}

function SubscriptionsView({subscriptions, showDestination}) {
	subscriptions = _.sortBy(subscriptions, "created_at").reverse()

	return <table class="admin-table">
		<thead>
			<th>Subscribed At</th>
			<th>Confirmed At</th>
			{showDestination ? <th>Destination</th> : null}
			<th>Email</th>
		</thead>

		<tbody>{subscriptions.map(function(subscription) {
			var destination = subscription.initiative_destination

			return <tr>
				<td>{formatDateTime("numeric", subscription.created_at)}</td>

				<td>{subscription.confirmed_at
					? formatDateTime("numeric", subscription.confirmed_at)
					: null
				}</td>

				{showDestination ? <td>{destination
					? <i>{LOCAL_GOVERNMENTS[destination].name} initiatives</i>
					: <i>All</i>
				}</td> : null}

				<td>
					<a class="admin-link" href={"mailto:" + subscription.email}>
						{subscription.email}
					</a>
				</td>
			</tr>
		})}</tbody>
	</table>
}
