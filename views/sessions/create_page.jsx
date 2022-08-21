/** @jsx Jsx */
var Jsx = require("j6pack")
var Page = require("../page")
var {Form} = require("../page")
var {Flash} = require("../page")
var Config = require("root").config

module.exports = function(attrs) {
	var {t} = attrs
	var {req} = attrs
	var {flash} = attrs

	return <Page page="create-session" title={t("SIGNIN_PAGE_TITLE")} req={req}>
		<script src="/assets/html5.js" />
		<script src="/assets/hwcrypto.js" />

		<section class="transparent-section text-section"><center>
			<h1>{t("SIGNIN_PAGE_TITLE")}</h1>

			<Flash flash={flash} />

			<div id="signin-forms">
				<Form req={req} id="id-card-form" method="post" action="/sessions">
					<h2>
						<img src="/assets/id-card.svg" />
						Id-kaart
					</h2>

					<button
						name="method"
						value="id-card"
						formaction={Config.idCardAuthenticationUrl + "/sessions"}
						class="secondary-button">
						Logi sisse Id-Kaardiga
					</button>

					{
						// This flash is for the the Id-card JavaScript code below.
					}
					<p id="id-card-flash" class="flash error" />
				</Form>

				<Form req={req} id="mobile-id-form" method="post" action="/sessions">
					<h2>
						<img src="/assets/mobile-id.svg" />
						Mobiil-Id
					</h2>

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
						class="secondary-button">
						Logi sisse Mobiil-Id-ga
					</button>
				</Form>

				{Config.smartId ? <Form
					req={req}
					id="smart-id-form"
					method="post"
					action="/sessions"
				>
					<h2>
						<img src="/assets/smart-id.svg" />
						Smart-Id
					</h2>

					<label class="form-label">
						Isikukood

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
						class="secondary-button">
						Logi sisse Smart-Id-ga
					</button>
				</Form> : null}
			</div>
		</center></section>
	</Page>
}
