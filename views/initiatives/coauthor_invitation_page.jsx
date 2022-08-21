/** @jsx Jsx */
var Jsx = require("j6pack")
var {Section} = require("../page")
var {Form} = require("../page")
var InitiativePage = require("./initiative_page")
exports = module.exports = CoauthorInvitationPage
exports.CoauthorInvitationForm = CoauthorInvitationForm

function CoauthorInvitationPage(attrs) {
	var {req} = attrs
	var {t} = req
	var {initiative} = attrs
	var {invitation} = attrs

	return <InitiativePage
		page="initiative-coauthor-invitation"
		title={initiative.title}
		initiative={initiative}
		req={req}>
		<Section id="invitation-response" class="primary-section">
			<h2>{t("INITIATIVE_COAUTHOR_INVITATION_PAGE_TITLE")}</h2>
			<p>{t("USER_PAGE_COAUTHOR_INVITATION_DESCRIPTION")}</p>

			<CoauthorInvitationForm
				req={req}
				invitation={invitation}
				referrer={req.baseUrl + req.path}
			/>
		</Section>
	</InitiativePage>
}

function CoauthorInvitationForm(attrs) {
	var {req} = attrs
	var {t} = req
	var {invitation} = attrs
	var {referrer} = attrs

	var initiativePath = "/initiatives/" + invitation.initiative_uuid
	var invitationPath = initiativePath + "/coauthors/"
	invitationPath += invitation.country + invitation.personal_id

	return <menu class="coauthor-invitation-form">
		<Form
			req={req}
			action={invitationPath}
			method="put"
		>
			{referrer
				? <input type="hidden" name="referrer" value={referrer} />
				: null
			}

			<button
				name="status"
				value="accepted"
				class="blue-button"
			>
				{t("USER_PAGE_COAUTHOR_INVITATION_ACCEPT")}
			</button>
			</Form> {t("FORM_OR")} <Form
				req={req}
				action={invitationPath}
				method="put"
			>
				{referrer
					? <input type="hidden" name="referrer" value={referrer} />
					: null
				}

				<button
					name="status"
					value="rejected"
					class="link-button"
				>
				{t("USER_PAGE_COAUTHOR_INVITATION_REJECT")}
			</button>
		</Form>.
	</menu>
}
