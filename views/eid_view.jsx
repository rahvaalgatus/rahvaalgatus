/** @jsx Jsx */
var Jsx = require("j6pack")
var {javascript} = require("root/lib/jsx")
var ERROR_TYPE = "application/vnd.rahvaalgatus.error+json"
var SIGNABLE_TYPE = "application/vnd.rahvaalgatus.signable"
var EMPTY_TYPE = "application/x-empty"
module.exports = EidView

function EidView({
	t,
	csrfToken,
	id: viewId,
	url,
	action, // "auth" or "sign"
	idCardAuthenticationUrl,
	mobileIdPrologue,
	smartIdPrologue,
	submit,
	pending,
	done,
	personalId,
	centered,
	buttonClass
}) {
	var HWCRYPTO_ERRORS = {
		NO_CERTIFICATES: t("eid_view.id_card_errors.no_certificates"),
		NO_IMPLEMENTATION: t("eid_view.id_card_errors.no_implementation"),
		NOT_ALLOWED: t("eid_view.id_card_errors.not_allowed"),
		TECHNICAL_ERROR: t("eid_view.id_card_errors.technical_error"),
		USER_CANCEL: t("eid_view.id_card_errors.user_cancel")
	}

	return <div
		id={viewId}
		class={"eid-view" + (centered ? " centered" : "")}
	>
		<input
			type="radio"
			id={viewId + "-id-card-tab-toggle"}
			name="method"
			value="id-card"
			hidden
		/>

		<input
			type="radio"
			id={viewId + "-mobile-id-tab-toggle"}
			name="method"
			value="mobile-id"
			hidden
		/>

		<input
			type="radio"
			id={viewId + "-smart-id-tab-toggle"}
			name="method"
			value="smart-id"
			hidden
		/>

		<div class="tabs">
			{action != "auth" || idCardAuthenticationUrl ? <label
				for={viewId + "-id-card-tab-toggle"}
				class="tab id-card-tab"
			>
				<img
					src="/assets/id-card-tab.svg"
					title={t("eid_view.tabs.id_card")}
					alt={t("eid_view.tabs.id_card")}
				/>
			</label> : null}

			<label
				for={viewId + "-mobile-id-tab-toggle"}
				class="tab mobile-id-tab"
			>
				<img
					src="/assets/mobile-id-tab.svg"
					title={t("eid_view.tabs.mobile_id")}
					alt={t("eid_view.tabs.mobile_id")}
				/>
			</label>

			<label
				for={viewId + "-smart-id-tab-toggle"}
				class="tab smart-id-tab"
			>
				<img
					src="/assets/smart-id-tab.svg"
					title={t("eid_view.tabs.smart_id")}
					alt={t("eid_view.tabs.smart_id")}
				/>
			</label>
		</div>

		{action == "sign" || idCardAuthenticationUrl ? <form
			action={action == "auth" ? idCardAuthenticationUrl : url}
			method="post"
			class="id-card-form"
		><fieldset>
			<input type="hidden" name="method" value="id-card" />
			<input type="hidden" name="_csrf_token" value={csrfToken} />

			<button class={buttonClass || "blue-button"} type="submit">
				{submit}
				<Spinner />
			</button>

			{action == "sign" ? <>
				<noscript><p>{t("eid_view.id_card.no_javascript")}</p></noscript>
			</> : null}

			<output />
		</fieldset></form> : null}

		<form action={url} method="post" class="mobile-id-form"><fieldset>
			<input type="hidden" name="method" value="mobile-id" />
			<input type="hidden" name="_csrf_token" value={csrfToken} />

			{mobileIdPrologue}

			<label>
				<span>{t("eid_view.mobile_id.phone_number")}</span>

				<input
					type="tel"
					required
					name="phone-number"
					class="form-input"
				/>
			</label>

			<label>
				<span>{t("eid_view.mobile_id.personal_id")}</span>

				<input
					type="text"
					pattern="[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]"
					inputmode="numeric"
					required
					name="personal-id"
					value={personalId}
					class="form-input"
				/>
			</label>

			<button class={buttonClass || "blue-button"} type="submit">
				{submit}
				<Spinner />
			</button>

			<output />
		</fieldset></form>

		<form action={url} method="post" class="smart-id-form"><fieldset>
			<input type="hidden" name="method" value="smart-id" />
			<input type="hidden" name="_csrf_token" value={csrfToken} />

			{smartIdPrologue}

			<label>
				<span>{t("eid_view.smart_id.personal_id")}</span>

				<input
					type="text"
					pattern="[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]"
					required
					inputmode="numeric"
					name="personal-id"
					value={personalId}
					class="form-input"
				/>
			</label>

			<button class={buttonClass || "blue-button"} type="submit">
				{submit}
				<Spinner />
			</button>

			<output />
		</fieldset></form>

		<script>{javascript`
			var view = document.getElementById(${viewId})
			var each = Function.call.bind(Array.prototype.forEach)
			var reduce = Function.call.bind(Array.prototype.reduce)
			var encode = encodeURIComponent

			if (${action == "auth"}) (function() {
				var form = view.querySelector("form.id-card-form")

				form.addEventListener("submit", function(ev) {
					// Disabling in the same tick prevents the form fields from being
					// sent.
					setTimeout(function() { setFormPending(form, true) }, 0)
				})
			})()
			else if (${action == "sign"}) (function() {
				var Hwcrypto = require("@rahvaalgatus/hwcrypto")
				var form = view.querySelector("form.id-card-form")
				var output = form.querySelector("output")
				var all = Promise.all.bind(Promise)

				form.addEventListener("submit", function(ev) {
					ev.preventDefault()
					setFormPending(form, true)

					notice(${pending})

					var certificate = Hwcrypto.certificate("sign")

					var obj = serializeForm(form)
					delete obj._csrf_token
					delete obj.method

					var signable = certificate.then(function(certificate) {
						return fetch(form.action + "?" + serializeQuery(obj), {
							method: "POST",
							credentials: "same-origin",

							headers: {
								"X-CSRF-Token": ${csrfToken},
								"Content-Type": "application/pkix-cert",
								Accept: [${SIGNABLE_TYPE}, ${ERROR_TYPE}].join(", ")
							},

							body: certificate.toDer()
						}).then(assertOk).then(function(res) {
							return res.arrayBuffer().then(function(signable) {
								return [res.headers.get("location"), new Uint8Array(signable)]
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
							method: "PUT",
							credentials: "same-origin",

							headers: {
								"X-CSRF-Token": ${csrfToken},
								"Content-Type": "application/vnd.rahvaalgatus.signature",
								Accept: [${EMPTY_TYPE}, ${ERROR_TYPE}].join(", ")
							},

							body: signature
						}).then(assertOk).then(function(res) {
							window.location.assign(res.headers.get("location"))
						})
					})

					done.catch(function(err) {
						notice(
							err.code && ${HWCRYPTO_ERRORS}[err.code] ||
							err.description ||
							err.message
						)

						setFormPending(form, false)
					})

					done.catch(raise)
				})

				function notice(msg) { output.textContent = msg }
				function raise(err) { setTimeout(function() { throw err }) }
			})()

			var personalIdInputs = view.querySelectorAll("input[name=personal-id]")

			each(personalIdInputs, function(from) {
				from.addEventListener("change", function(ev) {
					each(personalIdInputs, function(to) {
						if (to != from) to.value = ev.target.value
					})
				})
			})

			;[
				view.querySelector("form.mobile-id-form"),
				view.querySelector("form.smart-id-form")
			].forEach(function(form) {
				form.addEventListener("submit", handleMobileSubmit)
			})

			function handleMobileSubmit(ev) {
				ev.preventDefault()

				var form = ev.target
				var output = form.querySelector("output")
				function notice(msg) { output.textContent = msg || "" }

				notice(${pending})

				// NOTE: WhatWG-Fetch polyfill lacks res.url.
				fetch(form.action, {
					method: "POST",
					credentials: "same-origin",

          headers: {
            "Content-Type": "application/json",
						Accept: [${EMPTY_TYPE}, ${ERROR_TYPE}].join(", ")
          },

          body: JSON.stringify(serializeForm(form))
        }).then(assertOk).then(function(res) {
          var code = res.headers.get("X-Verification-Code")
          notice(${t("eid_view.verification_code")} + ": " + code)
					return wait(parseRefreshUrl(res.headers.get("refresh")))
        }).catch(function(err) {
          notice(err.description || err.message)
					setFormPending(form, false)
        })

				setFormPending(form, true)

				function wait(waitUrl) {
					return fetch(waitUrl, {
						credentials: "same-origin",
						headers: {Accept: ["application/json", ${ERROR_TYPE}].join(", ")}
					}).then(assertOk).then(function(res) {
						return res.json().then(function(obj) {
							if (obj.state == "DONE") {
								notice(${done})
								window.location.assign(res.headers.get("location"))
							}
							else if (obj.state == "PENDING") return wait(waitUrl)
						})
					})
				}
			}

			function setFormPending(form, pending) {
				form.firstChild.disabled = pending
				toggleClass(form, "pending", pending)
			}

			function toggleClass(el, klass, enabled) {
				var regexp = new RegExp("(^| )" + klass + "($| )", "g")
				el.className = el.className.replace(regexp, "")
				if (enabled) el.className += " " + klass
			}

			function serializeForm(form) {
				return reduce(form.elements, function(obj, el) {
					if (!(el.tagName == "INPUT")) return obj
					if (el.type == "radio" && !el.checked) return obj
					if (el.type == "checkbox" && !el.checked) return obj

					obj[el.name] = el.value
					return obj
				}, {})
			}

      function serializeQuery(obj) {
        var parts = []
        for (var key in obj) parts.push(key + "=" + encode(obj[key]))
        return parts.join("&")
      }

      function assertOk(res) {
        if (res.ok) return res

        var err = new Error(res.statusText)
        err.code = res.status

				if (isJsonType(res.headers.get("content-type")))
					return res.json().then(function(body) {
						err.message = body.message
						err.description = body.description
						throw err
					})
        else throw err
      }

			function isJsonType(type) {
				return (
					/^application\\/json(;|$)/.test(type) ||
					/^[^\\/]+\\/[^\\/]+\\+json(;|$)/.test(type)
				)
			}

			function parseRefreshUrl(header) {
				var m = /^\\d+;\\s*url=(.*)/.exec(header)
				return m && m[1]
			}
		`}</script>
	</div>
}

function Spinner() {
	return <span class="spinner">
		<span />
		<span />
		<span />
	</span>
}
