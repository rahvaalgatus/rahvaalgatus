/** @jsx Jsx */
var Jsx = require("j6pack")
var Page = require("../page")
var Form = require("../page").Form

module.exports = function(attributes) {
	var req = attributes.req
	var error = attributes.error
	var attrs = attributes.attrs
	var t = attributes.t

	return <Page title={t("EXPLANATION")} page="initiative-create" req={req}>
		<section id="initiative" class="primary-section text-section">
			<center>
				<img src="/assets/one.png" class="step-counter" />

				<h1>{t("EXPLANATION")}</h1>
				<p>{t("EXPLANATION_CONTENT")}</p>

				{req.user == null
					? <p class="flash error">{t("LOGIN_TO_CREATE_TOPIC")}</p>

					: <Form action="/initiatives" method="post" req={req}>
						<h2>{t("TITLE_FIELD")}</h2>
						{error ? <p class="flash error">{error}</p> : null}

						<input
							type="text"
							name="title"
							value={attrs.title}
							required
							class="form-input"
						/>

						<label class="form-checkbox">
							<input type="checkbox" name="accept-tos" required />
							{Jsx.html(t("I_HAVE_READ", {url: "/about#tos"}))}
						</label>

						<button class="form-submit primary-button">
							{t("START_DISCUSSION")}
						</button>
					</Form>
				}
			</center>
		</section>
	</Page>
}
