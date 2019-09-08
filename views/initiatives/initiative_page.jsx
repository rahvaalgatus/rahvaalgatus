/** @jsx Jsx */
var _ = require("lodash")
var Jsx = require("j6pack")
var Page = require("../page")
var Config = require("root/config")
var I18n = require("root/lib/i18n")
var Css = require("root/lib/css")
var diffInDays = require("date-fns").differenceInCalendarDays
exports = module.exports = InitiativePage
exports.ProgressView = ProgressView
	
function InitiativePage(attrs, children) {
	var req = attrs.req
	var initiative = attrs.initiative
	var topic = attrs.topic
	var path = "/initiatives/" + initiative.uuid
	var createdAt = initiative.created_at || topic.createdAt
	var authorName = initiative.author_name || topic && topic.creator.name

	return <Page class={"initiative-page " + (attrs.class || "")} {...attrs}>
		<header id="initiative-header">
			<center>
				<h1>
					{req.method != "GET" || req.baseUrl + req.path != path ?
						<a href={path}>{initiative.title}</a>
					: initiative.title}

					{topic ? InitiativeBadge(topic) : null}
				</h1>

				<span class="author">{authorName}</span>
				{", "}
				<time datetime={createdAt.toJSON()}>
					{I18n.formatDate("numeric", createdAt)}
				</time>
			</center>
		</header>

		{children}
	</Page>
}

function InitiativeBadge(topic) {
	var partner = Config.partners[topic.sourcePartnerId]
	var category = _.values(_.pick(Config.categories, topic.categories))[0]
	var badge = partner || category

	if (badge) {
		if (badge.url) {
			return <a href={badge.url} title={badge.name} class="badge">
				<img src={badge.icon} alt={badge.name} class="badge" />
			</a>
		}
		else
			return <img src={badge.icon} alt={badge.name} title={badge.name} class="badge" />
	}
	else return null
}

function ProgressView(attrs) {
	var t = attrs.t
	var topic = attrs.topic
	var initiative = attrs.initiative
	var sigs = attrs.signatureCount
	var createdAt = initiative.created_at || topic.createdAt
	var klass = "initiative-progress " + initiative.phase + "-phase"

	switch (initiative.phase) {
		case "edit":
			if (initiative.external) return null

			if (topic.visibility == "private")
				return <div class={`${klass} private`}>
					{t("TXT_TOPIC_VISIBILITY_PRIVATE")}
				</div>

			if (new Date < topic.endsAt) {
				var passed = diffInDays(new Date, createdAt)
				var total = diffInDays(topic.endsAt, topic.createdAt) + 1
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

			if (sigs >= Config.votesRequired)
				return <div class={`${klass} completed`}>
					{t("N_SIGNATURES_COLLECTED", {votes: sigs})}
				</div>

			else if (new Date < topic.vote.endsAt)
				return <div
					style={Css.linearBackground("#00cb81", sigs / Config.votesRequired)}
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
