/** @jsx Jsx */
var Jsx = require("j6pack")
var {Form} = require("../page")
var I18n = require("root/lib/i18n")
var DateFns = require("date-fns")
var Initiative = require("root/lib/initiative")
var InitiativePage = require("./initiative_page")
var {DatePickerInput} = require("../page")
var formatIso = require("root/lib/i18n").formatDate.bind(null, "iso")
var LANGUAGES = require("root").config.languages

module.exports = function(attributes) {
	var {req} = attributes
	var {t} = attributes
	var {initiative} = attributes
	var {error} = attributes
	var {attrs} = attributes
	var {texts} = attributes
	var initiativePath = Initiative.path(initiative)

	var startedAt = initiative.signing_started_at || new Date
	var minOn = DateFns.addDays(Initiative.getMinSigningDeadline(startedAt), -1)

	var endsOn = attrs.endsAt
		? DateFns.addMilliseconds(attrs.endsAt, -1)
		: minOn

	var maxOn = DateFns.addDays(Initiative.getMaxSigningDeadline(startedAt), -1)

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
				action={"/initiatives/" + initiative.id}
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
				<p>{Jsx.html(t("INITIATIVE_SEND_TO_SIGN_DESCRIPTION"))}</p>

				<DatePickerInput
					type="date"
					name="endsOn"
					min={formatIso(minOn)}
					max={formatIso(maxOn)}
					value={formatIso(endsOn || minOn)}
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
