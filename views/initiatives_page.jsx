/** @jsx Jsx */
var _ = require("lodash")
var Jsx = require("j6pack")
var ProgressView = require("./initiatives/initiative_page").ProgressView
var Config = require("root/config")
var I18n = require("root/lib/i18n")
exports.InitiativesView = InitiativesView

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
