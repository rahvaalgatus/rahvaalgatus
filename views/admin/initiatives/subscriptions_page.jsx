/** @jsx Jsx */
var Jsx = require("j6pack")
var Fragment = Jsx.Fragment
var Page = require("../page")
var SubscriptionsView = require("../subscriptions/index_page").SubscriptionsView

module.exports = function(attrs) {
	var req = attrs.req
	var initiative = attrs.initiative
	var subscriptions = attrs.subscriptions
	var confirmed = subscriptions.filter((s) => s.confirmed_at)
	var pending = subscriptions.filter((s) => !s.confirmed_at)

	return <Page
		page="initiative-subscriptions"
		title={"Subscriptions for " + initiative.title}
		req={req}
	>
		<a href={req.baseUrl + "/initiatives"} class="admin-back-2">Initiatives</a>
		<a href={req.baseUrl + "/initiatives/" + initiative.uuid} class="admin-back">
			{initiative.title}
		</a>

		<h1 class="admin-heading">Subscriptions</h1>

		{confirmed.length > 0 ? <Fragment>
			<a
				class="download-link admin-primary-button"
				href={req.path + ".txt?confirmed=true"}>
				Download Emails
			</a>

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
