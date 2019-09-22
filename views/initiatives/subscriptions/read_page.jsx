/** @jsx Jsx */
var Jsx = require("j6pack")
var Form = require("../../page").Form
var FormCheckbox = require("../../page").FormCheckbox
var Flash = require("../../page").Flash
var InitiativePage = require("../initiative_page")

module.exports = function(attrs) {
	var req = attrs.req
	var t = req.t
	var initiative = attrs.initiative
	var topic = attrs.topic
	var subscription = attrs.subscription

	return <InitiativePage
		page="initiative-subscription"
		title={initiative.title}
		initiative={initiative}
		topic={topic}
		req={req}>
		<section class="primary-section text-section"><center>
			<h2>{t("SUBSCRIPTION_UPDATE_TITLE")}</h2>
			<Flash flash={req.flash} />

			<Form req={req} action={req.baseUrl + req.path}>
				<p>
					{Jsx.html(t("SUBSCRIPTION_UPDATE_BODY", {email: subscription.email}))}
				</p>

				<label class="form-checkbox">
					<FormCheckbox
						name="official_interest"
						checked={subscription.official_interest}
					/>

					<span>{t("SUBSCRIPTION_OFFICIAL_INTEREST")}</span>
				</label>

				<label class="form-checkbox">
					<FormCheckbox
						name="author_interest"
						checked={subscription.author_interest}
					/>

					<span>{t("SUBSCRIPTION_AUTHOR_INTEREST")}</span>
				</label>

				<label class="form-checkbox">
					<FormCheckbox
						name="comment_interest"
						checked={subscription.comment_interest}
					/>

					<span>{t("SUBSCRIPTION_COMMENT_INTEREST")}</span>
				</label>

				<button
					name="_method"
					value="put"
					class="form-submit primary-button">
					{t("SUBSCRIPTION_UPDATE_BUTTON")}
				</button>

				<span class="form-or">{t("FORM_OR")}</span>

				<button
					name="_method"
					value="delete"
					class="form-submit white-button">
					{t("SUBSCRIPTION_UNSUBSCRIBE_BUTTON")}
				</button>
			</Form>
		</center></section>
	</InitiativePage>
}
