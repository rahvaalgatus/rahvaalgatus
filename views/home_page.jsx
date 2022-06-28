/** @jsx Jsx */
var _ = require("root/lib/underscore")
var Jsx = require("j6pack")
var Fragment = Jsx.Fragment
var Page = require("./page")
var Config = require("root/config")
var I18n = require("root/lib/i18n")
var {Section} = require("./page")
var {Flash} = require("./page")
var {Form} = require("./page")
var FormCheckbox = Page.FormCheckbox
var {InitiativeBoxesView} = require("./initiatives/index_page")
var {InitiativeBoxView} = require("./initiatives/index_page")
var {getRequiredSignatureCount} = require("root/lib/initiative")
exports = module.exports = HomePage
exports.CallToActionsView = CallToActionsView
exports.StatisticsView = StatisticsView
exports.groupInitiatives = groupInitiatives

function HomePage(attrs) {
	var t = attrs.t
	var req = attrs.req
	var stats = attrs.statistics
	var recentInitiatives = attrs.recentInitiatives
	var news = attrs.news
	var initiativesByPhase = groupInitiatives(attrs.initiatives)

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

			<h1>{t("HOME_PAGE_HEADER_TAGLINE")}</h1>

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
						initiative.reason == "event" ? t("RECENTLY_EVENTED") :
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
			{initiativesByPhase.edit ? <Fragment>
				<h2>{t("EDIT_PHASE")}</h2>

				<InitiativeBoxesView
					t={t}
					id="initiatives-in-edit"
					phase="edit"
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

		{news.length > 0 ? <Section
			id="news"
			class="transparent-section"
		>
			<h2>
				<a href="https://kogu.ee">
					<img src="/assets/kogu-blue.svg" alt={t("KOGU")} />
				</a>

				<span>{t("HOME_PAGE_NEWS_TITLE")}</span>
			</h2>

			<ol>{news.map((news) => <li><a href={news.url}>
				<div class="time-and-author">
					<time datetime={news.published_at.toJSON()}>
						{I18n.formatDate("numeric", news.published_at)}
					</time>

					{", "}

					<span class="author" title={news.author_name}>
						{news.author_name}
					</span>
				</div>

				<h3 title={news.title}>{news.title}</h3>
			</a></li>)}</ol>
		</Section> : null}
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
			<img src="/assets/facebook-logo.svg" />
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

			<label class="form-checkbox">
				<FormCheckbox name="new_interest" checked />
				<span>{t("SUBSCRIPTIONS_NEW_INTEREST")}</span>
			</label>

			<label class="form-checkbox">
				<FormCheckbox name="signable_interest" checked />
				<span>{t("SUBSCRIPTIONS_SIGNABLE_INTEREST")}</span>
			</label>

			<label class="form-checkbox">
				<FormCheckbox name="event_interest" />
				<span>{t("SUBSCRIPTIONS_EVENT_INTEREST")}</span>
			</label>

			<label class="form-checkbox">
				<FormCheckbox name="comment_interest" />
				<span>{t("SUBSCRIPTIONS_COMMENT_INTEREST")}</span>
			</label>

			<button type="submit" class="primary-button">
				{t("SUBSCRIBE_TO_INITIATIVES_BUTTON")}
			</button>
		</Form>
	]
}

function groupInitiatives(initiatives) {
	return _.groupBy(initiatives, function(initiative) {
		if (initiative.phase == "sign") {
			var signatureThreshold = getRequiredSignatureCount(initiative)
			var signatureCount = initiative.signature_count

			if (
				signatureCount >= signatureThreshold &&
				initiative.signing_ends_at <= new Date
			) return "signUnsent"
		}

		return initiative.phase
	})
}
