/** @jsx Jsx */
var Jsx = require("j6pack")
var InitiativePage = require("../initiative_page")
var {SigningView} = require("root/views/initiatives/read_page")

module.exports = function(attrs) {
	var req = attrs.req
	var user = req.user
	var t = attrs.t
	var text = attrs.text
	var initiative = attrs.initiative

	return <InitiativePage
		page="sign-initiative-text"
		title={initiative.title}
		initiative={initiative}
		req={req}>
		<script src="/assets/html5.js" />
		<script src="/assets/hwcrypto.js" />

		<section class="initiative-section transparent-section"><center>
			<div id="initiative-sheet" class="initiative-sheet">
				<h2>
					{t("INITIATIVE_TRANSLATION_SIGN_TRANSLATION_IN_" + text.language.toUpperCase())}
				</h2>

				<p>
					{Jsx.html(t("INITIATIVE_TRANSLATION_SIGN_DESCRIPTION", {
						translationUrl: req.baseUrl + "/" + text.id,
						signableUrl: req.baseUrl + "/" + text.id + "/signable",
					}))}
				</p>

				<SigningView
					req={req}
					t={t}
					action={req.baseUrl + "/" + text.id + "/signatures"}
					personalId={user.personal_id}
					singlePage
				/>
			</div>
		</center></section>
	</InitiativePage>
}
