/** @jsx Jsx */
var Jsx = require("j6pack")
var Page = require("../page")

module.exports = function({req, t, method, verificationCode}) {
	//var {error} = attrs
	//? <p class="flash error">{error}</p>

	return <Page
		page="creating-demo-signature"
		title={t("DEMO_SIGNATURES_TITLE")}
		headless
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
	</Page>
}
