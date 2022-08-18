/** @jsx Jsx */
var _ = require("root/lib/underscore")
var Jsx = require("j6pack")
var Config = require("root/config")
var Fragment = Jsx.Fragment
var DateFns = require("date-fns")
var I18n = require("root/lib/i18n")
var stringify = require("root/lib/json").stringify
var selected = require("root/lib/css").selected
var javascript = require("root/lib/jsx").javascript
var {isAdmin} = require("root/lib/user")
var EMPTY_ARR = Array.prototype
var SITE_TITLE = Config.title
var LANGUAGES = Config.languages
var ENV = process.env.ENV
var LIVERELOAD_PORT = process.env.LIVERELOAD_PORT || 35729
var TWITTER_NAME = Config.twitterUrl.replace(/^.*\//, "")
exports = module.exports = Page
exports.Footer = Footer
exports.Section = Section
exports.Flash = Flash
exports.Form = Form
exports.FormButton = FormButton
exports.FormCheckbox = FormCheckbox
exports.DatePickerInput = DatePickerInput
exports.LiveReload = LiveReload
exports.DateView = DateView
exports.RelativeDateView = RelativeDateView

var DEFAULT_META = {
	// Using twitter:card=summary_large_image explicitly where desired.
	"twitter:card": "summary",
	"twitter:site": "@" + TWITTER_NAME,
	"og:image": Config.url + "/assets/rahvaalgatus-description.png"
}

function Page(attrs, children) {
	var req = attrs.req
	var page = attrs.page
	var title = attrs.title
	var links = attrs.links || EMPTY_ARR
	var gov = req.government
	var withNav = !attrs.navless
	var siteUrl = req.government == null ? "" : Config.url

	// We could be rendering an error page before req.t is set.
	var t = req.t || I18n.t.bind(null, "et")

	var translatable = (
		req.lang === "xx" ||
		"translatable" in req.query ||
		req.user && isAdmin(req.user)
	)

	var meta = _.assign({
		// Twitter doesn't read the page title from <title>. Set "og:title" for it.
		// https://cards-dev.twitter.com/validator
		"og:title": title || SITE_TITLE
	}, DEFAULT_META, attrs.meta)

	return <html lang={req.lang}>
		<head>
			<meta charset="utf-8" />
			<meta name="viewport" content="width=device-width" />

			<link
				rel="stylesheet"
				href={siteUrl + "/assets/page.css"}
				type="text/css"
			/>

			<title>{title == null ? "" : title + " - "} {SITE_TITLE}</title>

			{_.map(meta, (value, name) => name.startsWith("og:")
				? <meta property={name} content={value} />
				: <meta name={name} content={value} />
			)}

			{links.map((link) => <link {...link} />)}

			{ENV === "staging" || ENV === "production" ?
				<Sentry dsn={Config.sentryPublicDsn} req={req} />
			: null}

			<LiveReload req={req} />
		</head>

		<body id={page + "-page"} class={"no-js " + (attrs.class || "")}>
			<script>{javascript`
				document.body.className = document.body.className.slice(6)
			`}</script>

			<header id="header"><center>
				<menu class="languages-and-user">
					<Form action="/user" method="put" class="languages" req={req}>
						{LANGUAGES.map((lang) => <button
							name="language"
							value={lang}
							disabled={req.lang === lang}
							class="inherited-button">{t(lang)}
						</button>)}

						{translatable ? <button
							name="language"
							value="xx"
							disabled={req.lang === "xx"}
							class="inherited-button">dev
						</button> : null}
					</Form>

					{withNav ? (req.user ? <div class="right">
						<a href={siteUrl + "/user"} class="user">{req.user.name}</a>

						<Form
							req={req}
							action={"/sessions/" + req.session.id}
							method="post"
							class="signout"
						>
							<button name="_method" value="delete" class="inherited-button">
								{t("BTN_LOG_OFF")}
							</button>
						</Form>
					</div> : <a href={siteUrl + "/sessions/new"} class="right" >
						{t("BTN_LOG_IN_REGISTER")}
					</a>) : null}
				</menu>

				<a href={siteUrl || "/"} class="logo">
					<img src="/assets/rahvaalgatus.png" alt={SITE_TITLE} />
				</a>

				{withNav ? <nav>
					<ul>
						<li>
							<a
								href={gov == "parliament" ? "/" : Config.parliamentSiteUrl}
								class={"nav-button" + (gov == "parliament" ? " selected" : "")}
							>
								{t("NAV_PARLIAMENT")}
							</a>
						</li>

						<li>
							<a
								href={gov && gov != "parliament" ? "/" : Config.localSiteUrl}

								class={
									"nav-button" + (gov && gov != "parliament" ? " selected" : "")
								}
							>
								{t("NAV_LOCAL")}
							</a>
						</li>

						<li>
							<a
								href={siteUrl + "/eu"}
								class={"nav-button " + selected(page, "eu")}
							>
								{t("NAV_EU")}
							</a>
						</li>

						<li>
							<a
								href={siteUrl + "/about"}
								class={"nav-button " + selected(page, "about")}
							>
								{t("LNK_ABOUT")}
							</a>
						</li>

						<li>
							<a
								href={siteUrl + "/donate"}
								class={"nav-button " + selected(page, "donate")}
							>
							{t("LNK_SUPPORT")}
							</a>

							<a
								href={siteUrl + "/digiallkiri"}
								class="nav-button demo-signatures-button"
							>
								{t("NAV_DEMO_SIGNATURES")}
							</a>
						</li>
					</ul>
				</nav> : null}
			</center></header>

			<main id="main">{children}</main>

			<Footer t={t} siteUrl={siteUrl} />

			{ENV === "production" && Config.googleAnalyticsAccount ?
				<GoogleAnalytics accountId={Config.googleAnalyticsAccount} />
			: null}
		</body>
	</html>
}

function Footer(attrs) {
	var {t} = attrs
	var {siteUrl} = attrs

	return <footer id="footer"><center>
		<div class="contact">
			<a href="https://kogu.ee">
				<img width="100" src="/assets/kogu.png" alt={t("KOGU")} />
			</a>

			<p>
				{t("FOOTER_ADDRESS")}
				<br />
				{Jsx.html(t("FOOTER_EMAIL"))}
				<br />
				{Jsx.html(t("FOOTER_PHONE"))}

				<br />
				Facebook: <a href={Config.facebookUrl}>fb.me/rahvaalgatus</a>
			</p>
		</div>

		<div class="logos">
			<a
				href="https://kestame.rahvaalgatus.ee"
				title="#kuidasmekestame"
				class="kestame"
			>
				<img src="/assets/kestame.png" alt="#kuidasmekestame" />
			</a>
			{" "}
			<a
				href="https://uuseakus.rahvaalgatus.ee"
				title="Uue eakuse rahvakogu"
				class="uuseakus"
			>
				<img src="/assets/uuseakus.png" alt="Uue eakuse rahvakogu" />
			</a>
			{" "}
			<a
				href="https://heakodanik.ee/annetuste-kogumise-hea-tava/"
				title="Hea annetuse koguja"
				class="hea-annetus"
			>
				<img src="/assets/hea-annetus.png" alt="Hea annetuse koguja" />
			</a>
			{" "}
			<a
				href="https://github.com/rahvaalgatus/rahvaalgatus"
				title={t("GITHUB_LOGO_TITLE")}
				class="github"
			>
				<img src="/assets/github-logo.svg" alt="GitHub" />
			</a>
			<a
				href={siteUrl + "/api"}
				title="API"
				class="api ra-icon-api"
			>
				<span>API</span>
			</a>
		</div>
	</center></footer>
}

function Section(attrs, children) {
	return <section id={attrs.id} class={attrs.class}>
		<center>{children}</center>
	</section>
}

function Flash(attrs) {
	var flash = attrs.flash

	return <Fragment>
		{flash("notice") ? <p class="flash notice">{flash("notice")}</p> : null}
		{flash("error") ? <p class="flash error">{flash("error")}</p> : null}
	</Fragment>
}

function Form(attrs, children) {
	var method = attrs.method

	return <form
		id={attrs.id}
		class={attrs.class}
		action={attrs.action}
		hidden={attrs.hidden}
		enctype={attrs.enctype}
		method={method == "get" ? method : "post"}
	>
		{method && !(method == "get" || method == "post") ?
			<input type="hidden" name="_method" value={method} />
		: null}

		{method != "get" ?
			<input type="hidden" name="_csrf_token" value={attrs.req.csrfToken} />
		: null}

		{children}
	</form>
}

function FormButton(attrs, children) {
	return <Form
		req={attrs.req}
		action={attrs.action}
		class={attrs.formClass}
		method={attrs.name == "_method" ? "post" : "put"}
	>
		<button
			id={attrs.id}
			class={attrs.class}
			type={attrs.type}
			name={attrs.name}
			value={attrs.value}
			onclick={attrs.onclick}
			disabled={attrs.disabled}
		>{children}</button>
	</Form>
}

function FormCheckbox(attrs) {
	return <Fragment>
		<input type="hidden" name={attrs.name} />
		<input type="checkbox" {...attrs} />
	</Fragment>
}

function Sentry(attrs) {
	var user = attrs.req.user

	return <Fragment>
		<script src="https://cdn.ravenjs.com/3.9.1/raven.min.js" />

		<script>{`
			Raven.config("${attrs.dsn}", {
				environment: "${ENV}",
				user: ${stringify(user ? serializeUser(user) : null)},

				ignoreErrors: [
					"no_implementation",
					"user_cancel",
					"no_certificates",

					// The Facebook in-app browser uses JavaScript not supported by all
					// phones. Such is the case with the Freedom X1 phone, for example.
					"SyntaxError: Unexpected token =>"
				]
			}).install()
		`}</script>
	</Fragment>
}

function LiveReload(attrs) {
	if (ENV != "development") return null
	var req = attrs.req

	return <script
		src={`http://${req.hostname}:${LIVERELOAD_PORT}/livereload.js?snipver=1`}
		async
		defer
	/>
}

function GoogleAnalytics(attrs) {
	var id = attrs.accountId

	return <Fragment>
		<script>{javascript`
			function args() { return arguments }
			window.dataLayer = [args("js", new Date), args("config", "${id}")]
		`}</script>

		<script src={"https://www.googletagmanager.com/gtag/js?id=" + id} async />
	</Fragment>
}

function DatePickerInput(attrs) {
	var id = _.uniqueId("date-picker-")

	return <fieldset id={id} class="form-date-picker">
		<div class="pikaday" />
		<input {...attrs} />

		<script>{javascript`
			var Pikaday = require("pikaday")
			var el = document.getElementById("${id}")
			var input = el.childNodes[1]

			new Pikaday({
				firstDay: 1,
				field: input,
				minDate: input.min ? new Date(input.min) : null,
				maxDate: input.max ? new Date(input.max) : null,
				container: el.firstChild,
				bound: false,
			})
		`}</script>
	</fieldset>
}

function DateView(attrs) {
	var {date} = attrs

	return <time datetime={date.toJSON()}>
		{I18n.formatDate("numeric", date)}
	</time>
}

function RelativeDateView(attrs) {
	var {t} = attrs
	var date = DateFns.addMilliseconds(attrs.date, -1)
	var days = DateFns.differenceInCalendarDays(date, new Date)

	return <time
		datetime={date.toJSON()}
		title={I18n.formatDateTime("numeric", date)}
	>{
		days == 0 ? t("RELATIVE_DEADLINE_0_MORE") :
		days == 1 ? t("RELATIVE_DEADLINE_1_MORE") :
		t("RELATIVE_DEADLINE_N_MORE", {days: days})
	}</time>
}

function serializeUser(user) {
	return {
		id: user.id,
		name: user.name,
		email: user.email
	}
}
