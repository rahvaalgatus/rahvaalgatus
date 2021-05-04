/** @jsx Jsx */
var _ = require("root/lib/underscore")
var Jsx = require("j6pack")
var Page = require("../page")
var Form = Page.Form
var FormCheckbox = Page.FormCheckbox
var Flash = Page.Flash
var confirm = require("root/lib/jsx").confirm
exports = module.exports = SubscriptionsPage
exports.SubscriptionsView = SubscriptionsView

function SubscriptionsPage(attrs) {
	var req = attrs.req
	var t = req.t
	var subscriptions = attrs.subscriptions

	var sub = attrs.subscription
	var actionPath = req.baseUrl + req.path
	actionPath += `?update-token=${sub.update_token}`
	if (sub.initiative_uuid) actionPath += `&initiative=${sub.initiative_uuid}`

	return <Page page="subscriptions" req={req}>
		<section class="primary-section"><center>
			<h2>{t("SUBSCRIPTIONS_UPDATE_TITLE")}</h2>

			<Flash flash={req.flash} />

			<p class="text">
				{Jsx.html(t("SUBSCRIPTIONS_UPDATE_BODY", {
					email: _.escapeHtml(sub.email)
				}))}
			</p>

			<SubscriptionsView
				req={req}
				action={actionPath}
				subscriptions={subscriptions}
			/>
		</center></section>
	</Page>
}

function SubscriptionsView(attrs) {
	var req = attrs.req
	var t = req.t
	var subscriptions = attrs.subscriptions
	var action = attrs.action

	return <Form req={req} action={action}>
		<div class="subscriptions-view">
			<ul>{subscriptions.map(function(subscription) {
				var scope = subscription.initiative_uuid || "null"

				var title = subscription.initiative_uuid
					? subscription.initiative_title
					: t("SUBSCRIPTIONS_ALL_INITIATIVES")

				return <li
					id={`subscription-` + subscription.initiative_uuid}
					class="subscription"
				>
					<h3 class={subscription.initiative_uuid == null ? "all" : ""}>
						{subscription.initiative_uuid == null ? title : <a
							class="link-button"
							href={`/initiatives/${subscription.initiative_uuid}`}>
							{title}
						</a>}
					</h3>

					<div class="labels">
						<input
							type="checkbox"
							id={`${scope}[delete]`}
							name={`${scope}[delete]`}
							hidden
						/>

						<label class="form-checkbox">
							<FormCheckbox
								name={`${scope}[event_interest]`}
								checked={subscription.event_interest}
							/>

							<span>{t("SUBSCRIPTION_EVENT_INTEREST")}</span>
						</label>

						<label class="form-checkbox">
							<FormCheckbox
								name={`${scope}[comment_interest]`}
								checked={subscription.comment_interest}
							/>

							<span>{t("SUBSCRIPTION_COMMENT_INTEREST")}</span>
						</label>

						<p class="delete-phrase">{t("FORM_OR")} <label
							for={`${scope}[delete]`}
							class="delete-button link-button"
						>{t("SUBSCRIPTION_DELETE_BUTTON")}</label>.</p>

						<p class="deleted-phrase">
							<span>{t("SUBSCRIPTIONS_WILL_BE_DELETED")}</span> <label
							for={`${scope}[delete]`}
							class="delete-button link-button"
						>{t("SUBSCRIPTIONS_CANCEL_DELETE")}</label>
						</p>
					</div>
				</li>
			})}</ul>
		</div>

		<button
			name="_method"
			value="put"
			class="form-submit secondary-button">
			{t("SUBSCRIPTIONS_UPDATE_BUTTON")}
		</button>

		<span class="form-or">{t("FORM_OR")}</span>

		<button
			name="_method"
			value="delete"
			class="form-submit delete-all-button link-button"
			onclick={confirm(t("SUBSCRIPTIONS_CONFIRM_DELETE"))}
		>
			{t("SUBSCRIPTIONS_DELETE_BUTTON")}
		</button>.
	</Form>
}
