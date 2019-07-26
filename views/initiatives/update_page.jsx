/** @jsx Jsx */
var Jsx = require("j6pack")
var Fragment = Jsx.Fragment
var InitiativePage = require("./initiative_page")
var Topic = require("root/lib/topic")
var Flash = require("../page").Flash
var javascript = require("root/lib/jsx").javascript

module.exports = function(attrs) {
	var req = attrs.req
	var initiative = attrs.initiative
	var flash = attrs.flash
	var t = attrs.t

	return <InitiativePage
		page="edit-initiative"
		title={initiative.title}
		initiative={initiative}
		req={req}>
		<section id="initiative-section" class="transparent-section"><center>
			<div id="initiative-sheet">
				<Flash flash={flash} />

				{Topic.canEditBody(initiative) ? <Fragment>
					<iframe
						id="initiative-etherpad"
						src={Topic.getEtherpadUrl(initiative)}
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
				</Fragment> : <Fragment>
					<div class="initiative-status">
						<h1>{t("CANNOT_EDIT_INITIATIVE_TEXT")}</h1>
					</div>

					<article class="text">{Jsx.html(initiative.html)}</article>
				</Fragment>}
			</div>

			<aside id="initiative-sidebar">
				<div class="sidebar-section">
					<a
						href={"/initiatives/" + initiative.id}
						class="blue-button wide-button">
						{Topic.isDiscussion(initiative)
							? t("BACK_TO_DISCUSSION")
							: t("BACK_TO_INITIATIVE")
						}
					</a>
				</div>
			</aside>
		</center></section>
	</InitiativePage>
}
