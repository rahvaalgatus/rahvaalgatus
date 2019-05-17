/** @jsx Jsx */
var Jsx = require("j6pack")
var FormButton = require("../page").FormButton
var Page = require("../page")

module.exports = function(attrs) {
	var req = attrs.req
	var t = req.t
	var subscription = attrs.subscription

	return <Page page="subscription" req={req}>
		<section class="primary-section text-section"><center>
			<h2>{t("SUBSCRIPTIONS_UPDATE_TITLE")}</h2>
			<p>
				{Jsx.html(t("SUBSCRIPTIONS_UPDATE_BODY", {email: subscription.email}))}
			</p>

			<FormButton
				req={req}
				name="_method"
				value="delete"
				action={req.baseUrl + req.path}
				class="form-submit primary-button">
				{t("SUBSCRIPTIONS_UNSUBSCRIBE_BUTTON")}
			</FormButton>
		</center></section>
	</Page>
}
