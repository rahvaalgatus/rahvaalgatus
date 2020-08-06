/** @jsx Jsx */
var _ = require("root/lib/underscore")
var Jsx = require("j6pack")
var Fragment = Jsx.Fragment
var Page = require("../page")
var {Section} = require("../page")
var {Flash} = require("../page")
var {InitiativesView} = require("../initiatives/index_page")
var EMPTY_ARR = Array.prototype

module.exports = function(attrs) {
	var t = attrs.t
	var req = attrs.req
	var initiatives = attrs.initiatives

	var initiativesByPhase = _.groupBy(initiatives, "phase")
	var inEdit = initiativesByPhase.edit || EMPTY_ARR
	var inSign = initiativesByPhase.sign || EMPTY_ARR
	var inGovernment = initiativesByPhase.government || EMPTY_ARR
	var inDone = initiativesByPhase.done || EMPTY_ARR

	return <Page page="local-home" req={req}>
		<Section id="welcome" class="primary-section text-section">
			<Flash flash={req.flash} />

			<h1>{t("LOCAL_HOME_WELCOME_TITLE")}</h1>
			<p class="welcome-paragraph">{t("LOCAL_HOME_WELCOME")}</p>

			<a href="/initiatives/new" class="button large-button secondary-button">
				{t("BTN_NEW_TOPIC")}
			</a>
		</Section>

		<Section id="initiatives" class="secondary-section initiatives-section">
			{inEdit.length > 0 ? <Fragment>
				<h2>{t("EDIT_PHASE")}</h2>

				<InitiativesView
					t={t}
					phase="edit"
					initiatives={inEdit}
				/>
			</Fragment> : null}

			{inSign.length > 0 ? <Fragment>
				<h2>{t("SIGN_PHASE")}</h2>

				<InitiativesView
					t={t}
					phase="sign"
					initiatives={inSign}
				/>
			</Fragment> : null}

			{inGovernment.length > 0 ? <Fragment>
				<h2>{t("GOVERNMENT_PHASE")}</h2>

				<InitiativesView
					t={t}
					phase="government"
					initiatives={inGovernment}
				/>
			</Fragment> : null}

			{inDone.length > 0 ? <Fragment>
				<h2>{t("DONE_PHASE")}</h2>

				<InitiativesView
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
