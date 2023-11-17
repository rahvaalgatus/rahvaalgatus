/** @jsx Jsx */
var Jsx = require("j6pack")
var Page = require("../page")
var {Flash} = require("../page")
var EidView = require("../eid_view")
var Config = require("root").config

module.exports = function(attrs) {
	var {t} = attrs
	var {req} = attrs
	var {flash} = attrs
	var idCardAuthenticationUrl = Config.idCardAuthenticationUrl + "/sessions"

	return <Page
		page="create-session"
		title={t("create_session_page.title")}
		req={req}
	>
		<script src="/assets/html5.js" />
		<script src="/assets/hwcrypto.js" />

		<section class="transparent-section"><center>
			<h1>{t("create_session_page.title")}</h1>

			<Flash flash={flash} />

			<EidView
				t={t}
				id="create-session-view"
				url="/sessions"
				action="auth"
				csrfToken={req.csrfToken}
				idCardAuthenticationUrl={idCardAuthenticationUrl}
				submit={t("create_session_page.eid_view.sign_in_button")}
				pending={t("create_session_page.eid_view.signing_in")}
				done={t("create_session_page.eid_view.signed_in")}
			/>
		</center></section>
	</Page>
}
