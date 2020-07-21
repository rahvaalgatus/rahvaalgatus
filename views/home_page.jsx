/** @jsx Jsx */
var _ = require("root/lib/underscore")
var Jsx = require("j6pack")
var Fragment = Jsx.Fragment
var Page = require("./page")
var Config = require("root/config")
var {Section} = require("./page")
var {Flash} = require("./page")
var {Form} = require("./page")
var {InitiativesView} = require("./initiatives/index_page")
var EMPTY = Object.prototype
var EMPTY_ARR = Array.prototype
exports = module.exports = HomePage
exports.InitiativesSubscriptionForm = InitiativesSubscriptionForm
exports.StatisticsView = StatisticsView

function HomePage(attrs) {
	var t = attrs.t
	var req = attrs.req
	var user = req.user
	var initiatives = attrs.initiatives
	var stats = attrs.statistics
	var signatureCounts = attrs.signatureCounts
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
		<section id="welcome" class="primary-section text-section"><center>
			<Flash flash={req.flash} />

			<h1>{t("HOME_WELCOME_TITLE")}</h1>

			<div class="video">
				<iframe
					width="480"
					height="270"
					src={Config.videoUrls[req.lang]}
					frameborder="0"
					allowfullscreen
				/>
			</div>

			<p class="welcome-paragraph">{t("HOME_WELCOME")}</p>

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
			</center>
		</section>

		{recentInitiatives.length > 0 ? <Section
			id="recent-initiatives"
			class="secondary-section initiatives-section"
		>
			<h2>{t("RECENT_INITIATIVES")}</h2>

			<InitiativesView
				t={t}
				initiatives={recentInitiatives}
				signatureCounts={EMPTY}
			/>
		</Section> : null}

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

	return <Form
		req={req}
		id="initiatives-subscribe"
		class="initiatives-subscription-form-view"
		method="post"
		action="/subscriptions">
		<input
			id={toggleId}
			class="toggle"
			type="checkbox"
			style="display: none"
			onchange="this.form.email.focus()"
		/>

		<label
			for={toggleId}
			class="large-button primary-button">
			{t("SUBSCRIBE_TO_INITIATIVES_BUTTON")}
		</label>

		<h2>{t("SUBSCRIBE_TO_INITIATIVES_TITLE")}</h2>
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
}
