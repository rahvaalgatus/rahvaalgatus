/** @jsx Jsx */
var _ = require("root/lib/underscore")
var Jsx = require("j6pack")
var Fragment = Jsx.Fragment
var Page = require("../page")
var {Section} = require("../page")
var {Flash} = require("../page")
var {InitiativeBoxesView} = require("../initiatives/index_page")
var {CallToActionsView} = require("../home_page")
var javascript = require("root/lib/jsx").javascript
var {stringify} = require("root/lib/json")
var EMPTY_ARR = Array.prototype

module.exports = function(attrs) {
	var t = attrs.t
	var req = attrs.req
	var initiatives = attrs.initiatives
	var initiativeCounts = attrs.initiativeCounts

	var initiativesByPhase = _.groupBy(initiatives, "phase")
	var inEdit = initiativesByPhase.edit || EMPTY_ARR
	var inSign = initiativesByPhase.sign || EMPTY_ARR
	var inGovernment = initiativesByPhase.government || EMPTY_ARR
	var inDone = initiativesByPhase.done || EMPTY_ARR

	return <Page page="local-home" req={req}>
		<script src="/assets/local.js" />

		<Section id="welcome" class="primary-section">
			<Flash flash={req.flash} />

			<h1>{t("LOCAL_HOME_PAGE_WELCOME_TITLE")}</h1>
			<p class="welcome-paragraph">{t("LOCAL_HOME_PAGE_HEADER_TEXT")}</p>

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

				Local.newMap(
					document.getElementById("map"),
					${stringify(initiativeCounts)}
				)
			`}</script>
		</Section>

		<Section id="initiatives" class="secondary-section initiatives-section">
			{inEdit.length > 0 ? <Fragment>
				<h2>{t("EDIT_PHASE")}</h2>

				<InitiativeBoxesView
					t={t}
					phase="edit"
					initiatives={inEdit}
				/>
			</Fragment> : null}

			{inSign.length > 0 ? <Fragment>
				<h2>{t("SIGN_PHASE")}</h2>

				<InitiativeBoxesView
					t={t}
					phase="sign"
					initiatives={inSign}
				/>
			</Fragment> : null}

			{inGovernment.length > 0 ? <Fragment>
				<h2>{t("GOVERNMENT_PHASE")}</h2>

				<InitiativeBoxesView
					t={t}
					phase="government"
					initiatives={inGovernment}
				/>
			</Fragment> : null}

			{inDone.length > 0 ? <Fragment>
				<h2>{t("DONE_PHASE")}</h2>

				<InitiativeBoxesView
					t={t}
					phase="done"
					initiatives={inDone}
				/>
			</Fragment> : null}

			<p id="see-archive">
				{Jsx.html(t("HOME_PAGE_SEE_ARCHIVE", {url: "/initiatives"}))}
			</p>
		</Section>
	</Page>
}
