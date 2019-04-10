/** @jsx Jsx */
var Jsx = require("j6pack")
var FormButton = require("../../page").FormButton
var InitiativePage = require("../initiative_page")

module.exports = function(attrs) {
	var req = attrs.req
	var t = req.t
	var initiative = attrs.initiative
	var subscription = attrs.subscription
	var id = subscription.update_token

	return <InitiativePage
		page="initiative-subscription"
		class="initiative-page"
		title={initiative.title}
		initiative={initiative}
		req={req}>
		<section class="primary-section text-section"><center>
			<h2>{t("SUBSCRIPTION_UPDATE_TITLE")}</h2>
			<p>
				{Jsx.html(t("SUBSCRIPTION_UPDATE_BODY", {email: subscription.email}))}
			</p>

			<FormButton
				req={req}
				name="_method"
				value="delete"
				action={"/initiatives/" + initiative.id + "/subscriptions/" + id}
				class="form-submit primary-button">
				{t("UNSUBSCRIBE_BUTTON")}
			</FormButton>
		</center></section>
	</InitiativePage>
}
