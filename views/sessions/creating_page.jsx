/** @jsx Jsx */
var _ = require("root/lib/underscore")
var Jsx = require("j6pack")
var Page = require("../page")
var Fragment = Jsx.Fragment
var javascript = require("root/lib/jsx").javascript
var ERR_TYPE = "application/vnd.rahvaalgatus.error+json"

module.exports = function(attrs) {
	var t = attrs.t
	var req = attrs.req
	var code = attrs.code
	var error = attrs.error
	var method = attrs.method
	var poll = attrs.poll

	return <Page page="create-session" title="Logi sisse" req={req}>
		<script src="/assets/html5.js" />

		<section class="primary-section text-section"><center>
			{error
				? <p class="flash error">{error}</p>
				: method == "mobile-id" || method == "smart-id" ? <MobileIdView
					req={req}
					t={t}
					method={method}
					code={code}
					poll={poll}
				/>
				: null}
		</center></section>
	</Page>
}

function MobileIdView(attrs) {
	var req = attrs.req
	var t = attrs.t
	var code = attrs.code
	var poll = attrs.poll
	var method = attrs.method

	return <Fragment>
		<p>
			<strong>{t("CONTROL_CODE", {code: _.padLeft(code, 4, 0)})}</strong><br />

			{method == "mobile-id"
				? t("MOBILE_ID_CONFIRMATION_CODE_FOR_AUTHENTICATION")
				: t("SMART_ID_CONFIRMATION_CODE_FOR_AUTHENTICATION")
			}
		</p>

		<script>{javascript`
			fetch(${poll}, {
				method: "POST",
				credentials: "same-origin",

				headers: {
					"X-CSRF-Token": ${req.csrfToken},
					Accept: ${"application/x-empty, " + ERR_TYPE},
					"Content-Type": "application/x-www-form-urlencoded"
				},

				body: "method=" + ${method},

				// Fetch polyfill doesn't support manual redirect, so use
				// x-empty.
				redirect: "manual"
			}).then(function(res) {
				// WhatWG-Fetch polyfill lacks res.url.
				window.location.assign(res.headers.get("Location") || ${poll})
			})
		`}</script>
	</Fragment>
}
