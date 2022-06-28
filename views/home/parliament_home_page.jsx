/** @jsx Jsx */
var Jsx = require("j6pack")
var Fragment = Jsx.Fragment
var Page = require("../page")
var Config = require("root/config")
var {Section} = require("../page")
var {Flash} = require("../page")
var {InitiativeBoxesView} = require("../initiatives/index_page")
var {CallToActionsView} = require("../home_page")
var {StatisticsView} = require("../home_page")
var {groupInitiatives} = require("../home_page")

module.exports = function(attrs) {
	var t = attrs.t
	var req = attrs.req
	var stats = attrs.statistics
	var initiativesByPhase = groupInitiatives(attrs.initiatives)

	return <Page page="parliament-home" req={req}>
		<Section id="welcome" class="primary-section">
			<Flash flash={req.flash} />

			<h1>{t("PARLIAMENT_HOME_PAGE_HEADER_TITLE")}</h1>
			<p class="welcome-paragraph">{t("PARLIAMENT_HOME_PAGE_HEADER_TEXT")}</p>

			<div class="video">
				<div>
					<iframe
						width="480"
						height="270"
						src={Config.videoUrls[req.lang]}
						frameborder="0"
						allowfullscreen
					/>
				</div>
			</div>

			<CallToActionsView req={req} t={t} />
		</Section>

		<Section id="statistics" class="primary-section">
			<StatisticsView
				id="discussions-statistic"
				title={t("HOME_PAGE_STATISTICS_DISCUSSIONS")}
				count={stats.all.discussionsCount}
			>
				{Jsx.html(t("HOME_PAGE_STATISTICS_N_IN_LAST_30_DAYS", {
					count: stats[30].discussionsCount
				}))}
			</StatisticsView>

			<StatisticsView
				id="initiatives-statistic"
				title={t("HOME_PAGE_STATISTICS_INITIATIVES")}
				count={stats.all.initiativeCounts.all}
			>
				{Jsx.html(t("HOME_PAGE_STATISTICS_N_IN_LAST_30_DAYS", {
					count: stats[30].initiativeCounts.all
				}))}
			</StatisticsView>

			<StatisticsView
				id="signatures-statistic"
				title={t("HOME_PAGE_STATISTICS_SIGNATURES")}
				count={stats.all.signatureCount}
			>
				{Jsx.html(t("HOME_PAGE_STATISTICS_N_IN_LAST_30_DAYS", {
					count: stats[30].signatureCount
				}))}
			</StatisticsView>

			<StatisticsView
				id="parliament-statistic"
				title={t("HOME_PAGE_STATISTICS_PARLIAMENT")}
				count={
					stats.all.governmentCounts.sent > 0 ||
					stats.all.governmentCounts.external > 0 ? [
						stats.all.governmentCounts.sent,
						stats.all.governmentCounts.external
					].join("+")
					: 0
				}
			>
				{Jsx.html(t("HOME_PAGE_STATISTICS_N_SENT_IN_LAST_30_DAYS", {
					sent: stats[30].governmentCounts.sent,
					external: stats.all.governmentCounts.external,
				}))}
			</StatisticsView>
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

			{initiativesByPhase.parliament ? <Fragment>
				<h2>{t("PARLIAMENT_PHASE")}</h2>

				<InitiativeBoxesView
					t={t}
					phase="parliament"
					id="initiatives-in-parliament"
					initiatives={initiativesByPhase.parliament}
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
