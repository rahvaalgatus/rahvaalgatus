/** @jsx Jsx */
var Jsx = require("j6pack")
var Page = require("../page")

module.exports = function({req, t, method, verificationCode}) {
	return <Page
		page="creating-session"
		title={t("creating_session_page.title")}
		req={req}
	>
		<section id="verification-code" class="primary-section text-section">
			<center>{
				method == "mobile-id" || method == "smart-id" ? <p>
					<strong>
						{t("creating_session_page.verification_code")}: {verificationCode}
					</strong>

					<br />

					{method == "mobile-id"
						? t("creating_session_page.mobile_id.verification_code_description")
						: t("creating_session_page.smart_id.verification_code_description")
					}
				</p> : null
			}</center>
		</section>
	</Page>
}
