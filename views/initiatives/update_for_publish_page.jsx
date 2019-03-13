/** @jsx Jsx */
var _ = require("lodash")
var Jsx = require("j6pack")
var Fragment = Jsx.Fragment
var Form = require("../page").Form
var InitiativePage = require("./initiative_page")
var Initiative = require("root/lib/initiative")
var javascript = require("root/lib/jsx").javascript
var formatIso = require("root/lib/i18n").formatDate.bind(null, "iso")

module.exports = function(attributes) {
	var req = attributes.req
	var t = attributes.t
	var initiative = attributes.initiative
	var error = attributes.error
	var attrs = attributes.attrs
	var min = Initiative.getMinDeadline(new Date)
	var max = Initiative.getMaxDeadline(new Date)

	return <InitiativePage
		page="initiative"
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
				id="initiative-form"
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

function DatePickerInput(attrs) {
	var name = attrs.name
	var id = _.uniqueId("date-picker-")

	return <Fragment>
		<input {...attrs} />

		<div id={id} class="form-date-picker">
			<script>{javascript`
				var Pikaday = require("pikaday")
				var input = document.querySelector("input[name=${name}]")

				new Pikaday({
					firstDay: 1,
					field: input,
					minDate: input.min ? new Date(input.min) : null,
					maxDate: input.max ? new Date(input.max) : null,
					container: document.getElementById("${id}"),
					bound: false,
				})

			`}</script>
		</div>
	</Fragment>
}
