/** @jsx Jsx */
var Jsx = require("j6pack")
var Fragment = Jsx.Fragment
var Page = require("./page")
var Config = require("root/config")
var Flash = require("./page").Flash
var Form = require("./page").Form
var InitiativesView = require("./initiatives_page").InitiativesView

module.exports = function(attrs) {
	var req = attrs.req
	var t = req.t

	var discussions = attrs.discussions
	var votings = attrs.votings
	var processes = attrs.processes
	var dbInitiatives = attrs.dbInitiatives

	return <Page page="home" req={req}>
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

			<p class="welcome-paragraph">{Jsx.html(t("HOME_WELCOME"))}</p>

			<a href="/initiatives/new" class="button large-button secondary-button">
				{t("BTN_NEW_TOPIC")}
			</a>

			<Form
				req={req}
				id="initiatives-subscribe"
				method="post"
				action="/subscriptions">
				<input
					id="subscriptions-form-toggle"
					type="checkbox"
					style="display: none"
					onchange="this.form.email.focus()"
				/>

				<label
					for="subscriptions-form-toggle"
					class="large-button primary-button">
					{t("SUBSCRIBE_TO_INITIATIVES_BUTTON")}
				</label>

				<h2>{t("SUBSCRIBE_TO_INITIATIVES_TITLE")}</h2>
				<p>{t("SUBSCRIBE_TO_INITIATIVES_EXPLANATION")}</p>

				<input
					id="subscriptions-form-email"
					name="email"
					type="email"
					required
					placeholder={t("LBL_EMAIL")}
					class="form-input"
				/>

				<button type="submit" class="primary-button">
					{t("SUBSCRIBE_TO_INITIATIVES_BUTTON")}
				</button>
			</Form>
		</center></section>

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
			</center>
		</section>
	</Page>
}
