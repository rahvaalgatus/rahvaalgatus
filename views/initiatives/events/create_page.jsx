/** @jsx Jsx */
var Jsx = require("j6pack")
var {Form} = require("../../page")
var {Section} = require("../../page")
var {Fragment} = require("j6pack")
var InitiativePage = require("../initiative_page")
var {selected} = require("root/lib/css")

var {
	TEXT_EVENT_SCHEMA,
	MEDIA_COVERAGE_EVENT_SCHEMA
} = require("root/controllers/initiatives/events_controller")

module.exports = function(attributes) {
	var {req} = attributes
	var {t} = req
	var {initiative} = attributes
	var {error} = attributes
	var {event} = attributes
	var {subscriberCount} = attributes
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
									maxlength={TEXT_EVENT_SCHEMA.properties.title.maxLength}
								/>

								<label class="form-label">
									{t("INITIATIVE_TEXT_EVENT_TEXT_INPUT")}
								</label>

								<textarea
									class="form-textarea"
									name="content"
									required
									maxlength={
										TEXT_EVENT_SCHEMA.properties.content.maxLength
									}
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
									maxlength={
										MEDIA_COVERAGE_EVENT_SCHEMA.properties.title.maxLength
									}
								/>

								<label class="form-label">
									{t("INITIATIVE_MEDIA_COVERAGE_EVENT_PUBLISHER_INPUT")}
								</label>

								<input
									name="publisher"
									required
									class="form-input"
									maxlength={MEDIA_COVERAGE_EVENT_SCHEMA.properties.content.properties.publisher.maxLength}
								/>

								<label class="form-label">
									{t("INITIATIVE_MEDIA_COVERAGE_EVENT_URL_INPUT")}
								</label>

								<input
									name="url"
									type="url"
									required
									class="form-input"
									maxlength={MEDIA_COVERAGE_EVENT_SCHEMA.properties.content.properties.url.maxLength}
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
