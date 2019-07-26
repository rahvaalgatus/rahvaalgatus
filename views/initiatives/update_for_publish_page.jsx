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
		page="initiative-publish"
		title={initiative.title}
		initiative={initiative}
		req={req}>
		<script src="/assets/inputs.js" />

		<section class="primary-section text-section"><center>
			<h2>{t("DEADLINE_TITLE")}</h2>
			<p>{t("DEADLINE_EXPLANATION")}</p>

			{error ? <p class="flash error">{error}</p> : null}

			<Form
				req={req}
				method="put"
				action={"/initiatives/" + initiative.id}
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

				<button
					name="visibility"
					value="public"
					class="form-submit primary-button">
					{t("PUBLISH_TOPIC")}
				</button>
			</Form>
		</center></section>
	</InitiativePage>
}
