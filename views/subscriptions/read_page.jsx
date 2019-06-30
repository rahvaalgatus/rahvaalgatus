/** @jsx Jsx */
var Jsx = require("j6pack")
var Page = require("../page")
var Form = Page.Form
var Flash = Page.Flash

module.exports = function(attrs) {
	var req = attrs.req
	var t = req.t
	var subscription = attrs.subscription

	return <Page page="subscription" req={req}>
		<section class="primary-section text-section"><center>
			<h2>{t("SUBSCRIPTIONS_UPDATE_TITLE")}</h2>
			<Flash flash={req.flash} />

			<Form req={req} action={req.baseUrl + req.path}>
				<p>
					{Jsx.html(t("SUBSCRIPTIONS_UPDATE_BODY", {
						email: subscription.email
					}))}
				</p>

				<label class="form-checkbox">
					<input
						type="checkbox"
						name="official_interest"
						checked={subscription.official_interest}
					/>

					<span>{t("SUBSCRIPTION_OFFICIAL_INTEREST")}</span>
				</label>

				<label class="form-checkbox">
					<input
						type="checkbox"
						name="author_interest"
						checked={subscription.author_interest}
					/>

					<span>{t("SUBSCRIPTION_AUTHOR_INTEREST")}</span>
				</label>

				<label class="form-checkbox">
					<input
						type="checkbox"
						name="comment_interest"
						checked={subscription.comment_interest}
					/>

					<span>{t("SUBSCRIPTION_COMMENT_INTEREST")}</span>
				</label>

				<button
					name="_method"
					value="put"
					class="form-submit primary-button">
					{t("SUBSCRIPTIONS_UPDATE_BUTTON")}
				</button>

				<span class="form-or">{t("FORM_OR")}</span>

				<button
					name="_method"
					value="delete"
					class="form-submit white-button">
					{t("SUBSCRIPTIONS_UNSUBSCRIBE_BUTTON")}
				</button>
			</Form>
		</center></section>
	</Page>
}
