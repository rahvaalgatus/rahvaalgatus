/** @jsx Jsx */
var _ = require("root/lib/underscore")
var Qs = require("qs")
var Jsx = require("j6pack")
var Page = require("../page")
var Config = require("root").config
var DateFns = require("date-fns")
var Initiative = require("root/lib/initiative")
var {Section} = require("../page")
var {Flash} = require("../page")
var {InitiativeBoxesView} = require("../home_page")
var {CallToActionsView} = require("../home_page")
var {StatisticView} = require("../home_page")
var {groupInitiatives} = require("../home_page")
var formatIsoDate = require("root/lib/i18n").formatDate.bind(null, "iso")

module.exports = function(attrs) {
	var {t} = attrs
	var {req} = attrs
	var stats = attrs.statistics
	var initiativesByPhase = groupInitiatives(attrs.initiatives)
	var thirtyDaysAgo = DateFns.addDays(DateFns.startOfDay(new Date), -30)

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
			<StatisticView
				id="discussions-statistic"
				title={t("home_page.statistics.discussions_title")}
				count={stats.all.discussionsCount}

				url={"/initiatives?" + Qs.stringify({
					destination: "parliament",
					external: false
				})}
			>
				{Jsx.html(t("home_page.statistics.discussions_in_last_days", {
					count: stats[30].discussionsCount,

					url: _.escapeHtml("/initiatives?" + Qs.stringify({
						external: false,
						destination: "parliament",
						"published-on>": formatIsoDate(thirtyDaysAgo)
					}))
				}))}
			</StatisticView>

			<StatisticView
				id="initiatives-statistic"
				title={t("home_page.statistics.initiatives_title")}
				count={stats.all.initiativeCounts.all}

				url={"/initiatives?" + Qs.stringify({
					external: false,
					destination: "parliament",
					phase: _.without(Initiative.PHASES, "edit"),
					order: "-signing-started-at"
				}, {arrayFormat: "brackets"})}
			>
				{Jsx.html(t("home_page.statistics.parliament_initiatives_in_last_days", {
					count: stats[30].initiativeCounts.all,

					url: _.escapeHtml("/initiatives?" + Qs.stringify({
						destination: "parliament",
						"signing-started-on>": formatIsoDate(thirtyDaysAgo),
						order: "-signing-started-at"
					}))
				}))}
			</StatisticView>

			<StatisticView
				id="signatures-statistic"
				title={t("home_page.statistics.signatures_title")}
				count={stats.all.signatureCount}

				url={"/initiatives?" + Qs.stringify({
					external: false,
					destination: "parliament",
					order: "-last-signed-at"
				})}
			>
				{Jsx.html(t("home_page.statistics.signatures_in_last_days", {
					count: stats[30].signatureCount
				}))}
			</StatisticView>

			<StatisticView
				id="parliament-statistic"
				title={t("home_page.statistics.parliament_title")}

				count={
					stats.all.governmentCounts.sent > 0 ||
					stats.all.governmentCounts.external > 0 ? [
						stats.all.governmentCounts.sent,
						stats.all.governmentCounts.external
					].join("+")
					: 0
				}

				url={"/initiatives?" + Qs.stringify({
					destination: "parliament",
					phase: _.without(Initiative.PHASES, "edit", "sign"),
					order: "-proceedings-started-at"
				}, {arrayFormat: "brackets"})}
			>
				{Jsx.html(t("home_page.statistics.parliament_in_last_days", {
					count: stats[30].governmentCounts.sent,

					url: _.escapeHtml("/initiatives?" + Qs.stringify({
						external: false,
						destination: "parliament",
						"proceedings-started-on>": formatIsoDate(thirtyDaysAgo),
						order: "-proceedings-started-at"
					})),

					externalCount: stats.all.governmentCounts.external,

					externalUrl: _.escapeHtml("/initiatives?" + Qs.stringify({
						external: "true",
						destination: "parliament",
						order: "-proceedings-started-at"
					}))
				}))}
			</StatisticView>
		</Section>

		<Section id="initiatives" class="secondary-section initiatives-section">
			{initiativesByPhase.edit ? <>
				<h2>{t("EDIT_PHASE")}</h2>

				<InitiativeBoxesView
					t={t}
					phase="edit"
					id="initiatives-in-edit"
					initiatives={initiativesByPhase.edit}
				/>
			</> : null}

			{initiativesByPhase.sign ? <>
				<h2>{t("SIGN_PHASE")}</h2>

				<InitiativeBoxesView
					t={t}
					phase="sign"
					id="initiatives-in-sign"
					initiatives={initiativesByPhase.sign}
				/>
			</> : null}

			{initiativesByPhase.signUnsent ? <>
				<h2>{t("HOME_PAGE_SIGNED_TITLE")}</h2>

				<InitiativeBoxesView
					t={t}
					phase="sign"
					id="initiatives-in-sign-unsent"
					initiatives={initiativesByPhase.signUnsent}
				/>
			</> : null}

			{initiativesByPhase.parliament ? <>
				<h2>{t("PARLIAMENT_PHASE")}</h2>

				<InitiativeBoxesView
					t={t}
					phase="parliament"
					id="initiatives-in-parliament"
					initiatives={initiativesByPhase.parliament}
				/>
			</> : null}

			{initiativesByPhase.government ? <>
				<h2>{t("GOVERNMENT_PHASE")}</h2>

				<InitiativeBoxesView
					t={t}
					phase="government"
					id="initiatives-in-government"
					initiatives={initiativesByPhase.government}
				/>
			</> : null}

			{initiativesByPhase.done ? <>
				<h2>{t("DONE_PHASE")}</h2>

				<InitiativeBoxesView
					t={t}
					phase="done"
					id="initiatives-in-done"
					initiatives={initiativesByPhase.done}
				/>
			</> : null}

			<p id="see-archive">
				{Jsx.html(t("HOME_PAGE_SEE_ARCHIVE", {url: "/initiatives"}))}
			</p>
		</Section>
	</Page>
}
