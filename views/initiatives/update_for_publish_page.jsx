/** @jsx Jsx */
var Jsx = require("j6pack")
var Form = require("../page").Form
var DatePickerInput = require("../page").DatePickerInput
var InitiativePage = require("./initiative_page")
var Initiative = require("root/lib/initiative")
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
		page="initiative-publish"
		title={initiative.title}
		initiative={initiative}
		req={req}>
		<script src="/assets/inputs.js" />

		<section class="initiative-section transparent-section"><center>
			<Form
				req={req}
				method="put"
				action={"/initiatives/" + initiative.uuid}
				class="initiative-sheet"
			>
				<h2>{initiative.published_at == null
					? t("INITIATIVE_PUBLISH_TITLE")
					: t("INITIATIVE_UPDATE_DISCUSSION_DEADLINE")
				}</h2>

				{error ? <p class="flash error">{error}</p> : null}

				<p>{t("INITIATIVE_DISCUSSION_DEADLINE_EXPLANATION")}</p>

				<DatePickerInput
					type="date"
					name="endsAt"
					min={formatIso(min)}
					max={formatIso(max)}
					value={formatIso(attrs.endsAt || min)}
					required
					class="form-input"
				/>

				{initiative.published_at == null ? <label
					class="form-checkbox accept-tos-input">
					<input
						type="checkbox"
						name="accept-tos"
						checked={!!initiative.published_at}
						required
					/>

					{Jsx.html(t("I_HAVE_READ", {url: "/about#tos"}))}
				</label> : null}

				<button
					name="visibility"
					value="public"
					class="form-submit primary-button">
					{initiative.published_at == null
						? t("PUBLISH_TOPIC")
						: t("UPDATE_EDIT_DEADLINE_BUTTON")
					}
				</button>
			</Form>
		</center></section>
	</InitiativePage>
}
