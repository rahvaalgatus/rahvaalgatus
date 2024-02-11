/** @jsx Jsx */
var Jsx = require("j6pack")
var {Form} = require("../page")
var DateFns = require("date-fns")
var {DatePickerInput} = require("../page")
var InitiativePage = require("./initiative_page")
var Initiative = require("root/lib/initiative")
var formatIso = require("root/lib/i18n").formatDate.bind(null, "iso")

module.exports = function(attributes) {
	var {req} = attributes
	var {t} = attributes
	var {initiative} = attributes
	var {error} = attributes
	var {attrs} = attributes

	var publishedAt = initiative.published_at || new Date
	var minOn = DateFns.addDays(Initiative.getMinEditingDeadline(publishedAt), -1)
	var endsOn = attrs.endsAt ? DateFns.addMilliseconds(attrs.endsAt, -1) : minOn

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
				action={"/initiatives/" + initiative.id}
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
					name="endsOn"
					min={formatIso(minOn)}
					value={formatIso(endsOn || minOn)}
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

					{Jsx.html(t("I_HAVE_READ", {tosUrl: "/about#tos"}))}
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
