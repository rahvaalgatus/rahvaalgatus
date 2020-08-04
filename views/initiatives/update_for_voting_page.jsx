/** @jsx Jsx */
var Jsx = require("j6pack")
var Form = require("../page").Form
var I18n = require("root/lib/i18n")
var DatePickerInput = require("../page").DatePickerInput
var InitiativePage = require("./initiative_page")
var Initiative = require("root/lib/initiative")
var formatIso = require("root/lib/i18n").formatDate.bind(null, "iso")
var LANGUAGES = require("root/config").languages

module.exports = function(attributes) {
	var req = attributes.req
	var t = attributes.t
	var initiative = attributes.initiative
	var error = attributes.error
	var attrs = attributes.attrs
	var texts = attributes.texts
	var min = Initiative.getMinDeadline(initiative.signing_started_at || new Date)
	var max = Initiative.getMaxDeadline(new Date)
	var initiativePath = `/initiatives/${initiative.uuid}`

	return <InitiativePage
		page="initiative-send-to-voting"
		title={initiative.title}
		initiative={initiative}
		req={req}>
		<script src="/assets/inputs.js" />

		<section class="initiative-section transparent-section"><center>
			<Form
				req={req}
				id="initiative-form"
				method="put"
				action={"/initiatives/" + initiative.uuid}
				class="initiative-sheet">
				<h2>{initiative.phase == "edit"
					? t("INITIATIVE_SEND_TO_SIGN_TITLE")
					: t("INITIATIVE_UPDATE_SIGNING_DEADLINE")
				}</h2>

				{error ? <p class="flash error">{error}</p> : null}

				{initiative.phase == "edit" ? <fieldset class="text-fields">
					<p>
						{Jsx.html(t("INITIATIVE_SEND_TO_SIGN_CHOOSE_LANGUAGE_DESCRIPTION"))}
					</p>

					{LANGUAGES.map(function(lang) {
						var text = texts[lang]
						if (text == null) return null

						return <label
							class="text-field form-radio"
						>
							<input
								type="radio"
								name="language"
								value={lang}
								checked={initiative.language == lang}
							/>

							<p>
								<strong>{text.title}</strong>
								<br />

								{t("IN_" + lang.toUpperCase())}.
								{" "}
								Viimati muudetud {
									I18n.formatDateTime("numeric", text.created_at)
								}. <a href={initiativePath + "/edit?language=" + lang}>
									{t("INITIATIVE_SEND_TO_SIGN_VIEW_INITIATIVE")}
								</a>.
							</p>
							</label>
					})}
				</fieldset> : null}

				<h3>{t("INITIATIVE_SIGNING_DEADLINE_TITLE")}</h3>

				<DatePickerInput
					type="date"
					name="endsAt"
					min={formatIso(min)}
					max={formatIso(max)}
					value={formatIso(attrs.endsAt || min)}
					required
					class="form-input"
				/>

				<button name="status" value="voting" class="form-submit primary-button">
					{t("BTN_CREATE_VOTE")}
				</button>
			</Form>
		</center></section>
	</InitiativePage>
}
