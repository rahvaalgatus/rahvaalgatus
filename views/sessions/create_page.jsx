/** @jsx Jsx */
var _ = require("root/lib/underscore")
var Jsx = require("j6pack")
var Page = require("../page")
var Form = require("../page").Form
var Flash = require("../page").Flash
var Config = require("root/config")
var I18n = require("root/lib/i18n")
var javascript = require("root/lib/jsx").javascript
var stringify = require("root/lib/json").stringify
var SIGNABLE_TYPE = "application/vnd.rahvaalgatus.signable"
var ERR_TYPE = "application/vnd.rahvaalgatus.error+json"

var UI_TRANSLATIONS = _.mapValues(I18n.STRINGS, function(lang) {
	return _.filterValues(lang, (_value, key) => key.indexOf("HWCRYPTO") >= 0)
})

module.exports = function(attrs) {
	var t = attrs.t
	var req = attrs.req
	var flash = attrs.flash

	return <Page page="create-session" title={t("SIGNIN_PAGE_TITLE")} req={req}>
		<script src="/assets/html5.js" />
		<script src="/assets/hwcrypto.js" />

		<section class="transparent-section text-section"><center>
			<h1>{t("SIGNIN_PAGE_TITLE")}</h1>

			<Flash flash={flash} />

			<div id="signin-forms">
				<Form req={req} id="id-card-form" method="post" action="/sessions">
					<h2>
						<img src="/assets/id-card.svg" />
						Id-kaart
					</h2>

					<button
						name="method"
						value="id-card"
						class="secondary-button">
						Logi sisse Id-Kaardiga
					</button>

					{
						// This flash is for the the Id-card JavaScript code below.
					}
					<p id="id-card-flash" class="flash error" />
				</Form>

				<Form req={req} id="mobile-id-form" method="post" action="/sessions">
					<h2>
						<img src="/assets/mobile-id.svg" />
						Mobiil-Id
					</h2>

					<label class="form-label">
						{t("LABEL_PHONE_NUMBER")}

						<input
							type="tel"
							name="phoneNumber"
							placeholder={t("PLACEHOLDER_PHONE_NUMBER")}
							required
							class="form-input"
						/>
					</label>

					<label class="form-label">
						{t("LABEL_PERSONAL_ID")}

						<input
							type="text"
							pattern="[0-9]*"
							inputmode="numeric"
							name="personalId"
							placeholder={t("PLACEHOLDER_PERSONAL_ID")}
							required
							class="form-input"
						/>
					</label>

					<button
						name="method"
						value="mobile-id"
						class="secondary-button">
						Logi sisse Mobiil-Id-ga
					</button>
				</Form>

				{Config.smartId ? <Form
					req={req}
					id="smart-id-form"
					method="post"
					action="/sessions"
				>
					<h2>
						<img src="/assets/smart-id.svg" />
						Smart-Id
					</h2>

					<label class="form-label">
						Isikukood

						<input
							type="text"
							pattern="[0-9]*"
							inputmode="numeric"
							name="personalId"
							placeholder={t("PLACEHOLDER_PERSONAL_ID")}
							required
							class="form-input"
						/>
					</label>

					<button
						name="method"
						value="smart-id"
						class="secondary-button">
						Logi sisse Smart-Id-ga
					</button>
				</Form> : null}
			</div>

			<script>{javascript`
				var Hwcrypto = require("@rahvaalgatus/hwcrypto")
				var TRANSLATIONS = ${stringify(UI_TRANSLATIONS[req.lang])}
				var form = document.getElementById("id-card-form")
				var flash = document.getElementById("id-card-flash")
				var all = Promise.all.bind(Promise)

				form.addEventListener("submit", function(ev) {
					ev.preventDefault()
					notice("")

					var certificate = Hwcrypto.certificate("auth")

					var signable = certificate.then(function(certificate) {
						return fetch("/sessions", {
							method: "POST",
							credentials: "same-origin",

							headers: {
								"X-CSRF-Token": ${stringify(req.csrfToken)},
								"Content-Type": "application/pkix-cert",
								Accept: "${SIGNABLE_TYPE}, ${ERR_TYPE}"
							},

							body: certificate.toDer()
						}).then(assertOk).then(function(res) {
							return res.arrayBuffer().then(function(signable) {
								return [
									res.headers.get("location"),
									new Uint8Array(signable)
								]
							})
						})
					})

					var signature = all([certificate, signable]).then(function(all) {
						var certificate = all[0]
						var signable = all[1][1]
						return Hwcrypto.sign(certificate, "SHA-256", signable)
					})

					var done = all([signable, signature]).then(function(all) {
						var url = all[0][0]
						var signature = all[1]

						return fetch(url, {
							method: "POST",
							credentials: "same-origin",
							redirect: "manual",

							headers: {
								"X-CSRF-Token": ${stringify(req.csrfToken)},
								"Content-Type": "application/vnd.rahvaalgatus.signature",

								// Fetch polyfill doesn't support manual redirect, so use
								// x-empty.
								Accept: "application/x-empty, ${ERR_TYPE}"
							},

							body: signature
						}).then(assertOk).then(function(res) {
							window.location.assign(res.headers.get("location"))
						})
					})

					done.catch(noticeError)
					done.catch(raise)
				})

				function noticeError(err) {
					notice(
						err.code && TRANSLATIONS[err.code] ||
						err.description ||
						err.message
					)
				}

				function assertOk(res) {
					if (res.status >= 200 && res.status < 400) return res

					var err = new Error(res.statusText)
					err.code = res.status

					var type = res.headers.get("content-type")
					if (type == "${ERR_TYPE}")
						return res.json().then(function(body) {
							err.description = body.description
							throw err
						})
					else throw err
				}

				function notice(msg) { flash.textContent = msg }
				function raise(err) { setTimeout(function() { throw err }) }
			`}</script>
		</center></section>
	</Page>
}
