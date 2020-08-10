/** @jsx Jsx */
var _ = require("root/lib/underscore")
var Jsx = require("j6pack")
var Fragment = Jsx.Fragment
var Page = require("./page")
var Config = require("root/config")
var {Section} = require("./page")
var {Flash} = require("./page")
var {Form} = require("./page")
var {InitiativeBoxesView} = require("./initiatives/index_page")
var {InitiativeBoxView} = require("./initiatives/index_page")
var EMPTY_ARR = Array.prototype
exports = module.exports = HomePage
exports.CallToActionsView = CallToActionsView
exports.StatisticsView = StatisticsView

function HomePage(attrs) {
	var t = attrs.t
	var req = attrs.req
	var initiatives = attrs.initiatives
	var stats = attrs.statistics
	var recentInitiatives = attrs.recentInitiatives

	var initiativesByPhase = _.groupBy(initiatives, "phase")
	var inEdit = initiativesByPhase.edit || EMPTY_ARR
	var inSign = initiativesByPhase.sign || EMPTY_ARR
	var inParliament = initiativesByPhase.parliament || EMPTY_ARR
	var inGovernment = initiativesByPhase.government || EMPTY_ARR
	var inDone = initiativesByPhase.done || EMPTY_ARR

	return <Page
		page="home"
		req={req}

		links={[{
			rel: "alternate",
			type: "application/atom+xml",
			title: t("ATOM_INITIATIVE_EVENTS_FEED_TITLE"),
			href: "/initiative-events.atom"
		}]}
	>
		<Section id="welcome" class="primary-section">
			<Flash flash={req.flash} />

			<h1>
				{t("HOME_PAGE_HEADER_TITLE")}<br />
				<small>{t("HOME_PAGE_HEADER_TAGLINE")}</small>
			</h1>

			<div class="parliament-level">
				<h2>{t("HOME_PAGE_HEADER_PARLIAMENT_TITLE")}</h2>
				<p>{Jsx.html(t("HOME_PAGE_HEADER_PARLIAMENT_TEXT"))}</p>
			</div>

			<div class="local-level">
				<h2>{t("HOME_PAGE_HEADER_LOCAL_TITLE")}</h2>
				<p>{Jsx.html(t("HOME_PAGE_HEADER_LOCAL_TEXT"))}</p>
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
				{Jsx.html(t("HOME_PAGE_STATISTICS_N_INITIATIVES_IN_LAST_30_DAYS", {
					count: stats[30].initiativeCounts.all,
					parliamentCount: stats[30].initiativeCounts.parliament,
					localCount: stats[30].initiativeCounts.local
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
				title={t("HOME_PAGE_STATISTICS_GOVERNMENT")}
				count={
					stats.all.governmentCounts.sent > 0 ||
					stats.all.governmentCounts.external > 0 ? [
						stats.all.governmentCounts.sent,
						stats.all.governmentCounts.external
					].join("+")
					: 0
				}
			>
				{Jsx.html(t("HOME_PAGE_STATISTICS_N_SENT_ALL_IN_LAST_30_DAYS", {
					sent: stats[30].governmentCounts.sent,
					sentToParliament: stats[30].governmentCounts.sent_parliament,
					sentToLocal: stats[30].governmentCounts.sent_local,
					external: stats.all.governmentCounts.external,
				}))}
			</StatisticsView>
		</Section>

		{recentInitiatives.length > 0 ? <Section
			id="recent-initiatives"
			class="secondary-section initiatives-section"
		>
			<h2>{t("RECENT_INITIATIVES")}</h2>

			<ol class="initiatives">
				{recentInitiatives.map((initiative) => <InitiativeBoxView
					t={t}
					initiative={initiative}
					signatureCount={initiative.signature_count}

					note={
						initiative.reason == "commented" ? t("RECENTLY_COMMENTED") :
						initiative.reason == "signed" ? t("RECENTLY_SIGNED") :
						null
					}

					dateless
				/>)}
			</ol>
		</Section> : null}

		<Section
			id="search"
			class="primary-section"
		>
			<form
				method="get"
				action="https://cse.google.com/cse"
			>
				<input type="hidden" name="cx" value={Config.googleSiteSearchId} />

				<input
					type="search"
					name="q"
					class="form-input"
					placeholder={t("HOME_PAGE_SEARCH_PLACEHOLDER")}
				/>

				<button class="blue-button">{t("HOME_PAGE_SEARCH_BUTTON")}</button>
			</form>

			<p>
				{Jsx.html(t("HOME_PAGE_SEARCH_SEE_OTHER", {
					parliamentSiteUrl: Config.parliamentSiteUrl,
					localSiteUrl: Config.localSiteUrl,
					archiveUrl: "/initiatives"
				}))}
			</p>
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

			{inParliament.length > 0 ? <Fragment>
				<h2>{t("PARLIAMENT_PHASE")}</h2>

				<InitiativeBoxesView
					t={t}
					phase="parliament"
					initiatives={inParliament}
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

function CallToActionsView(attrs) {
	var req = attrs.req
	var user = req.user
	var t = attrs.t

	var [
		subscriptionFormToggle,
		subscriptionForm
	] = <InitiativesSubscriptionForm req={req} t={t} user={user} />

	return <div id="call-to-actions">
		<a
			href="/initiatives/new"
			class="new-initiative-button primary-button"
		>
			{t("BTN_NEW_TOPIC")}
		</a>

		{subscriptionFormToggle}

		<a
			href={Config.facebookUrl}
			class="facebook-logo social-media-button"
		>
			<img src="/assets/facebook-logo.png" />
		</a>

		<a
			href={Config.twitterUrl}
			class="twitter-logo social-media-button"
		>
			<img src="/assets/twitter-logo.svg" />
		</a>

		{subscriptionForm}
	</div>
}

function StatisticsView(attrs, children) {
	var title = attrs.title
	var count = attrs.count

	return <div id={attrs.id} class="statistic">
		<h2>{title}</h2>
		<span class="count">{count}</span>
		<p>{children}</p>
	</div>
}

function InitiativesSubscriptionForm(attrs) {
	var req = attrs.req
	var t = attrs.t
	var user = attrs.user
	var toggleId = _.uniqueId("subscriptions-form-toggle-")

	return [
		<Fragment>
			<input
				id={toggleId}
				class="initiatives-subscription-form-toggle"
				type="checkbox"
				style="display: none"
				onchange={`document.getElementById("initiatives-subscribe").email.focus()`}
			/>

			<label
				for={toggleId}
				class="open-subscription-form-button secondary-button">
				{t("SUBSCRIBE_TO_INITIATIVES_BUTTON")}
			</label>
		</Fragment>,

		<Form
			req={req}
			id="initiatives-subscribe"
			class="initiatives-subscription-form-view"
			method="post"
			action="/subscriptions">

			<p>{t("SUBSCRIBE_TO_INITIATIVES_EXPLANATION")}</p>

			{/* Catch naive bots */}
			<input name="e-mail" type="email" hidden />

			<input
				id="subscriptions-form-email"
				name="email"
				type="email"
				required
				placeholder={t("LBL_EMAIL")}
				value={user && (user.email || user.unconfirmed_email)}
				class="form-input"
			/>

			<button type="submit" class="primary-button">
				{t("SUBSCRIBE_TO_INITIATIVES_BUTTON")}
			</button>
		</Form>
	]
}
