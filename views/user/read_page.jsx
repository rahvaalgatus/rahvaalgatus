/** @jsx Jsx */
var _ = require("root/lib/underscore")
var Jsx = require("j6pack")
var Fragment = Jsx.Fragment
var Page = require("../page")
var Form = require("../page").Form
var Flash = require("../page").Flash
var InitiativesView = require("../initiatives_page").InitiativesView

module.exports = function(attrs) {
	var t = attrs.t
	var req = attrs.req
	var user = attrs.user
	var error = attrs.error
	var authoredInitiatives = attrs.authoredInitiatives
	var signedInitiatives = attrs.signedInitiatives
	var topics = attrs.topics
	var signatureCounts = attrs.signatureCounts
	var userAttrs = attrs.userAttrs
	var userErrors = attrs.userErrors

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

				<button class="form-submit primary-button">{t("BTN_SAVE")}</button>
			</Form>
		</center></section>

		<section id="initiatives" class="secondary-section initiatives-section">
			<center>
				{authoredInitiatives.length > 0 ? <Fragment>
					<h2>{t("MY_INITIATIVES")}</h2>

					<InitiativesView
						t={t}
						initiatives={_.sortBy(authoredInitiatives, "created_at").reverse()}
						topics={topics}
						signatureCounts={signatureCounts}
					/>
				</Fragment> : null}

				{signedInitiatives.length > 0 ? <Fragment>
					<h2>{t("SIGNED_INITIATIVES")}</h2>

					<InitiativesView
						t={t}
						initiatives={signedInitiatives}
						topics={topics}
						signatureCounts={signatureCounts}
					/>
				</Fragment> : null}
			</center>
		</section>
	</Page>
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
