/** @jsx Jsx */
var _ = require("lodash")
var Jsx = require("j6pack")
var Page = require("../page")
var Config = require("root/config")
var I18n = require("root/lib/i18n")
var Initiative = require("root/lib/initiative")
var Css = require("root/lib/css")
var DateFns = require("date-fns")
var formatDate = require("root/lib/i18n").formatDate
var VOTES_REQUIRED = Config.votesRequired
exports = module.exports = InitiativePage
exports.ProgressView = ProgressView
	
function InitiativePage(attrs, children) {
	var req = attrs.req
	var initiative = attrs.initiative
	var path = "/initiatives/" + initiative.id
	var createdAt = initiative.createdAt

	return <Page {...attrs}>
		<header id="initiative-header">
			<center>
				<h1>
					{req.method != "GET" || req.baseUrl + req.path != path ?
						<a href={path}>{initiative.title}</a>
					: initiative.title}

					{InitiativeBadge(initiative)}
				</h1>

				<span class="author">{initiative.creator.name}</span>
				{", "}
				<time datetime={createdAt.toJSON()}>
					{I18n.formatDate("numeric", createdAt)}
				</time>
			</center>
		</header>

		{children}
	</Page>
}

function InitiativeBadge(initiative) {
	var partner = Config.partners[initiative.sourcePartnerId]
	var category = _.values(_.pick(Config.categories, initiative.categories))[0]
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
	var initiative = attrs.initiative
	var dbInitiative = attrs.dbInitiative
	var unclosedStatus = Initiative.getUnclosedStatus(initiative, dbInitiative)
	var createdAt = initiative.createdAt

	var klass = {
		inProgress: "discussable",
		voting: "votable",
		followUp: "processable"
	}[unclosedStatus]

	switch (unclosedStatus) {
		case "inProgress":
			if (initiative.visibility == "private")
				return <div class={"initiative-progress private " + klass}>
					{t("TXT_TOPIC_VISIBILITY_PRIVATE")}
				</div>

			else if (!Initiative.hasDiscussionEnded(new Date, initiative)) {
				var passed = DateFns.differenceInCalendarDays(new Date, createdAt)
				var total = Initiative.daysInDiscussion(initiative)
				var left = total - passed

				return <div
					style={Css.linearBackground("#ffb400", passed / total)}
					class={"initiative-progress " + klass}>
					{t("TXT_DEADLINE_CALENDAR_DAYS_LEFT", {numberOfDaysLeft: left})}
				</div>
			}

			else return <div class={"initiative-progress completed " + klass}>
				{t("DISCUSSION_FINISHED")}
			</div>

		case "voting":
			var sigs = Initiative.countSignatures("Yes", initiative)

			if (Initiative.isSuccessful(initiative, dbInitiative))
				return <div class={"initiative-progress completed " + klass}>
					{t("N_SIGNATURES_COLLECTED", {votes: sigs})}
				</div>

			else if (!Initiative.hasVoteEnded(new Date, initiative))
				return <div
					style={Css.linearBackground("#00cb81", sigs / VOTES_REQUIRED)}
					class={"initiative-progress " + klass}>
					{t("N_SIGNATURES", {votes: sigs})}
				</div>

			else return <div class={"initiative-progress failed " + klass}>
				{t("N_SIGNATURES_FAILED", {votes: sigs})}
			</div>

		case "followUp":
			klass = initiative.status == "closed" ? "finished" : "processable"
			sigs = Initiative.countSignatures("Yes", initiative)

			var date = dbInitiative == null
				? null
				: initiative.status == "closed"
				? dbInitiative.finished_in_parliament_at
				: dbInitiative.sent_to_parliament_at

			return <div class={"initiative-progress " + klass}>
				{date
					? t("N_SIGNATURES_WITH_DATE", {
						date: formatDate("numeric", date),
						votes: sigs
					})

					: t("N_SIGNATURES", {votes: sigs})
				}
			</div>

		default: return null
	}
}
