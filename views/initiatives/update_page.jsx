/** @jsx Jsx */
var Jsx = require("j6pack")
var Fragment = Jsx.Fragment
var InitiativePage = require("./initiative_page")
var Form = require("../page").Form
var Flash = require("../page").Flash
var javascript = require("root/lib/jsx").javascript
var {normalizeCitizenOsHtml} = require("root/lib/initiative")

module.exports = function(attrs) {
	var req = attrs.req
	var initiative = attrs.initiative
	var flash = attrs.flash
	var text = attrs.text
	var t = attrs.t

	return <InitiativePage
		page="edit-initiative"
		title={initiative.title}
		initiative={initiative}
		headerless
		req={req}>
		<Form
			id="initiative-form"
			method="post"
			action={`/initiatives/${initiative.uuid}/texts`}
			req={req}
			class="initiative-section transparent-section"
		><center>
			<div id="initiative-sheet" class="sheet">
				<Flash flash={flash} />

				{initiative.phase == "edit" ? <Fragment>
					<script src="/assets/html5.js" />
					<script src="/assets/editor.js" />

					<input type="hidden" name="basis-id" value={text && text.id} />

					<input
						type="text"
						name="title"
						value={text && text.title || initiative.title}
						required
						maxlength="200"
					/>

					{
						// Pass the text through an <input> to rely on the browser's form
						// input restoration when navigating back. Otherwise the person
						// would be shown the pre-edited text again.
					}
					<input
						type="hidden"
						name="content"
						value={text && JSON.stringify(serializeText(text))}
					/>

					<trix-editor id="editor" class="text trix-content" />

					<script>{javascript`
						var Trix = require("trix")
						Trix.config.blockAttributes.heading1.tagName = "h2";

						var form = document.getElementById("initiative-form")
						// Don't get the "editor" property yet as it'll only exist after
						// initialization.
						var el = document.getElementById("editor")
						var loadedDocument

						el.addEventListener("trix-file-accept", function(ev) {
							ev.preventDefault()
						})

						// Trix-initialize is likely to be triggered even when "back"-ing
						// into this page. However, as we keep the serialized text in an
						// <input> element, that's restored by the browser.
						el.addEventListener("trix-initialize", function(ev) {
							var content = form.elements.content.value
							content = content ? JSON.parse(content) : null

							if (typeof content == "string")
								el.editor.loadHTML(content)
							else if (content)
								el.editor.loadJSON({document: content, selectedRange: [0, 0]})

							loadedDocument = el.editor.getDocument()
						})

						window.onbeforeunload = function() {
							if (loadedDocument == null) return undefined
							if (loadedDocument === el.editor.getDocument()) return undefined
							return ${JSON.stringify(t("INITIATIVE_TEXT_UNSAVED"))}
						}

						form.addEventListener("submit", function() {
							var editor = document.querySelector("trix-editor").editor
							var json = JSON.stringify(editor.getDocument())
							form.elements.content.value = json
							window.onbeforeunload = null
						})
					`}</script>
				</Fragment> : <Fragment>
					<div class="initiative-status">
						<h1>{t("CANNOT_EDIT_INITIATIVE_TEXT")}</h1>
					</div>
				</Fragment>}
			</div>

			<aside id="initiative-sidebar">
				<div class="sidebar-section">
					{initiative.phase == "edit" ? <Fragment>
						<button
							id="create-text-button"
							type="submit"
							href={"/initiatives/" + initiative.uuid}
							class="green-button wide-button">
							{t("INITIATIVE_SAVE")}
						</button>
					</Fragment> : null}

					<a
						href={"/initiatives/" + initiative.uuid}
						class="blue-button wide-button">
						{t("INITIATIVE_CANCEL_UPDATE")}
					</a>
				</div>
			</aside>
		</center></Form>
	</InitiativePage>
}

function serializeText(text) {
	switch (String(text.content_type)) {
		case "text/html": return text.content
		case "application/vnd.basecamp.trix+json": return text.content

		case "application/vnd.citizenos.etherpad+html":
			return normalizeCitizenOsHtml(text.content)

		default:
			throw new RangeError("Unsupported content type: " + text.content_type)
	}
}
