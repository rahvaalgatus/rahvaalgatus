/** @jsx Jsx */
var Jsx = require("j6pack")
var FormButton = require("../../page").FormButton
var InitiativePage = require("../initiative_page")

module.exports = function(attrs) {
	var req = attrs.req
	var t = req.t
	var initiative = attrs.initiative
	var subscription = attrs.subscription

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
				action={req.baseUrl + req.path}
				class="form-submit primary-button">
				{t("SUBSCRIPTION_UNSUBSCRIBE_BUTTON")}
			</FormButton>
		</center></section>
	</InitiativePage>
}
