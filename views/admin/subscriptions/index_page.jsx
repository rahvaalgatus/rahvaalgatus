/** @jsx Jsx */
var Jsx = require("j6pack")
var Fragment = Jsx.Fragment
var Page = require("../page")
var formatTime = require("root/lib/i18n").formatTime
exports = module.exports = IndexPage
exports.SubscriptionsView = SubscriptionsView

function IndexPage(attrs) {
	var subscriptions = attrs.subscriptions
	var confirmed = subscriptions.filter((s) => s.confirmed_at)
	var pending = subscriptions.filter((s) => !s.confirmed_at)

	return <Page page="subscriptions" title="Subscriptions" req={attrs.req}>
		<h1 class="admin-heading">Subscriptions</h1>

		{confirmed.length > 0 ? <Fragment>
			<h2 class="admin-subheading">
				Confirmed <span class="admin-count">({confirmed.length})</span>
			</h2>

			<SubscriptionsView subscriptions={confirmed} />
		</Fragment> : null}

		{pending.length > 0 ? <Fragment>
			<h2 class="admin-subheading">
				Pending <span class="admin-count">({pending.length})</span>
			</h2>
			<SubscriptionsView subscriptions={pending} />
		</Fragment> : null}
	</Page>
}

function SubscriptionsView(attrs) {
	var subscriptions = attrs.subscriptions

	return <table class="admin-table">
		<thead>
			<th>Subscribed At</th>
			<th>Confirmed At</th>
			<th>Email</th>
		</thead>

		<tbody>{subscriptions.map(function(subscription) {
			return <tr>
				<td>{formatTime("numeric", subscription.created_at)}</td>

				<td>{subscription.confirmed_at
					? formatTime("numeric", subscription.confirmed_at)
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
