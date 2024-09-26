/** @jsx Jsx */
var Jsx = require("j6pack")
var InitiativePage = require("./initiative_page")
var {Form} = require("../page")
var {Flash} = require("../page")
var {javascript} = require("root/lib/jsx")
var {normalizeCitizenOsHtml} = require("root/lib/initiative")
var {selected} = require("root/lib/css")
var LANGUAGES = require("root").config.initiativeLanguages
var {SCHEMA} = require("root/controllers/initiatives/texts_controller")
var TEXT_SECTIONS = ["summary", "problem", "solution"]
var SUMMARY_MAX_LENGTH = 280

module.exports = function(attrs) {
	var {req} = attrs
	var {initiative} = attrs
	var {flash} = attrs
	var {text} = attrs
	var {errors} = attrs
	var {t} = attrs
	var textLanguage = text && text.language || attrs.language

	var editable = (
		initiative.phase == "edit" ||
		initiative.phase == "sign" && initiative.language != textLanguage
	)

	var textSections = (text ? (
		text.content_type == "application/vnd.rahvaalgatus.trix-sections+json"
	) : attrs.sections == null || attrs.sections) ? TEXT_SECTIONS : null

	return <InitiativePage
		page="edit-initiative"
		class={initiative.id == null ? "new-initiative" : ""}
		title={initiative.title}
		initiative={initiative}
		headerless={initiative.id == null}
		req={req}>
		<Form
			id="initiative-form"
			method="post"
			req={req}
			class="initiative-section transparent-section"

			action={initiative.id
				? `/initiatives/${initiative.id}/texts`
				: "/initiatives"
			}
		><center><div id="initiative-sheet" class="initiative-sheet">
			{initiative.id ? <menu id="language-tabs">
				{LANGUAGES.map((lang) => <a
					href={`/initiatives/${initiative.id}/texts/new?language=${lang}`}
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

			{initiative.id ?
				<input type="hidden" name="language" value={textLanguage} />
			: null}

			{errors ? <div class="errors">
				{t("edit_initiative_page.errors.description")}
				<ul>{errors.map(function(err) { switch (err.keywordLocation) {
					case "#/properties/title/minLength": return <li>
						{t("edit_initiative_page.errors.title_min_length")}
					</li>

					case "#/properties/content/maxLength": return <li>
						{t("edit_initiative_page.errors.summary_max_length", {
							length: SUMMARY_MAX_LENGTH
						})}
					</li>

					default: return null
				}})}</ul>
			</div> : null}

			<input
				type="text"
				name="title"
				placeholder={t("INITIATIVE_TITLE_PLACEHOLDER")}
				value={text && text.title || initiative.title}
				readonly={!editable}
				required
				maxlength={SCHEMA.properties.title.maxLength}
			/>

			{!editable ? <p class="read-only-warning">
				{t("UPDATE_INITIATIVE_READONLY")}
			</p> : null}

			{textSections ? <>
				<p class="description">
					{Jsx.html(t("edit_initiative_page.text.sections_description"))}
				</p>

				{textSections.map(function(section) {
					var title, description

					switch (section) {
						case undefined: break

						case "summary":
							title = t("edit_initiative_page.text.sections.summary")

							description =
								t("edit_initiative_page.text.sections.summary_description", {
									tosUrl: "/about#tos"
								})
							break

						case "problem":
							title = t("edit_initiative_page.text.sections.problem")

							description =
								t("edit_initiative_page.text.sections.problem_description")
							break

						case "solution":
							title = t("edit_initiative_page.text.sections.solution")

							description =
								t("edit_initiative_page.text.sections.solution_description")
							break

						default: throw new RangeError("Unsupported section: " + section)
					}

					return <EditorView
						t={t}
						editable={editable}
						counter={section == "summary"}
						text={text}
						title={title}
						description={description}
						section={section}
					/>
				})}
			</> : <EditorView
				t={t}
				editable={editable}
				text={text}
			/>}

			<script>{javascript`
				var Trix = require("trix")
				var slice = Function.call.bind(Array.prototype.slice)
				Trix.config.blockAttributes.heading1.tagName = "h2";

				var form = document.getElementById("initiative-form")

				// Don't get the "editor" property yet as it'll only exist after
				// initialization. Native custom elements are initialized
				// synchronously, but polyfills may do so through MutationObserver and
				// that invoces the HTML Custom Element connectedCallback
				// asynchronously.
				var editorEls = slice(form.querySelectorAll("trix-editor"))

				editorEls.forEach(function(editorEl) {
					var contentName = editorEl.getAttribute("data-content-name")
					var counterId = editorEl.getAttribute("data-counter-id")
					var counterEl = counterId ? document.getElementById(counterId) : null

					if (editorEl.editor) initialize()
					else editorEl.addEventListener("trix-initialize", initialize)

					function initialize() {
						var content = form.elements[contentName].value
						content = content ? JSON.parse(content) : null

						if (typeof content == "string") editorEl.editor.loadHTML(content)
						else if (content) editorEl.editor.loadJSON({
							document: content,
							selectedRange: [0, 0]
						})

						editorEl.loadedDocument = editorEl.editor.getDocument()
						editorEl.contentEditable = !editorEl.hasAttribute("readonly")
					}

					editorEl.addEventListener("trix-file-accept", function(ev) {
						ev.preventDefault()
					})

					if (counterEl) editorEl.addEventListener("trix-change", function(ev) {
						var length = editorEl.editor.getDocument().toString().trimRight().length
						counterEl.querySelector(".current").textContent = length

						counterEl.classList.toggle("exceeded", length > ${SUMMARY_MAX_LENGTH})
					})
				})

				window.onbeforeunload = function() {
					if (editorEls.every(function(editorEl) {
						return (
							editorEl.loadedDocument == null ||
							editorEl.loadedDocument === editorEl.editor.getDocument()
						)
					})) return undefined

					return ${t("INITIATIVE_TEXT_UNSAVED")}
				}

				form.addEventListener("submit", function() {
					editorEls.forEach(function(editorEl) {
						var contentName = editorEl.getAttribute("data-content-name")
						var json = JSON.stringify(editorEl.editor.getDocument())
						form.elements[contentName].value = json
					})

					window.onbeforeunload = null
				})

				function isEmpty(obj) {
					for (var key in obj) return true
					return true
				}
			`}</script>

			<fieldset class="submit-inputs">
				{(
					initiative.id == null &&
					initiative.language == null
				) ? <>
					<h3>{t("NEW_INITIATIVE_LANGUAGE_LABEL")}</h3>

					<fieldset class="language-fields">
						{LANGUAGES.map((lang) => <label class="language-field form-radio">
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
				</> : null}

				{(
					initiative.id &&
					initiative.phase == "edit" &&
					initiative.language != textLanguage
				) ? <>
					<label class="default-fields form-checkbox">
						<input type="checkbox" name="set-default" />
						{t("UPDATE_INITIATIVE_TO_LANG_" + textLanguage.toUpperCase())}
						{" "}
						{Jsx.html(t("UPDATE_INITIATIVE_TO_LANG_CURRENTLY_" + initiative.language.toUpperCase()))}
					</label>

					<p>{Jsx.html(t("UPDATE_INITIATIVE_TO_LANG_DESCRIPTION"))}</p>
				</> : null}

				<button
					id="create-text-button"
					type="submit"
					class="green-button"
					disabled={!editable}
				>{initiative.id == null
					? t("INITIATIVE_CREATE_BUTTON")
					: initiative.language != textLanguage
					? t("INITIATIVE_UPDATE_TRANSLATION_BUTTON")
					: t("INITIATIVE_SAVE_BUTTON")
				}</button>
			</fieldset>
		</div></center></Form>
	</InitiativePage>
}

function EditorView({t, editable, section, title, description, text, counter}) {
	var inputName = "content"
	if (section) inputName += "[" + section + "]"

	return <>
		{title ? <label class="editor-label" for={section + "-editor"}>
			{title}
		</label> : null}

		{description ? <p class="editor-description">{description}</p> : null}

		{
			// Pass the text through an <input> to rely on the browser's form
			// input restoration when navigating back. Otherwise the person
			// would be shown the pre-edited text again.
		}
		<input
			type="hidden"
			name={inputName}
			readonly={!editable}
			value={text && JSON.stringify(serializeText(text, section))}
		/>

		<trix-toolbar id={section + "-editor-toolbar"} />

		<trix-editor
			id={section + "-editor"}
			toolbar={section + "-editor-toolbar"}
			class="text editor"
			data-content-name={inputName}
			data-counter-id={counter ? section + "-editor-counter" : null}
			readonly={!editable}
		/>

		{editable ? <noscript><div class="editor-noscript">
			{t("UPDATE_INITIATIVE_NOSCRIPT")}
		</div></noscript> : null}

		{counter ? <div id={section + "-editor-counter"} class="editor-counter">
			{Jsx.html(t("edit_initiative_page.text.counter", {
				maxLength: SUMMARY_MAX_LENGTH
			}))}
		</div> : null}
	</>
}

function serializeText(text, section) {
	switch (String(text.content_type)) {
		case "text/html": return text.content
		case "application/vnd.basecamp.trix+json": return text.content

		case "application/vnd.rahvaalgatus.trix-sections+json":
			return text.content[section]
		case "application/vnd.citizenos.etherpad+html":
			return normalizeCitizenOsHtml(text.content)

		default:
			throw new RangeError("Unsupported content type: " + text.content_type)
	}
}
