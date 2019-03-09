/** @jsx Jsx */
var Jsx = require("j6pack")
var Config = require("root/config")
var Fragment = Jsx.Fragment
var stringify = require("root/lib/json").stringify
var selected = require("root/lib/css").selected
var SITE_TITLE = Config.title
var LANGS = Config.languages
var ENV = process.env.ENV
exports = module.exports = Page
exports.Form = Form
exports.LiveReload = LiveReload

function Page(attrs, children) {
	var req = attrs.req
	var t = req.t
	var id = attrs.id
	var title = attrs.title
	var translatable = req.lang === "xx" || "translatable" in req.query

	var assemblyLogo = "/assets/esstikoostoo_logo.png"
	if (req.lang !== "et") assemblyLogo = "/assets/esstikoostoo_logo_en.png"

	return <html>
		<head>
			<meta charset="utf-8" />
			<meta name="viewport" content="width=device-width" />
			<link rel="stylesheet" href="/assets/page.css" type="text/css" />
			<title>{title == null ? "" : title + " - "} {SITE_TITLE}</title>

			<meta
				property="og:image"
				content={Config.url + "/assets/rahvaalgatus-description.png"}
			/>

			{ENV === "staging" || ENV === "production" ?
				<Sentry dsn={Config.sentryPublicDsn} req={req} />
			: null}

			<LiveReload req={req} />
		</head>

		<body id={id + "-page"}>
			<header id="header"><center>
				<menu>
					<Form action="/session" method="put" class="languages" req={req}>
						{LANGS.map((lang) => <button
							name="language"
							value={lang}
							disabled={req.lang === lang}
							class="inherited">{t(lang)}
						</button>)}

						{translatable ? <button
							name="language"
							value="xx"
							disabled={req.lang === "xx"}
							class="inherited">Translate
						</button> : null}
					</Form>

					{req.user ? <div class="right">
						<a href="/user" class="user">{req.user.name}</a>

						<Form action="/session" method="post" class="signout" req={req}>
							<button name="_method" value="delete" class="inherited">
								{t("BTN_LOG_OFF")}
							</button>
						</Form>
					</div> : <a href="/session/new" class="right" >
						{t("BTN_LOG_IN_REGISTER")}
					</a>}
				</menu>

				<a
					href="https://heakodanik.ee/annetuste-kogumise-hea-tava/"
					title="Hea annetuse koguja"
					class="hea-annetus"
				>
					<img src="/assets/hea-annetus.png" alt="Hea annetuse koguja" />
				</a>

				<a
					href="https://uuseakus.rahvaalgatus.ee"
					title="Uue eakuse rahvakogu"
					class="uuseakus"
				>
					<img src="/assets/uuseakus.png" alt="Uue eakuse rahvakogu" />
				</a>

				<a
					href="https://kestame.rahvaalgatus.ee"
					title="#kuidasmekestame"
					class="kestame"
				>
					<img src="/assets/kestame.png" alt="#kuidasmekestame" />
				</a>

				<a href="/" class="logo">
					<img src="/assets/rahvaalgatus.png" alt={SITE_TITLE} />
				</a>

				<nav>
					<ul>
						<li>
							<a
								href="/initiatives"
								class={
									selected(id, "initiatives") || selected(id, "initiative")
								}>
								{t("LINK_VOTING")}
							</a>
						</li>

						<li><a href={Config.helpUrls[req.lang]}>
							{t("LINK_HELP")}
						</a></li>

						<li><a href="/about" class={selected(id, "about")}>
							{t("LNK_ABOUT")}
						</a></li>

						<li><a href="/donate" class={selected(id, "donate")}>
							{t("LNK_SUPPORT")}
						</a></li>
					</ul>
				</nav>
			</center></header>

			<main id="main">{children}</main>

			<footer id="footer"><center>
				<div class="contact">
					<a href="https://kogu.ee">
						<img width="200" src={assemblyLogo} alt={t("KOGU")} />
					</a>

					<p>
						{t("FOOTER_ADDRESS")}
						<br />
						{t("FOOTER_EMAIL")}
						<br />
						{t("FOOTER_PHONE")}

						<br />
						Facebook: <a href="https://www.facebook.com/rahvaalgatus">
							fb.me/rahvaalgatus
						</a>

						<br />
						Twitter: <a href="https://twitter.com/rahvaalgatus">
							@rahvaalgatus
						</a>
					</p>
				</div>
				<div class="powered-by">
					<p>
						<a href="https://citizenos.com">
							<img src="/assets/citizenos_logo_big.png" alt="Citizen OS" />
						</a>
						<br />
						{t("POWERED_BY")}
					</p>
				</div>
			</center></footer>

			{ENV === "production" && Config.googleAnalyticsAccount ?
				<GoogleAnalytics accountId={Config.googleAnalyticsAccount} />
			: null}

			{ENV === "production" && Config.userVoiceApiKey ?
				<UserVoice req={req} apiKey={Config.userVoiceApiKey} />
			: null}
		</body>
	</html>
}

function Form(attrs, children) {
	var method = attrs.method

	return <form
		id={attrs.id}
		class={attrs.class}
		action={attrs.action}
		method={method == "get" ? method : "post"}
	>
		{!(method == "get" || method == "post") ?
			<input type="hidden" name="_method" value={method} />
		: null}

		<input type="hidden" name="_csrf_token" value={attrs.req.csrfToken} />

		{children}
	</form>
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
					"no_certificates"
				]
			}).install()
		`}</script>
	</Fragment>
}

function LiveReload(attrs) {
	if (ENV !== "development") return null
	var req = attrs.req

	return <script
		src={"http://" + req.hostname + ":35729/livereload.js?snipver=1"}
		async
		defer
	/>
}

function GoogleAnalytics(attrs) {
	var id = attrs.accountId

	return <Fragment>
		<script>{`(function() {
			function args() { return arguments }
			window.dataLayer = [args("js", new Date), args("config", "${id}")]
		})()`}</script>

		<script src={"https://www.googletagmanager.com/gtag/js?id=" + id} async />
	</Fragment>
}

function UserVoice(attrs) {
	var user = attrs.req.user

	return <Fragment>
		<script>{`
			window.UserVoice = [
				["identify", ${stringify(user ? serializeUser(user) : null)}],

				["set", {
						accent_color: "#808283",
						trigger_color: "white",
						trigger_background_color: "rgba(46, 49, 51, 0.6)"
				}],

				["addTrigger", {
					mode: "contact",
					trigger_position: "bottom-right"
				}]
			]
		`}</script>

		<script src={"//widget.uservoice.com/" + attrs.apiKey + ".js"} async />
	</Fragment>
}

function serializeUser(user) {
	return {
		id: user.id,
		name: user.name,
		email: user.email,
		language: user.language
	}
}
