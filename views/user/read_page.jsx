/** @jsx Jsx */
var _ = require("lodash")
var Jsx = require("j6pack")
var Fragment = Jsx.Fragment
var Page = require("../page")
var ProgressView = require("../initiatives/initiative_page").ProgressView
var Config = require("root/config")
var I18n = require("root/lib/i18n")
var Form = require("../page").Form
var Flash = require("../page").Flash

module.exports = function(attrs) {
	var req = attrs.req
	var user = attrs.user
	var error = attrs.error
	var initiatives = attrs.initiatives
	var dbInitiatives = attrs.dbInitiatives
	var signedInitiatives = attrs.signedInitiatives
	var userAttrs = attrs.userAttrs
	var t = req.t

	return <Page page="user" title={user.name} req={req}>
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
