/** @jsx Jsx */
var _ = require("root/lib/underscore")
var Jsx = require("j6pack")
var {Fragment} = Jsx
var UserPage = require("./user_page")
var {Flash} = require("../page")
var {Section} = require("../page")
var {SubscriptionsView} = require("root/views/subscriptions/index_page")

module.exports = function(attrs) {
	var {req} = attrs
	var {t} = attrs
	var {user} = attrs
	var {subscriptions} = attrs

	return <UserPage
		page="user-subscriptions"
		title={user.name}
		req={req}
		user={user}
	>
		<Section id="profile" class="primary-section">
			{user.email == null ? <p class="unconfirmed-email-info">
				{Jsx.html(t("USER_SUBSCRIPTIONS_UNCONFIRMED_EMAIL", {
					emailUrl: req.baseUrl
				}))}
			</p> : subscriptions.length == 0 ? <p class="no-subscriptions">
				{t("USER_SUBSCRIPTIONS_EMPTY")}
			</p> : <Fragment>
				<Flash flash={req.flash} />

				<p class="text">
					{Jsx.html(t("SUBSCRIPTIONS_UPDATE_BODY", {
						email: _.escapeHtml(user.email)
					}))}
				</p>

				<SubscriptionsView
					req={req}
					action={req.baseUrl + req.path}
					subscriptions={subscriptions}
				/>
			</Fragment>}
		</Section>
	</UserPage>
}
