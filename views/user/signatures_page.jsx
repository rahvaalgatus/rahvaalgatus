/** @jsx Jsx */
var _ = require("root/lib/underscore")
var Jsx = require("j6pack")
var UserPage = require("./user_page")
var {Section} = require("../page")
var {formatDateTime} = require("root/lib/i18n")
var {pathToSignature} =
	require("root/controllers/initiatives/signatures_controller")

module.exports = function(attrs) {
	var {t} = attrs
	var {req} = attrs
	var {user} = attrs
	var {signatures} = attrs

	return <UserPage
		page="user-signatures"
		title={t("user_signatures_page.title")}
		req={req}
		user={user}
	>
		<Section class="primary-section">
			<p class="description-paragraph">
				{t("user_signatures_page.description")}
			</p>

			{signatures.length == 0 ? <p class="no-signatures">
				{t("user_signatures_page.signatures.empty")}
			</p> : <ol id="signatures">{signatures.map(function(signature) {
				var initiativePath = "/initiatives/" + signature.initiative_uuid
				var signaturePath = null

				if (signature.token) {
					signaturePath = initiativePath + "/signatures/"
					signaturePath += pathToSignature(signature, "asice")
				}

				return <li class="signature">
					<h2><a href={initiativePath}>{signature.initiative_title}</a></h2>

					{Jsx.html(t("user_signatures_page.signatures.signed_at", {
						at: _.escapeHtml(formatDateTime("numeric", signature.created_at))
					}))}

					{signaturePath ? <>
						{" "}<a href={signaturePath} download>
						{t("user_signatures_page.signatures.download_button")}
						</a>.
					</> : null}
				</li>
			})}</ol>}
		</Section>
	</UserPage>
}
