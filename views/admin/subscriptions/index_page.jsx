/** @jsx Jsx */
var _ = require("root/lib/underscore")
var Jsx = require("j6pack")
var Page = require("../page")
var {formatDateTime} = require("root/lib/i18n")
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

			<SubscriptionsView subscriptions={confirmed} />
		</> : null}

		{pending.length > 0 ? <>
			<h2 class="admin-subheading">
				Pending <span class="admin-count">({pending.length})</span>
			</h2>
			<SubscriptionsView subscriptions={pending} />
		</> : null}
	</Page>
}

function SubscriptionsView(attrs) {
	var subscriptions = _.sortBy(attrs.subscriptions, "created_at").reverse()

	return <table class="admin-table">
		<thead>
			<th>Subscribed At</th>
			<th>Confirmed At</th>
			<th>Email</th>
		</thead>

		<tbody>{subscriptions.map(function(subscription) {
			return <tr>
				<td>{formatDateTime("numeric", subscription.created_at)}</td>

				<td>{subscription.confirmed_at
					? formatDateTime("numeric", subscription.confirmed_at)
					: null
				}</td>

				<td>
					<a
						class="admin-link"
						href={"mailto:" + subscription.email}>
						{subscription.email}
					</a>

					{attrs.all && subscription.initiative_uuid == null ?
						<i> (All initiatives)</i>
					: null}
				</td>
			</tr>
		})}</tbody>
	</table>
}
