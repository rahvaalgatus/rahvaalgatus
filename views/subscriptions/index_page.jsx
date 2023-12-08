/** @jsx Jsx */
var _ = require("root/lib/underscore")
var Jsx = require("j6pack")
var Page = require("../page")
var {Form} = Page
var {FormCheckbox} = Page
var {Flash} = Page
var {confirm} = require("root/lib/jsx")
exports = module.exports = SubscriptionsPage
exports.SubscriptionsView = SubscriptionsView

function SubscriptionsPage(attrs) {
	var {req} = attrs
	var {t} = req
	var {subscriptions} = attrs

	var sub = attrs.subscription
	var actionPath = req.baseUrl + req.path
	actionPath += `?update-token=${sub.update_token}`
	if (sub.initiative_uuid) actionPath += `&initiative=${sub.initiative_uuid}`

	return <Page page="subscriptions" req={req}>
		<section class="primary-section"><center>
			<h2>{t("subscriptions_page.title")}</h2>

			<Flash flash={req.flash} />

			<p class="text">
				{Jsx.html(t("subscriptions_page.description", {
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
	var {req} = attrs
	var {t} = req
	var {subscriptions} = attrs
	var {action} = attrs

	return <Form req={req} action={action}>
		<div class="subscriptions-view">
			<ul>{subscriptions.map(function(subscription) {
				var scope =
					subscription.initiative_uuid ||
					subscription.initiative_destination ||
					"null"

				var title = subscription.initiative_uuid
					? subscription.initiative_title
					: subscription.initiative_destination
					? t("subscriptions_page.subscriptions.initiatives_for", {
						destination: t("DESTINATION_" + subscription.initiative_destination)
					})
					: t("subscriptions_page.subscriptions.all_initiatives")

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

						{subscription.initiative_uuid == null ? <label
							class="form-checkbox"
						>
							<FormCheckbox
								name={`${scope}[new_interest]`}
								checked={subscription.new_interest}
							/>

							<span>
								{t("subscriptions_page.subscriptions.all_new_interest")}
							</span>
						</label> : null}

						{subscription.initiative_uuid == null ? <label
							class="form-checkbox"
						>
							<FormCheckbox
								name={`${scope}[signable_interest]`}
								checked={subscription.signable_interest}
							/>

							<span>
								{t("subscriptions_page.subscriptions.all_signable_interest")}
							</span>
						</label> : null}

						<label class="form-checkbox">
							<FormCheckbox
								name={`${scope}[event_interest]`}
								checked={subscription.event_interest}
							/>

							<span>{subscription.initiative_uuid == null
								? t("subscriptions_page.subscriptions.all_event_interest")
								: t("subscriptions_page.subscriptions.one_event_interest")
							}</span>
						</label>

						<label class="form-checkbox">
							<FormCheckbox
								name={`${scope}[comment_interest]`}
								checked={subscription.comment_interest}
							/>

							<span>{subscription.initiative_uuid == null
								? t("subscriptions_page.subscriptions.all_comment_interest")
								: t("subscriptions_page.subscriptions.one_comment_interest")
							}</span>
						</label>

						<p class="delete-phrase">{t("FORM_OR")} <label
							for={`${scope}[delete]`}
							class="delete-button link-button"
						>{t("subscriptions_page.subscriptions.delete_button")}</label>.</p>

						<p class="deleted-phrase">
							<span>{t("subscriptions_page.subscriptions.deleting")}</span>
							{" "}
							<label
								for={`${scope}[delete]`}
								class="delete-button link-button"
							>
								{t("subscriptions_page.subscriptions.cancel_button")}
							</label>
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
			{t("subscriptions_page.subscriptions.delete_all_button")}
		</button>.
	</Form>
}
