/** @jsx Jsx */
var Jsx = require("j6pack")
var {Fragment} = Jsx
var UserPage = require("./user_page")
var {Section} = require("../page")
var {formatDateTime} = require("root/lib/i18n")
var {pathToSignature} =
	require("root/controllers/initiatives/signatures_controller")

module.exports = function(attrs) {
	var t = attrs.t
	var req = attrs.req
	var user = attrs.user
	var signatures = attrs.signatures

	return <UserPage
		page="user-signatures"
		title={user.name}
		req={req}
		user={user}
	>
		<Section class="primary-section">
			{signatures.length == 0 ? <p class="no-signatures">
				{t("USER_SIGNATURES_EMPTY")}
			</p> : <ol id="signatures">{signatures.map(function(signature) {
				var initiativePath = "/initiatives/" + signature.initiative_uuid
				var signaturePath = null

				if (signature.token) {
					signaturePath = initiativePath + "/signatures/"
					signaturePath += pathToSignature(signature, "asice")
				}

				return <li class="signature">
					<h2>
						<a href={initiativePath}>
							{signature.initiative_title}
						</a>
					</h2>

					{Jsx.html(t("USER_SIGNATURES_SIGNED_AT", {
						at: formatDateTime("numeric", signature.created_at)
					}))}

					{signaturePath ? <Fragment>
						{" "}<a href={signaturePath} download>{t("DOWNLOAD_SIGNATURE")}</a>.
					</Fragment> : null}
				</li>
			})}</ol>}
		</Section>
	</UserPage>
}
