/** @jsx Jsx */
var Jsx = require("j6pack")
var Form = require("../../page").Form
var InitiativePage = require("../initiative_page")

module.exports = function(attributes) {
	var req = attributes.req
	var t = req.t
	var initiative = attributes.initiative
	var error = attributes.error
	var attrs = attributes.attrs

	return <InitiativePage
		page="initiative-authors"
		class="initiative-page"
		title={initiative.title}
		initiative={initiative}
		req={req}>
		<section class="primary-section text-section">
			<center>
				<h2>{t("CO_AUTHORS")}</h2>
				<p>{t("CO_AUTHORS_TEXT")}</p>

				{error ? <p class="flash error">{error}</p> : null}

				<Form
					req={req}
					method="post"
					action={"/initiatives/" + initiative.id + "/authors"}
					class="form">
					<label class="form-label">{t("LBL_EMAIL")}</label>
					<input
						type="email"
						name="email"
						value={attrs.email}
						required
						class="form-input"
					/>

					<button class="form-submit primary-button">
						{t("ADD_CO_AUTHOR")}
					</button>
				</Form>
			</center>
		</section>
	</InitiativePage>
}
