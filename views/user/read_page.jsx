/** @jsx Jsx */
var _ = require("root/lib/underscore")
var Jsx = require("j6pack")
var Config = require("root").config
var UserPage = require("./user_page")
var I18n = require("root/lib/i18n")
var {Section} = require("../page")
var {Form} = require("../page")
var {Flash} = require("../page")
var {InitiativeBoxesView} = require("../initiatives/index_page")
var {SCHEMA} = require("root/controllers/user_controller")

module.exports = function(attrs) {
	var {t} = attrs
	var {req} = attrs
	var {user} = attrs
	var {error} = attrs
	var {initiatives} = attrs
	var {coauthorInvitations} = attrs
	var {userAttrs} = attrs
	var {userErrors} = attrs

	return <UserPage page="user" title={user.name} req={req} user={user}>
		<Section id="user" class="primary-section text-section">
			<Flash flash={req.flash} />

			<Form method="put" action="/user" class="form" req={req}>
				{error ? <p class="flash error">{error}</p> : null}

				<label class="form-label">{t("user_page.form.name_label")}</label>

				<p class="form-input-description">
					{Jsx.html(t("user_page.form.name_description"))}
				</p>

				<input
					type="text"
					name="name"
					disabled
					value={userAttrs.name}
					class="form-input"
				/>

				<label class="form-label">{t("user_page.form.email_label")}</label>

				<input
					type="email"
					name="email"
					value={userAttrs.unconfirmed_email || user.email}
					class={"form-input" + (userErrors.unconfirmed_email ? " error" : "")}
					maxlength={SCHEMA.properties.unconfirmed_email.maxLength}
				/>

				<InputError
					t={req.t}
					name="unconfirmed_email"
					error={userErrors.unconfirmed_email}
				/>

				{user.unconfirmed_email ? <p class="form-input-description">
					{user.email
					? t("user_page.form.email_unconfirmed_using_old", {email: user.email})
					: t("user_page.form.email_unconfirmed")}

					{(
						user.email_confirmation_sent_at == null ||
						new Date - user.email_confirmation_sent_at >= 10 * 60 * 1000
					) ? <>{" "}<button
						class="link-button"
						name="email_confirmation_sent_at"
						value="">{t("user_page.form.email_resend_confirmation")}
					</button></> : null}
				</p> : null}

				<button class="form-submit secondary-button">
					{t("user_page.form.update_button")}
				</button>
			</Form>
		</Section>

		{coauthorInvitations.length > 0 ? <Section
			id="coauthor-invitations"
			class="transparent-section"
		>
			<h2>{t("USER_PAGE_COAUTHOR_INVITATION_TITLE")}</h2>
			<p>{t("USER_PAGE_COAUTHOR_INVITATION_DESCRIPTION")}</p>

			<ul>{coauthorInvitations.map(function(invitation) {
				var initiativePath = "/initiatives/" + invitation.initiative_uuid
				var invitationPath = initiativePath + "/coauthors/"
				invitationPath += invitation.country + invitation.personal_id

				return <li>
					<Form
						req={req}
						action={invitationPath}
						method="put"
					>
						<button
							name="status"
							value="accepted"
							class="blue-button"
						>
							{t("USER_PAGE_COAUTHOR_INVITATION_ACCEPT")}
						</button> {t("FORM_OR")} <button
							name="status"
							value="rejected"
							class="link-button"
						>
							{t("USER_PAGE_COAUTHOR_INVITATION_REJECT")}
						</button>.
					</Form>

					<h3>
						{invitation.initiative_published_at ? <a href={initiativePath}>
							{invitation.initiative_title}
						</a> : invitation.initiative_title}
					</h3>

					<span class="by">
						<strong>{invitation.inviter_name}</strong> lisas su
						{" "}
						<time>
							{I18n.formatDate("numeric", invitation.created_at)}
						</time> algatuse kaasautoriks.
					</span>
				</li>
			})}</ul>
		</Section> : null}

		<Section id="my-initiatives" class="secondary-section initiatives-section">
			{initiatives.length > 0 ? <>
				<h2>{t("MY_INITIATIVES")}</h2>

				<InitiativeBoxesView
					t={t}
					initiatives={_.sortBy(initiatives, "created_at").reverse()}
				/>
			</> : null}

			<p id="import-initiatives-from-other-accounts-info">
				{Jsx.html(t("USER_PAGE_OLD_ACCOUNTS_INFO", {
					email: _.escapeHtml(Config.helpEmail)
				}))}
			</p>
		</Section>
	</UserPage>
}

function InputError(attrs) {
	var {t} = attrs
	var {error} = attrs
	if (error == null) return null

	var text
	switch (error.code) {
		case "format":
			if (error.format == "email") text = t("INPUT_ERROR_FORMAT_EMAIL")
			else text = t("INPUT_ERROR_FORMAT")
			break

		case "length":
			if (error.minimum == 1) text = t("INPUT_ERROR_LENGTH_1")
			else text = t("INPUT_ERROR_LENGTH_N", {minimum: error.minimum})
			break

		default: throw new Error("Unknown error code: " + error.code)
	}

	return <p class="form-input-error">{text}</p>
}
