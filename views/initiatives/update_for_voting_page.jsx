/** @jsx Jsx */
var Jsx = require("j6pack")
var Form = require("../page").Form
var DatePickerInput = require("../page").DatePickerInput
var InitiativePage = require("./initiative_page")
var Topic = require("root/lib/topic")
var formatIso = require("root/lib/i18n").formatDate.bind(null, "iso")

module.exports = function(attributes) {
	var req = attributes.req
	var t = attributes.t
	var initiative = attributes.initiative
	var error = attributes.error
	var attrs = attributes.attrs
	var min = Topic.getMinDeadline(new Date)
	var max = Topic.getMaxDeadline(new Date)

	return <InitiativePage
		page="initiative-send-to-voting"
		title={initiative.title}
		initiative={initiative}
		req={req}>
		<script src="/assets/inputs.js" />

		<section class="primary-section text-section"><center>
			<h2>{t("DEADLINE_TITLE")}</h2>
			<p>{t("VOTE_DEADLINE_EXPLANATION")}</p>

			{error ? <p class="flash error">{error}</p> : null}

			<Form
				req={req}
				id="initiative-form"
				method="put"
				action={"/initiatives/" + initiative.uuid}
				class="form">
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
