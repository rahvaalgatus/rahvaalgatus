/** @jsx Jsx */
var Jsx = require("j6pack")
var Fragment = Jsx.Fragment
var InitiativePage = require("./initiative_page")
var Initiative = require("root/lib/initiative")
var Form = require("../page").Form
var Flash = require("../page").Flash
var javascript = require("root/lib/jsx").javascript

module.exports = function(attrs) {
	var req = attrs.req
	var initiative = attrs.initiative
	var dbInitiative = attrs.dbInitiative
	var flash = attrs.flash
	var t = attrs.t
	var confirmText = t("TXT_ALL_DISCUSSIONS_AND_VOTES_DELETED")

	return <InitiativePage
		page="initiative"
		title={initiative.title}
		initiative={initiative}
		req={req}>
		<section id="initiative-section" class="transparent-section"><center>
			<div id="initiative-sheet">
				<Flash flash={flash} />

				{Initiative.canEditBody(initiative) ? <Fragment>
					<iframe
						id="initiative-etherpad"
						src={Initiative.getEtherpadUrl(initiative)}
						frameborder="0"
						scrolling="no"
					/>

					<script>{javascript`
						var el = document.getElementById("initiative-etherpad")

						window.addEventListener("message", function(ev) {
							switch (ev.data.name) {
								case "ep_resize":
									var height = ev.data.data.height
									if (el.offsetHeight != height) el.style.height = height + "px"
									break
							}
						})

						var scrolled
						window.addEventListener("scroll", function(ev) {
							clearTimeout(scrolled)
							scrolled = setTimeout(handleScroll, 100)
						})

						function handleScroll() {
							el.contentWindow.postMessage({
								name: "ep_embed_floating_toolbar_scroll",
								data: {
									scroll: {top: window.pageYOffset, left: window.pageXOffset},
									frameOffset: offsetTopFrom(el)
								}
							}, "*")

							function offsetTopFrom(el) {
								var offsets = {left: 0, top: 0}

								do {
									offsets.top += el.offsetTop
									offsets.left += el.offsetLeft
									el = el.offsetParent
								} while (el)

								return offsets
							}
						}
					`}</script>
				</Fragment> : <article class="text">
					{Jsx.html(initiative.html)}
				</article>}
			</div>

			<aside id="initiative-sidebar">
				<a
					href={"/initiatives/" + initiative.id}
					class="primary-button wide-button">
					{Initiative.isDiscussion(initiative)
						? t("BACK_TO_DISCUSSION")
						: t("BACK_TO_INITIATIVE")
					}
				</a>

				{Initiative.canUpdateDiscussionDeadline(initiative) ? <Form
					req={req}
					method="put"
					action={"/initiatives/" + initiative.id}>
					<button
						name="visibility"
						value="public"
						class="link-button wide-button">
						{t("RENEW_DEADLINE")}
					</button>
				</Form> : null}

				{Initiative.canUpdateVoteDeadline(initiative) ? <Form
					req={req}
					method="put"
					action={"/initiatives/" + initiative.id}>
					<button
						name="status"
						value="voting"
						class="link-button wide-button">
						{t("RENEW_DEADLINE")}
					</button>
				</Form> : null}

				{Initiative.canInvite(initiative) ? <a
					href={"/initiatives/" + initiative.id + "/authors/new"}
					class="link-button wide-button">
					{t("INVITE_PEOPLE")}
				</a> : null}

				{Initiative.canDelete(initiative) ? <Form
					req={req}
					method="post"
					action={"/initiatives/" + initiative.id}>
					<button
						name="_method"
						value="delete"
						onclick={"return confirm('" + confirmText + "')"}
						class="link-button wide-button">
						{t("DELETE_DISCUSSION")}
					</button>
				</Form> : null}

				<Form
					req={req}
					id="initiative-notes-form"
					method="put"
					action={"/initiatives/" + initiative.id}>
					<h2>{t("NOTES_HEADER")}</h2>

					<textarea name="notes" class="form-textarea">
						{dbInitiative.notes}
					</textarea>

					<button class="secondary-button wide-button">
						{t("UPDATE_NOTES")}
					</button>
				</Form>
			</aside>
		</center></section>
	</InitiativePage>
}
