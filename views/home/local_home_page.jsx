/** @jsx Jsx */
var Jsx = require("j6pack")
var {Fragment} = Jsx
var Page = require("../page")
var {Section} = require("../page")
var {Flash} = require("../page")
var {InitiativeBoxesView} = require("../initiatives/index_page")
var {CallToActionsView} = require("../home_page")
var {javascript} = require("root/lib/jsx")
var {groupInitiatives} = require("../home_page")

module.exports = function(attrs) {
	var {t} = attrs
	var {req} = attrs
	var {initiativeCounts} = attrs
	var initiativesByPhase = groupInitiatives(attrs.initiatives)

	return <Page page="local-home" req={req}>
		<script src="/assets/local.js" />

		<Section id="welcome" class="primary-section">
			<Flash flash={req.flash} />

			<h1>{t("LOCAL_HOME_PAGE_WELCOME_TITLE")}</h1>

			<p class="welcome-paragraph">
				{Jsx.html(t("LOCAL_HOME_PAGE_HEADER_TEXT"))}
			</p>

			<CallToActionsView req={req} t={t} />
		</Section>

		<Section id="map-section" class="secondary-section">
			<div id="map" />

			<ol id="map-legend">
				<li class="initiatives-legend">
					{t("LOCAL_HOME_PAGE_MAP_LEGEND_INITIATIVES")}
				</li>

				<li class="kompass-legend">
					{t("LOCAL_HOME_PAGE_MAP_LEGEND_KOMPASS")}
				</li>
			</ol>

			<script>{javascript`
				var Local = require("@rahvaalgatus/local")
				Local.newMap(document.getElementById("map"), ${initiativeCounts})
			`}</script>
		</Section>

		<Section id="initiatives" class="secondary-section initiatives-section">
			{initiativesByPhase.edit ? <Fragment>
				<h2>{t("EDIT_PHASE")}</h2>

				<InitiativeBoxesView
					t={t}
					phase="edit"
					id="initiatives-in-edit"
					initiatives={initiativesByPhase.edit}
				/>
			</Fragment> : null}

			{initiativesByPhase.sign ? <Fragment>
				<h2>{t("SIGN_PHASE")}</h2>

				<InitiativeBoxesView
					t={t}
					phase="sign"
					id="initiatives-in-sign"
					initiatives={initiativesByPhase.sign}
				/>
			</Fragment> : null}

			{initiativesByPhase.signUnsent ? <Fragment>
				<h2>{t("HOME_PAGE_SIGNED_TITLE")}</h2>

				<InitiativeBoxesView
					t={t}
					phase="sign"
					id="initiatives-in-sign-unsent"
					initiatives={initiativesByPhase.signUnsent}
				/>
			</Fragment> : null}

			{initiativesByPhase.government ? <Fragment>
				<h2>{t("GOVERNMENT_PHASE")}</h2>

				<InitiativeBoxesView
					t={t}
					phase="government"
					id="initiatives-in-government"
					initiatives={initiativesByPhase.government}
				/>
			</Fragment> : null}

			{initiativesByPhase.done ? <Fragment>
				<h2>{t("DONE_PHASE")}</h2>

				<InitiativeBoxesView
					t={t}
					phase="done"
					id="initiatives-in-done"
					initiatives={initiativesByPhase.done}
				/>
			</Fragment> : null}

			<p id="see-archive">
				{Jsx.html(t("HOME_PAGE_SEE_ARCHIVE", {url: "/initiatives"}))}
			</p>
		</Section>
	</Page>
}
