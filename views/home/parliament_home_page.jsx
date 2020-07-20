/** @jsx Jsx */
var _ = require("root/lib/underscore")
var Jsx = require("j6pack")
var Fragment = Jsx.Fragment
var Page = require("../page")
var Config = require("root/config")
var {Flash} = require("../page")
var InitiativesView = require("../initiatives_page").InitiativesView
var {InitiativesSubscriptionForm} = require("../home_page")
var {StatisticsView} = require("../home_page")
var EMPTY_ARR = Array.prototype

module.exports = function(attrs) {
	var t = attrs.t
	var req = attrs.req
	var user = req.user
	var initiatives = attrs.initiatives
	var stats = attrs.statistics
	var signatureCounts = attrs.signatureCounts

	var initiativesByPhase = _.groupBy(initiatives, "phase")
	var inEdit = initiativesByPhase.edit || EMPTY_ARR
	var inSign = initiativesByPhase.sign || EMPTY_ARR
	var inParliament = initiativesByPhase.parliament || EMPTY_ARR
	var inGovernment = initiativesByPhase.government || EMPTY_ARR
	var inDone = initiativesByPhase.done || EMPTY_ARR

	return <Page page="parliament-home" req={req}>
		<section id="welcome" class="primary-section text-section"><center>
			<Flash flash={req.flash} />

			<h1>{t("PARLIAMENT_HOME_WELCOME_TITLE")}</h1>

			<div class="video">
				<iframe
					width="480"
					height="270"
					src={Config.videoUrls[req.lang]}
					frameborder="0"
					allowfullscreen
				/>
			</div>

			<p class="welcome-paragraph">{t("PARLIAMENT_HOME_WELCOME")}</p>

			<a href="/initiatives/new" class="button large-button secondary-button">
				{t("BTN_NEW_TOPIC")}
			</a>

			<InitiativesSubscriptionForm req={req} t={t} user={user} />

			<div class="social-media-logos">
				<a href="https://www.facebook.com/rahvaalgatus" class="facebook-logo">
					<img src="/assets/facebook-logo.png" />
				</a>

				<a href="https://www.facebook.com/rahvaalgatus" class="twitter-logo">
					<img src="/assets/twitter-logo.svg" />
				</a>
			</div>
		</center></section>

		<section id="statistics" class="primary-section">
			<center>
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
			</center>
		</section>

		<section id="initiatives" class="secondary-section initiatives-section">
			<center>
				{inEdit.length > 0 ? <Fragment>
					<h2>{t("EDIT_PHASE")}</h2>

					<InitiativesView
						t={t}
						phase="edit"
						initiatives={inEdit}
						signatureCounts={signatureCounts}
					/>
				</Fragment> : null}

				{inSign.length > 0 ? <Fragment>
					<h2>{t("SIGN_PHASE")}</h2>

					<InitiativesView
						t={t}
						phase="sign"
						initiatives={inSign}
						signatureCounts={signatureCounts}
					/>
				</Fragment> : null}

				{inParliament.length > 0 ? <Fragment>
					<h2>{t("PARLIAMENT_PHASE")}</h2>

					<InitiativesView
						t={t}
						phase="parliament"
						initiatives={inParliament}
						signatureCounts={signatureCounts}
					/>
				</Fragment> : null}

				{inGovernment.length > 0 ? <Fragment>
					<h2>{t("GOVERNMENT_PHASE")}</h2>

					<InitiativesView
						t={t}
						phase="government"
						initiatives={inGovernment}
						signatureCounts={signatureCounts}
					/>
				</Fragment> : null}

				{inDone.length > 0 ? <Fragment>
					<h2>{t("DONE_PHASE")}</h2>

					<InitiativesView
						t={t}
						phase="done"
						initiatives={inDone}
						signatureCounts={signatureCounts}
					/>
				</Fragment> : null}
			</center>
		</section>
	</Page>
}
