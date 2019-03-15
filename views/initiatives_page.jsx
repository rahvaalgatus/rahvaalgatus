/** @jsx Jsx */
var _ = require("lodash")
var Jsx = require("j6pack")
var Fragment = Jsx.Fragment
var Page = require("./page")
var ProgressView = require("./initiatives/initiative_page").ProgressView
var Config = require("root/config")
var I18n = require("root/lib/i18n")
exports = module.exports = InitiativesPage
exports.InitiativesView = InitiativesView

function InitiativesPage(attrs) {
	var t = attrs.t
	var req = attrs.req
	var flash = attrs.flash

	var discussions = attrs.discussions
	var votings = attrs.votings
	var processes = attrs.processes
	var processed = attrs.processed
	var dbInitiatives = attrs.dbInitiatives

	return <Page page="initiatives" req={req}>
		{
			// When deleting an initiative, people get redirected here.
		}
		{flash("notice") ? <section class="secondary-section"><center>
			<p class="flash notice">{flash("notice")}</p>
		</center></section> : null}

		<section id="initiatives" class="secondary-section initiatives-section">
			<center>
				{discussions.length > 0 ? <Fragment>
					<h2>{t("DISCUSSIONS_LIST")}</h2>
					<InitiativesView
						t={t}
						initiatives={discussions}
						dbInitiatives={dbInitiatives}
					/>
				</Fragment> : null}

				{votings.length > 0 ? <Fragment>
					<h2>{t("INITIATIVE_LIST")}</h2>
					<InitiativesView
						t={t}
						initiatives={votings}
						dbInitiatives={dbInitiatives}
					/>
				</Fragment> : null}

				{processes.length > 0 ? <Fragment>
					<h2>{t("IN_FOLLOW_UP_LIST")}</h2>
					<InitiativesView
						t={t}
						initiatives={processes}
						dbInitiatives={dbInitiatives}
					/>
				</Fragment> : null}

				{processed.length > 0 ? <Fragment>
					<h2>Menetletud</h2>
					<InitiativesView
						t={t}
						initiatives={processed}
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

			<h3 lang="et">{initiative.title}</h3>
			{badge ? <img src={badge.icon} class="badge" /> : null}

			<span class="author">{initiative.creator.name}</span>

			<ProgressView t={t} initiative={initiative} dbInitiative={dbInitiative} />
		</a>
	</li>
}
