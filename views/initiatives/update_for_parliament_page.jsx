/** @jsx Jsx */
var Jsx = require("j6pack")
var {Form} = require("../page")
var InitiativePage = require("./initiative_page")

module.exports = function(attributes) {
	var {req} = attributes
	var {t} = attributes
	var {initiative} = attributes
	var {error} = attributes
	var {attrs} = attributes

	return <InitiativePage
		page="initiative-send-to-parliament"
		title={initiative.title}
		initiative={initiative}
		req={req}>
		<section class="primary-section text-section"><center>
			<h2>{initiative.destination == "parliament"
				? t("SEND_TO_PARLIAMENT_HEADER")
				: t("SEND_TO_LOCAL_GOVERNMENT_HEADER")
			}</h2>

			<p>{initiative.destination == "parliament"
				? Jsx.html(t("SEND_TO_PARLIAMENT_TEXT"))
				: Jsx.html(t("SEND_TO_LOCAL_GOVERNMENT_TEXT"))
			}</p>

			{error ? <p class="flash error">{error}</p> : null}

			<Form
				req={req}
				method="put"
				action={"/initiatives/" + initiative.id}
				class="form"
			>
				<label class="form-label">{t("LBL_FULL_NAME")}</label>
				<input
					type="text"
					name="contact[name]"
					value={attrs.contact.name}
					required
					class="form-input"
				/>

				<label class="form-label">{t("LBL_EMAIL")}</label>
				<input
					type="email"
					name="contact[email]"
					value={attrs.contact.email}
					required
					class="form-input"
				/>

				<label class="form-label">{t("PLACEHOLDER_PHONE_NUMBER")}</label>
				<input
					type="tel"
					name="contact[phone]"
					value={attrs.contact.phone}
					required
					class="form-input"
				/>

				<button
					name="status"
					value="followUp"
					class="form-submit primary-button">
					{initiative.destination == "parliament"
						? t("SEND_TO_PARLIAMENT")
						: t("SEND_TO_LOCAL_GOVERNMENT")
					}
				</button>
			</Form>
		</center></section>
	</InitiativePage>
}
