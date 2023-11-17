/** @jsx Jsx */
var Jsx = require("j6pack")
var InitiativePage = require("../initiative_page")

module.exports = function({req, t, method, initiative, verificationCode}) {
	return <InitiativePage
		page="creating-initiative-signature"

		title={
			t("creating_initiative_signature_page.title") + " - " + initiative.title
		}

		initiative={initiative}
		req={req}
	>
		<section id="verification-code" class="primary-section text-section">
			<center>{
				method == "mobile-id" || method == "smart-id" ? <p>
					<strong>
						{t("creating_initiative_signature_page.verification_code")}:
						{" "}
						{verificationCode}
					</strong>

					<br />

					{method == "mobile-id"
						? t("creating_initiative_signature_page.mobile_id.verification_code_description")
						: t("creating_initiative_signature_page.smart_id.verification_code_description")
					}
				</p> : null
			}</center>
		</section>
	</InitiativePage>
}
