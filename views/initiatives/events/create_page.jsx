/** @jsx Jsx */
var Jsx = require("j6pack")
var {Form} = require("../../page")
var {Section} = require("../../page")
var {Fragment} = require("j6pack")
var InitiativePage = require("../initiative_page")
var {selected} = require("root/lib/css")

module.exports = function(attributes) {
	var req = attributes.req
	var t = req.t
	var initiative = attributes.initiative
	var error = attributes.error
	var event = attributes.event
	var subscriberCount = attributes.subscriberCount
	var path = req.baseUrl + req.path

	return <InitiativePage
		page="create-initiative-event"
		title={initiative.title}
		initiative={initiative}
		req={req}>
		<Section class="initiative-section transparent-section">
			<div class="initiative-sheet">
				<h2>{t("CREATE_INITIATIVE_EVENT_PAGE_TITLE")}</h2>
				<p>{t("CREATE_INITIATIVE_EVENT_PAGE_DESCRIPTION")}</p>

				<menu id="event-type-tabs">
					<a
						class={selected(event.type, "text")}
						href={path + "?type=text"}
					>
						Üldine
					</a>

					<a
						class={selected(event.type, "media-coverage")}
						href={path + "?type=media-coverage"}
					>
						Meediakajastus
					</a>
				</menu>

				{error ? <p class="flash error">{error}</p> : null}

				<Form
					id="tab"
					req={req}
					method="post"
					action={"/initiatives/" + initiative.uuid + "/events"}
					class="form">
					<input type="hidden" name="type" value={event.type} />

					{function() {
						switch (event.type) {
							case "text": return <Fragment>
								<label class="form-label">
									{t("INITIATIVE_TEXT_EVENT_TITLE_INPUT")}
								</label>

								<input
									name="title"
									required
									autofocus
									class="form-input"
								/>

								<label class="form-label">
									{t("INITIATIVE_TEXT_EVENT_TEXT_INPUT")}
								</label>

								<textarea
									class="form-textarea"
									name="content"
									required
									maxlength="10000"
								/>
							</Fragment>

							case "media-coverage": return <Fragment>
								<label class="form-label">
									{t("INITIATIVE_MEDIA_COVERAGE_EVENT_TITLE_INPUT")}
								</label>

								<input
									name="title"
									required
									autofocus
									class="form-input"
								/>

								<label class="form-label">
									{t("INITIATIVE_MEDIA_COVERAGE_EVENT_PUBLISHER_INPUT")}
								</label>

								<input
									name="publisher"
									required
									class="form-input"
								/>

								<label class="form-label">
									{t("INITIATIVE_MEDIA_COVERAGE_EVENT_URL_INPUT")}
								</label>

								<input
									name="url"
									type="url"
									required
									class="form-input"
								/>
							</Fragment>

							default:
								throw new RangeError("Unsupported event type: " + event.type)
						}
					}()}

					<button class="form-submit primary-button">
						{t("CREATE_INITIATIVE_EVENT_BUTTON")}
					</button>

					<p class="form-epilogue">
						Menetlusinfo kohta saadetakse teavitus ka <strong>{subscriberCount}</strong>-le jälgijale.
					</p>
				</Form>
			</div>
		</Section>
	</InitiativePage>
}
