/** @jsx Jsx */
var Jsx = require("j6pack")
var Page = require("../page")
var Config = require("root/config")
var Form = require("../page").Form

module.exports = function(attrs) {
	var req = attrs.req
	var t = req.t

	return <Page
		page="demo-signatures"
		title={t("DEMO_SIGNATURES_TITLE")}
		navless
		req={req}>
		<section id="demo-signatures" class="primary-section text-section"><center>
			<h1>{t("DEMO_SIGNATURES_HEADER")}</h1>

			<div class="video">
				<iframe
					width="480"
					height="270"
					src={Config.videoUrls[req.lang]}
					frameborder="0"
					allowfullscreen
				/>
			</div>

			{t("DEMO_SIGNATURES_BODY_TEXT")}

			<div id="sign">
				<input
					type="radio"
					id="signature-method-tab-id-card"
					name="signature-method-tab"
					value="id-card"
					style="display: none"
				/>

				<input
					type="radio"
					name="signature-method-tab"
					id="signature-method-tab-mobile-id"
					value="mobile-id"
					style="display: none"
				/>

				<input
					type="radio"
					name="signature-method-tab"
					id="signature-method-tab-smart-id"
					value="smart-id"
					style="display: none"
				/>

				<div id="signature-methods">
					<label
						id="id-card-button"
						for="signature-method-tab-id-card"
						class="inherited-button"
					>
						<img
							src="/assets/id-kaart-button.png"
							title={t("BTN_VOTE_SIGN_WITH_ID_CARD")}
							alt={t("BTN_VOTE_SIGN_WITH_ID_CARD")}
						/>
					</label>

					<label
						for="signature-method-tab-mobile-id"
						class="inherited-button"
					>
						<img
							src="/assets/mobile-id-button.png"
							title={t("BTN_VOTE_SIGN_WITH_MOBILE_ID")}
							alt={t("BTN_VOTE_SIGN_WITH_MOBILE_ID")}
						/>
					</label>

					{Config.smartId ? <label
						for="signature-method-tab-smart-id"
						class="inherited-button"
					>
						<img
							src="/assets/smart-id-button.svg"
							title={t("BTN_VOTE_SIGN_WITH_SMART_ID")}
							alt={t("BTN_VOTE_SIGN_WITH_SMART_ID")}
						/>
					</label> : null}
				</div>

				<Form
					req={req}
					id="mobile-id-form"
					class="signature-form"
					method="post"
					action="/demo-signatures">
					<label class="form-label">
						{t("LABEL_PHONE_NUMBER")}

						<input
							type="tel"
							name="phoneNumber"
							placeholder={t("PLACEHOLDER_PHONE_NUMBER")}
							required
							class="form-input"
						/>
					</label>

					<label class="form-label">
						{t("LABEL_PERSONAL_ID")}

						<input
							type="text"
							pattern="[0-9]*"
							inputmode="numeric"
							name="personalId"
							placeholder={t("PLACEHOLDER_PERSONAL_ID")}
							required
							class="form-input"
						/>
					</label>

					<button
						name="method"
						value="mobile-id"
						class="button green-button">
						{t("BTN_VOTE_SIGN_WITH_MOBILE_ID")}
					</button>
				</Form>

				{Config.smartId ? <Form
					req={req}
					id="smart-id-form"
					class="signature-form"
					method="post"
					action="/demo-signatures">
					<label class="form-label">
						{t("LABEL_PERSONAL_ID")}

						<input
							type="text"
							pattern="[0-9]*"
							inputmode="numeric"
							name="personalId"
							placeholder={t("PLACEHOLDER_PERSONAL_ID")}
							required
							class="form-input"
						/>
					</label>

					<button
						name="method"
						value="smart-id"
						class="green-button">
						{t("BTN_VOTE_SIGN_WITH_SMART_ID")}
					</button>
				</Form> : null}
			</div>
		</center></section>
	</Page>
}
