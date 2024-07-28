/** @jsx Jsx */
var _ = require("root/lib/underscore")
var Jsx = require("j6pack")
var Page = require("../page")
var DateFns = require("date-fns")
var Config = require("root").config
var I18n = require("root/lib/i18n")
var Css = require("root/lib/css")
var Initiative = require("root/lib/initiative")
var diffInDays = require("date-fns").differenceInCalendarDays
var {getSignatureThreshold} = require("root/lib/initiative")
exports = module.exports = InitiativePage
exports.InitiativeBadgeView = InitiativeBadgeView
exports.InitiativeProgressView = InitiativeProgressView
exports.renderParliamentDecision = renderParliamentDecision

function InitiativePage(attrs, children) {
	var {req} = attrs
	var {t} = req
	var {initiative} = attrs
	var {headerless} = attrs
	var authorNames = Initiative.authorNames(initiative)

	return <Page {...attrs} class={"initiative-page " + (attrs.class || "")}>
		{!headerless ? <header id="initiative-header">
			<center>
				{initiative.destination && initiative.destination != "parliament" ?
					<span
						class="destination"
						title={t("DESTINATION_" + initiative.destination)}
					>
						{t("DESTINATION_" + initiative.destination)}
					</span>
				: null}

				<h1>
					{req.method != "GET" || !/^\/[^/]+$/.test(req.path) ?
						<a href={Initiative.slugPath(initiative)}>{initiative.title}</a>
					: initiative.title}

					<InitiativeBadgeView initiative={initiative} />
				</h1>

				<ul class="authors">
					{/* Adding comma to <li> to permit selecting it. */}
					{_.intersperse(authorNames.map((name, i, names) => <li>
						{name}{i + 1 < names.length ? "," : ""}
					</li>), " ")}
				</ul>
				{", "}
				<time datetime={initiative.created_at.toJSON()}>
					{I18n.formatDate("numeric", initiative.created_at)}
				</time>
			</center>
		</header> : null}

		{children}
	</Page>
}

function InitiativeBadgeView(attrs) {
	var {initiative} = attrs
	var badge = _.find(Config.badges, (_b, tag) => initiative.tags.includes(tag))
	if (badge == null) return null

	if (badge.url) return <a href={badge.url} title={badge.name} class="badge">
		<img src={badge.icon} alt={badge.name} class="badge" />
	</a>
	else return <img
		src={badge.icon}
		alt={badge.name}
		title={badge.name}
		class="badge"
	/>
}

function InitiativeProgressView(attrs) {
	var {t} = attrs
	var {initiative} = attrs
	var sigs = attrs.signatureCount
	var klass = "initiative-progress " + initiative.phase + "-phase"
	if (attrs.class) klass += " " + attrs.class

	switch (initiative.phase) {
		case "edit":
			if (initiative.external) return null

			if (!initiative.published_at)
				return <div class={`${klass} private`}>
					{t("TXT_TOPIC_VISIBILITY_PRIVATE")}
				</div>

			if (new Date < initiative.discussion_ends_at) {
				var passed = diffInDays(new Date, initiative.created_at)

				var total = diffInDays(
					DateFns.addMilliseconds(initiative.discussion_ends_at, -1),
					// TODO: Use published_at for measuring discussion phase time.
					initiative.created_at
				) + 1

				var left = total - passed

				return <div
					style={Css.linearBackground("#ffb400", passed / total)}
					class={klass}>
					{t("TXT_DEADLINE_CALENDAR_DAYS_LEFT", {numberOfDaysLeft: left})}
				</div>
			}

			return <div class={`${klass} completed`}>
				{t("DISCUSSION_FINISHED")}
			</div>

		case "sign":
			if (initiative.external) return null

			var signatureThreshold = getSignatureThreshold(initiative)

			if (sigs >= signatureThreshold)
				return <div class={`${klass} completed`}>
					{t("N_SIGNATURES_COLLECTED", {votes: sigs})}
				</div>

			else if (new Date < initiative.signing_ends_at) return <div
				style={Css.linearBackground("#00cb81", sigs / signatureThreshold)}
				class={klass}>
				{t("N_SIGNATURES", {votes: sigs})}
			</div>

			else return <div class={`${klass} failed`}>
				{t("N_SIGNATURES_FAILED", {votes: sigs})}
			</div>

		case "parliament":
		case "government":
		case "done":
			return <div class={klass}>{
				initiative.external
				? t("N_SIGNATURES_EXTERNAL") :
				initiative.has_paper_signatures
				? t("N_SIGNATURES_WITH_PAPER", {votes: sigs})
				: t("N_SIGNATURES", {votes: sigs})
			}</div>
	}
}

function renderParliamentDecision(t, decision) {
	switch (decision) {
		case "return":
		case "reject":
		case "forward":
		case "forward-to-government":
		case "solve-differently":
		case "draft-act-or-national-matter":
			var key = decision.replace(/-/g, "_")
			return Jsx.html(t("initiative_page.events.parliament_decisions." + key))

		default: return null
	}
}
