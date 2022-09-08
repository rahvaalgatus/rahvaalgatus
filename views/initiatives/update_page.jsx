/** @jsx Jsx */
var Jsx = require("j6pack")
var {Fragment} = Jsx
var InitiativePage = require("./initiative_page")
var {Form} = require("../page")
var {Flash} = require("../page")
var {javascript} = require("root/lib/jsx")
var {normalizeCitizenOsHtml} = require("root/lib/initiative")
var {selected} = require("root/lib/css")
var LANGUAGES = require("root").config.languages
var {SCHEMA} = require("root/controllers/initiatives/texts_controller")

module.exports = function(attrs) {
	var {req} = attrs
	var {initiative} = attrs
	var {flash} = attrs
	var {text} = attrs
	var {t} = attrs
	var textLanguage = text && text.language || attrs.language
	var editUrl = req.baseUrl + "/new"

	var editable = (
		initiative.phase == "edit" ||
		initiative.phase == "sign" && initiative.language != textLanguage
	)

	return <InitiativePage
		page="edit-initiative"
		class={initiative.uuid == null ? "new-initiative" : ""}
		title={initiative.title}
		initiative={initiative}
		headerless={initiative.uuid == null}
		req={req}>
		<Form
			id="initiative-form"
			method="post"
			req={req}
			class="initiative-section transparent-section"

			action={initiative.uuid
				? `/initiatives/${initiative.uuid}/texts`
				: "/initiatives"
			}
		><center><div id="initiative-sheet" class="initiative-sheet">
			{initiative.uuid ? <menu id="language-tabs">
				{LANGUAGES.map((lang) => <a
					href={editUrl + "?language=" + lang}
					class={"tab " + selected(textLanguage, lang)}
				>{Jsx.html(initiative.language == lang
					? t("INITIATIVE_LANG_TAB_" + lang.toUpperCase())
					: t("INITIATIVE_LANG_TAB_TRANSLATION_" + lang.toUpperCase())
				)}</a>)}
			</menu> : null}

			<Flash flash={flash} />

			<script src="/assets/html5.js" />
			<script src="/assets/editor.js" />

			{text ?
				<input type="hidden" name="basis-id" value={text.id} />
			: null}

			{initiative.uuid ?
				<input type="hidden" name="language" value={textLanguage} />
			: null}

			<input
				type="text"
				name="title"
				placeholder={t("INITIATIVE_TITLE_PLACEHOLDER")}
				value={text && text.title || initiative.title}
				readonly={!editable}
				required
				maxlength={SCHEMA.properties.title.maxLength}
			/>

			{
				// Pass the text through an <input> to rely on the browser's form
				// input restoration when navigating back. Otherwise the person
				// would be shown the pre-edited text again.
			}
			<input
				type="hidden"
				name="content"
				readonly={!editable}
				value={text && JSON.stringify(serializeText(text))}
			/>

			{!editable ? <p class="read-only-warning">
				{t("UPDATE_INITIATIVE_READONLY")}
			</p> : null}

			<trix-editor
				id="editor"
				class="text trix-content"
				readonly={!editable}
			/>

			{editable ? <noscript><div id="editor-noscript">
				{t("UPDATE_INITIATIVE_NOSCRIPT")}
			</div></noscript> : null}

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

					el.contentEditable = !el.hasAttribute("readonly")
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

			<fieldset class="submit-inputs">
				{(
					initiative.uuid == null &&
					initiative.language == null
				) ? <Fragment>
					<h3>{t("NEW_INITIATIVE_LANGUAGE_LABEL")}</h3>

					<fieldset class="language-fields">
						{LANGUAGES.map((lang) => <label
							class="language-field form-radio"
						>
							<input
								type="radio"
								name="language"
								value={lang}
								checked={textLanguage == lang}
							/>

							{t("IN_" + lang.toUpperCase())}
						</label>)}
					</fieldset>

					<p>{Jsx.html(t("UPDATE_INITIATIVE_TO_LANG_DESCRIPTION"))}</p>
				</Fragment> : null}

				{(
					initiative.uuid &&
					initiative.phase == "edit" &&
					initiative.language != textLanguage
				) ? <Fragment>
					<label class="default-fields form-checkbox">
						<input type="checkbox" name="set-default" />
						{t("UPDATE_INITIATIVE_TO_LANG_" + textLanguage.toUpperCase())}
						{" "}
						{Jsx.html(t("UPDATE_INITIATIVE_TO_LANG_CURRENTLY_" + initiative.language.toUpperCase()))}
					</label>

					<p>{Jsx.html(t("UPDATE_INITIATIVE_TO_LANG_DESCRIPTION"))}</p>
				</Fragment> : null}

				<button
					id="create-text-button"
					type="submit"
					class="green-button"
					disabled={!editable}
				>{initiative.uuid == null
					? t("INITIATIVE_CREATE_BUTTON")
					: initiative.language != textLanguage
					? t("INITIATIVE_UPDATE_TRANSLATION_BUTTON")
					: t("INITIATIVE_SAVE_BUTTON")
				}</button>
			</fieldset>
		</div></center></Form>
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
