/** @jsx Jsx */
var _ = require("lodash")
var Jsx = require("j6pack")
var Fragment = Jsx.Fragment
var Page = require("../page")
var Initiative = require("root/lib/initiative")
var Config = require("root/config")
var I18n = require("root/lib/i18n")
var Form = require("../page").Form
var Flash = require("../page").Flash
var Css = require("root/lib/css")
var DateFns = require("date-fns")
var formatDate = require("root/lib/i18n").formatDate
var VOTES_REQUIRED = Config.votesRequired

module.exports = function(attrs) {
	var req = attrs.req
	var user = attrs.user
	var error = attrs.error
	var initiatives = attrs.initiatives
	var dbInitiatives = attrs.dbInitiatives
	var signedInitiatives = attrs.signedInitiatives
	var userAttrs = attrs.userAttrs
	var t = req.t

	return <Page id="user" title={user.name} req={req}>
		<section id="user" class="primary-section text-section"><center>
			<h1>{user.name}</h1>
			<Flash flash={req.flash} />

			<Form method="put" action="/user" class="form" req={req}>
				{error ? <p class="flash error">{error}</p> : null}

				<label class="form-label">{t("LBL_FULL_NAME")}</label>
				<input
					type="text"
					name="name"
					value={userAttrs.name}
					required
					class="form-input"
				/>

				<label class="form-label">{t("LBL_EMAIL")}</label>
				<input
					type="email"
					name="email"
					value={userAttrs.email}
					required
					class="form-input"
				/>

				<button class="form-submit primary-button">{t("BTN_SAVE")}</button>
			</Form>
		</center></section>

		<section id="initiatives" class="secondary-section initiatives-section">
			<center>
				<h2>{t("MY_INITIATIVES")}</h2>
				<InitiativesView
					t={t}
					initiatives={initiatives}
					dbInitiatives={dbInitiatives}
				/>

				{signedInitiatives.length > 0 ? <Fragment>
					<h2>{t("SIGNED_INITIATIVES")}</h2>
					<InitiativesView
						t={t}
						initiatives={signedInitiatives}
						dbInitiatives={dbInitiatives}
					/>
				</Fragment> : null}
			</center>
		</section>
	</Page>
}

function InitiativesView(attrs) {
	var t = attrs.t
	var initiatives = attrs.initiatives
	var dbInitiatives = attrs.dbInitiatives

	return <ol class="initiatives">
		{initiatives.map((initiative) => <InitiativeView
			t={t}
			initiative={initiative}
			dbInitiatives={dbInitiatives[initiative.id]}
		/>)}
	</ol>
}

function InitiativeView(attrs) {
	var t = attrs.t
	var initiative = attrs.initiative
	var dbInitiative = attrs.dbInitiative

	var createdAt = initiative.createdAt
	var partner = Config.partners[initiative.sourcePartnerId]
	var category = _.values(_.pick(Config.categories, initiative.categories))[0]
	var badge = partner || category

	return <li class="initiative">
		<a href={`/initiatives/${initiative.id}`}>
			<time datetime={createdAt.toJSON()}>
				{I18n.formatDate("numeric", createdAt)}
			</time>

			<h3>{initiative.title}</h3>
			{badge ? <img src={badge.icon} class="badge" /> : null}

			<span class="author">{initiative.creator.name}</span>

			<ProgressView t={t} initiative={initiative} dbInitiative={dbInitiative} />
		</a>
	</li>
}

function ProgressView(attrs) {
	var t = attrs.t
	var initiative = attrs.initiative
	var dbInitiative = attrs.dbInitiative
	var unclosedStatus = Initiative.getUnclosedStatus(initiative)
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
					class={"initiative-progress " + klass}
				>
					{t("TXT_DEADLINE_CALENDAR_DAYS_LEFT", {numberOfDaysLeft: left})}
				</div>
			}

			else return <div class={"initiative-progress completed " + klass}>
				{t("DISCUSSION_FINISHED")}
			</div>

		case "voting":
			var sigs = Initiative.countSignatures("Yes", initiative)

			if (Initiative.isSuccessful(initiative))
				return <div class={"initiative-progress completed " + klass}>
					{t("N_SIGNATURES_COLLECTED", {votes: sigs})}
				</div>

			else if (!Initiative.hasVoteEnded(new Date, initiative))
				return <div
					style={Css.linearBackground("#00cb81", sigs / VOTES_REQUIRED)}
					class={"initiative-progress " + klass}
				>
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
