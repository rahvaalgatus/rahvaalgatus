/** @jsx Jsx */
var _ = require("root/lib/underscore")
var Qs = require("qs")
var Jsx = require("j6pack")
var Page = require("./page")
var Config = require("root").config
var DateFns = require("date-fns")
var I18n = require("root/lib/i18n")
var Initiative = require("root/lib/initiative")
var {Section} = require("./page")
var {Flash} = require("./page")
var {Form} = require("./page")
var {FormCheckbox} = Page
var {DateView} = Page
var {RelativeDateView} = Page
var {InitiativeProgressView} = require("./initiatives/initiative_page")
var {getSignatureThreshold} = require("root/lib/initiative")
var formatIsoDate = require("root/lib/i18n").formatDate.bind(null, "iso")
var LOCAL_GOVERNMENTS = require("root/lib/local_governments")
exports = module.exports = HomePage
exports.CallToActionsView = CallToActionsView
exports.StatisticView = StatisticView
exports.InitiativeBoxesView = InitiativeBoxesView
exports.groupInitiatives = groupInitiatives

function HomePage(attrs) {
	var {t} = attrs
	var {req} = attrs
	var stats = attrs.statistics
	var {recentInitiatives} = attrs
	var {news} = attrs
	var initiativesByPhase = groupInitiatives(attrs.initiatives)
	var thirtyDaysAgo = DateFns.addDays(DateFns.startOfDay(new Date), -30)

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
			<StatisticView
				id="discussions-statistic"
				title={t("home_page.statistics.discussions_title")}
				count={stats.all.discussionsCount}
				url={"/initiatives?" + Qs.stringify({external: false})}
			>
				{Jsx.html(t("home_page.statistics.discussions_in_last_days", {
					count: stats[30].discussionsCount,

					url: _.escapeHtml("/initiatives?" + Qs.stringify({
						external: false,
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
					phase: _.without(Initiative.PHASES, "edit"),
					order: "-signing-started-at"
				}, {arrayFormat: "brackets"})}
			>
				{Jsx.html(t("home_page.statistics.initiatives_in_last_days", {
					count: stats[30].initiativeCounts.all,

					url: _.escapeHtml("/initiatives?" + Qs.stringify({
						"signing-started-on>": formatIsoDate(thirtyDaysAgo),
						order: "-signing-started-at"
					})),

					parliamentCount: stats[30].initiativeCounts.parliament,

					parliamentUrl: _.escapeHtml("/initiatives?" + Qs.stringify({
						destination: "parliament",
						"signing-started-on>": formatIsoDate(thirtyDaysAgo),
						order: "-signing-started-at"
					})),

					localCount: stats[30].initiativeCounts.local,

					localUrl: _.escapeHtml("/initiatives?" + Qs.stringify({
						destination: "local",
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
					order: "-last-signed-at"
				})}
			>
				{Jsx.html(t("home_page.statistics.signatures_in_last_days", {
					count: stats[30].signatureCount,

					url: _.escapeHtml("/initiatives?" + Qs.stringify({
						external: false,
						"last-signed-on>": formatIsoDate(thirtyDaysAgo),
						order: "-last-signed-at"
					}))
				}))}
			</StatisticView>

			<StatisticView
				id="parliament-statistic"
				title={t("home_page.statistics.government_title")}

				count={
					stats.all.governmentCounts.sent > 0 ||
					stats.all.governmentCounts.external > 0 ? [
						stats.all.governmentCounts.sent,
						stats.all.governmentCounts.external
					].join("+")
					: 0
				}

				url={"/initiatives?" + Qs.stringify({
					phase: _.without(Initiative.PHASES, "edit", "sign"),
					order: "-proceedings-started-at"
				}, {arrayFormat: "brackets"})}
			>
				{Jsx.html(t("home_page.statistics.government_in_last_days", {
					count: stats[30].governmentCounts.sent,

					url: _.escapeHtml("/initiatives?" + Qs.stringify({
						external: false,
						"proceedings-started-on>": formatIsoDate(thirtyDaysAgo),
						order: "-proceedings-started-at"
					})),

					parliamentCount: stats[30].governmentCounts.sent_parliament,

					parliamentUrl: _.escapeHtml("/initiatives?" + Qs.stringify({
						external: false,
						destination: "parliament",
						"proceedings-started-on>": formatIsoDate(thirtyDaysAgo),
						order: "-proceedings-started-at"
					})),

					localCount: stats[30].governmentCounts.sent_local,

					localUrl: _.escapeHtml("/initiatives?" + Qs.stringify({
						external: false,
						destination: "local",
						"proceedings-started-on>": formatIsoDate(thirtyDaysAgo),
						order: "-proceedings-started-at"
					})),

					externalCount: stats.all.governmentCounts.external,

					externalUrl: _.escapeHtml("/initiatives?" + Qs.stringify({
						external: "true",
						order: "-proceedings-started-at"
					}))
				}))}
			</StatisticView>
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

		<Section id="search" class="primary-section">
			<form method="get" action="https://cse.google.com/cse">
				<input type="hidden" name="cx" value={Config.googleSiteSearchId} />

				<input
					type="search"
					name="q"
					class="form-input"
					placeholder={t("HOME_PAGE_SEARCH_PLACEHOLDER")}
				/>

				<button class="blue-button">{t("HOME_PAGE_SEARCH_BUTTON")}</button>
			</form>

			<p>{Jsx.html(t("HOME_PAGE_SEARCH_SEE_OTHER", {
				parliamentSiteUrl: "/parliament",
				localSiteUrl: "/local",
				archiveUrl: "/initiatives"
			}))}</p>
		</Section>

		<Section id="initiatives" class="secondary-section initiatives-section">
			{initiativesByPhase.edit ? <>
				<h2>{t("EDIT_PHASE")}</h2>

				<InitiativeBoxesView
					t={t}
					id="initiatives-in-edit"
					phase="edit"
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
	var {req} = attrs
	var {user} = req
	var {t} = attrs

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

		{subscriptionForm}
	</div>
}

function StatisticView({id, url, title, count}, children) {
	var els = <>
		<h2>{title}</h2>
		<span class="count">{count}</span>
	</>

	return <div id={id} class="statistic">
		{url ? <a href={url}>{els}</a> : els}
		<p>{children}</p>
	</div>
}

function InitiativesSubscriptionForm(attrs) {
	var {req} = attrs
	var {t} = attrs
	var {user} = attrs
	var toggleId = _.uniqueId("subscriptions-form-toggle-")

	return [
		<>
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
		</>,

		<Form
			req={req}
			id="initiatives-subscribe"
			class="initiatives-subscription-form-view"
			method="post"
			action="/subscriptions">

			<p>{t("SUBSCRIBE_TO_INITIATIVES_EXPLANATION")}</p>

			{/* Catch naive bots */}
			<input name="e-mail" type="email" hidden />

			<select
				name="initiative_destination"
				class="form-select"
			>
				<option value="">
					{t("home_page.initiative_subscriptions_form.destination.all")}
				</option>

				<optgroup
					label={t("home_page.initiative_subscriptions_form.destination.parliament_group_label")}
				>
					<option value="parliament">
						{t("home_page.initiative_subscriptions_form.destination.parliament_label")}
					</option>
				</optgroup>

				<optgroup label={t("home_page.initiative_subscriptions_form.destination.local_group_label")}>{_.map(LOCAL_GOVERNMENTS.SORTED_BY_NAME, ({name}, id) => (
					<option value={id}>{name}</option>
				))}</optgroup>
			</select>

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

function InitiativeBoxesView(attrs) {
	var {t} = attrs
	var {phase} = attrs
	var {initiatives} = attrs
	initiatives = phase ? sortForPhase(phase, initiatives) : initiatives

	return <ol id={attrs.id} class="initiatives">
		{initiatives.map((initiative) => <InitiativeBoxView
			t={t}
			initiative={initiative}
			signatureCount={initiative.signature_count}
		/>)}
	</ol>
}

function InitiativeBoxView(attrs) {
	var {t} = attrs
	var {initiative} = attrs
	var {signatureCount} = attrs

	var time = (
		initiative.phase == "edit" ? initiative.created_at :
		initiative.phase == "sign" ? initiative.signing_started_at :
		initiative.phase == "parliament" ? (
			initiative.received_by_parliament_at ||
			initiative.sent_to_parliament_at
		) :
		initiative.phase == "government" ? initiative.sent_to_government_at :
		initiative.phase == "done" ? (
			initiative.finished_in_government_at ||
			initiative.finished_in_parliament_at
		) :
		null
	)

	var badge = _.find(Config.badges, (_b, tag) => initiative.tags.includes(tag))
	var authorNames = Initiative.authorNames(initiative)

	return <li
		data-id={initiative.id}
		data-uuid={initiative.uuid}
		class={"initiative" + (initiative.destination ? " with-destination" : "")}
	>
		<a href={Initiative.slugPath(initiative)}>
			{attrs.dateless ? null
				: initiative.phase == "sign"
				? (new Date < initiative.signing_ends_at ?
					<RelativeDateView t={t} date={initiative.signing_ends_at} />
				: null)
				: time
				? <DateView date={time} />
				// Empty <time> so destinationless discussions' titles align properly.
				: <time>&nbsp;</time>
			}

			{" "}

			{initiative.destination ? <span
				class="destination"
				title={t("DESTINATION_" + initiative.destination)}
			>
				{t("DESTINATION_" + initiative.destination)}
			</span> : null}

			<h3 lang="et" title={initiative.title}>{initiative.title}</h3>
			{badge ? <img src={badge.icon} class="badge" title={badge.name} /> : null}

			<ul class="authors" title={authorNames.join(", ")}>
				{/* Adding comma to <li> to permit selecting it. */}
				{_.intersperse(authorNames.map((name, i, names) => <li>
					{name}{i + 1 < names.length ? "," : ""}
				</li>), " ")}
			</ul>

			<InitiativeProgressView
				t={t}
				initiative={initiative}
				signatureCount={signatureCount}
			/>
		</a>

		{attrs.note ? <div class="note">
			{attrs.note}
		</div> : null}
	</li>
}

function groupInitiatives(initiatives) {
	return _.groupBy(initiatives, function(initiative) {
		if (initiative.phase == "sign") {
			var signatureThreshold = getSignatureThreshold(initiative)
			var signatureCount = initiative.signature_count

			if (
				signatureCount >= signatureThreshold &&
				initiative.signing_ends_at <= new Date
			) return "signUnsent"
		}

		return initiative.phase
	})
}

function sortForPhase(phase, initiatives) {
	switch (phase) {
		case "edit": return _.sortBy(initiatives, "created_at").reverse()

		case "sign":
			return _.sortBy(initiatives, (i) => i.signature_count || 0).reverse()

		case "parliament":
			return _.sortBy(initiatives, (i) => (
				i.sent_to_parliament_at || i.signing_started_at
			)).reverse()

		case "government": return _.sortBy(initiatives, "sent_to_government_at")

		case "done":
			return _.sortBy(initiatives, (i) => (
				i.finished_in_government_at || i.finished_in_parliament_at
			)).reverse()

		default: throw new RangeError("Invalid phase: " + phase)
	}
}
