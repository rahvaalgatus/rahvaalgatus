/** @jsx Jsx */
var _ = require("root/lib/underscore")
var Jsx = require("j6pack")
var Fragment = Jsx.Fragment
var Config = require("root").config
var UserPage = require("./user_page")
var I18n = require("root/lib/i18n")
var {Section} = require("../page")
var {Form} = require("../page")
var {Flash} = require("../page")
var {InitiativeBoxesView} = require("../initiatives/index_page")

module.exports = function(attrs) {
	var t = attrs.t
	var req = attrs.req
	var user = attrs.user
	var error = attrs.error
	var initiatives = attrs.initiatives
	var coauthorInvitations = attrs.coauthorInvitations
	var userAttrs = attrs.userAttrs
	var userErrors = attrs.userErrors

	return <UserPage page="user" title={user.name} req={req} user={user}>
		<Section id="user" class="primary-section text-section">
			<Flash flash={req.flash} />

			<Form method="put" action="/user" class="form" req={req}>
				{error ? <p class="flash error">{error}</p> : null}

				<label class="form-label">{t("LBL_FULL_NAME")}</label>
				<input
					type="text"
					name="name"
					required
					value={userAttrs.name}
					class={"form-input" + (userErrors.name ? " error" : "")}
				/>

				<InputError t={req.t} name="name" error={userErrors.name} />

				<label class="form-label">{t("LBL_EMAIL")}</label>
				<input
					type="email"
					name="email"
					value={userAttrs.unconfirmed_email || user.email}
					class={"form-input" + (userErrors.unconfirmed_email ? " error" : "")}
				/>

				<InputError
					t={req.t}
					name="unconfirmed_email"
					error={userErrors.unconfirmed_email}
				/>

				{user.unconfirmed_email ? <p>
					{user.email
					? t("USER_PAGE_EMAIL_UNCONFIRMED_USING_OLD", {email: user.email})
					: t("USER_PAGE_EMAIL_UNCONFIRMED")}

					{(
						user.email_confirmation_sent_at == null ||
						new Date - user.email_confirmation_sent_at >= 10 * 60 * 1000
					) ? <Fragment>{" "}<button
						class="link-button"
						name="email_confirmation_sent_at"
						value="">{t("USER_EMAIL_RESEND_CONFIRMATION")}
					</button></Fragment> : null}
				</p> : null}

				<button class="form-submit secondary-button">{t("BTN_SAVE")}</button>
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
			{initiatives.length > 0 ? <Fragment>
				<h2>{t("MY_INITIATIVES")}</h2>

				<InitiativeBoxesView
					t={t}
					initiatives={_.sortBy(initiatives, "created_at").reverse()}
				/>
			</Fragment> : null}

			<p id="import-initiatives-from-other-accounts-info">
				{Jsx.html(t("USER_PAGE_OLD_ACCOUNTS_INFO", {
					email: _.escapeHtml(Config.helpEmail)
				}))}
			</p>
		</Section>
	</UserPage>
}

function InputError(attrs) {
	var t = attrs.t
	var error = attrs.error
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
