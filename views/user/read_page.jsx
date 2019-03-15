/** @jsx Jsx */
var Jsx = require("j6pack")
var Fragment = Jsx.Fragment
var Page = require("../page")
var Form = require("../page").Form
var Flash = require("../page").Flash
var InitiativesView = require("../initiatives_page").InitiativesView

module.exports = function(attrs) {
	var req = attrs.req
	var user = attrs.user
	var error = attrs.error
	var initiatives = attrs.initiatives
	var dbInitiatives = attrs.dbInitiatives
	var signedInitiatives = attrs.signedInitiatives
	var userAttrs = attrs.userAttrs
	var t = req.t

	return <Page page="user" title={user.name} req={req}>
		<section id="user" class="primary-section text-section"><center>
			<h1>{user.name}</h1>
			<Flash flash={req.flash} />

			<Form method="put" action="/user" class="form" req={req}>
				{error ? <p class="flash error">{error}</p> : null}

				<label class="form-label">{t("LBL_FULL_NAME")}</label>
				<input
					type="text"
					name="name"
					value={userAttrs.name}
					required
					class="form-input"
				/>

				<label class="form-label">{t("LBL_EMAIL")}</label>
				<input
					type="email"
					name="email"
					value={userAttrs.email}
					required
					class="form-input"
				/>

				<button class="form-submit primary-button">{t("BTN_SAVE")}</button>
			</Form>
		</center></section>

		<section id="initiatives" class="secondary-section initiatives-section">
			<center>
				<h2>{t("MY_INITIATIVES")}</h2>
				<InitiativesView
					t={t}
					initiatives={initiatives}
					dbInitiatives={dbInitiatives}
				/>

				{signedInitiatives.length > 0 ? <Fragment>
					<h2>{t("SIGNED_INITIATIVES")}</h2>
					<InitiativesView
						t={t}
						initiatives={signedInitiatives}
						dbInitiatives={dbInitiatives}
					/>
				</Fragment> : null}
			</center>
		</section>
	</Page>
}
