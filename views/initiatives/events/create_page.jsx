/** @jsx Jsx */
var Jsx = require("j6pack")
var Form = require("../../page").Form
var InitiativePage = require("../initiative_page")

module.exports = function(attributes) {
	var req = attributes.req
	var t = req.t
	var initiative = attributes.initiative
	var error = attributes.error
	var attrs = attributes.attrs
	var subscriberCount = attributes.subscriberCount

	return <InitiativePage
		page="create-initiative-event"
		title={initiative.title}
		initiative={initiative}
		req={req}>
		<section class="primary-section text-section">
			<center>
				<h2>{t("CREATE_INITIATIVE_EVENT_PAGE_TITLE")}</h2>
				<p>{t("CREATE_INITIATIVE_EVENT_PAGE_DESCRIPTION")}</p>

				{error ? <p class="flash error">{error}</p> : null}

				<Form
					req={req}
					method="post"
					action={"/initiatives/" + initiative.id + "/events"}
					class="form">
					<label class="form-label">{t("INITIATIVE_EVENT_TITLE_INPUT")}</label>
					<input
						name="title"
						value={attrs.title}
						required
						autofocus
						class="form-input"
					/>

					<label class="form-label">{t("INITIATIVE_EVENT_TEXT_INPUT")}</label>
					<textarea
						name="content"
						required
						maxlength={10000}
						class="form-textarea">
						{attrs.content}
					</textarea>

					<button class="form-submit primary-button">
						{t("CREATE_INITIATIVE_EVENT_BUTTON")}
					</button>

					<p class="form-epilogue">
						Menetlusinfo kohta saadetakse teavitus ka <strong>{subscriberCount}</strong>-le jälgijale.
					</p>
				</Form>
			</center>
		</section>
	</InitiativePage>
}
