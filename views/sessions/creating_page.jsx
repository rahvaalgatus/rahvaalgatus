/** @jsx Jsx */
var _ = require("root/lib/underscore")
var Jsx = require("j6pack")
var Page = require("../page")
var Fragment = Jsx.Fragment
var javascript = require("root/lib/jsx").javascript
var stringify = require("root/lib/json").stringify
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
				: method == "mobile-id" ? <Fragment>
					<p>
						<strong>
							{t("CONTROL_CODE", {code: _.padLeft(code, 4, 0)})}
						</strong>
						<br />
						{t("MOBILE_ID_CONFIRMATION_CODE_FOR_AUTHENTICATION")}
					</p>

					<script>{javascript`
						fetch("${poll}", {
							method: "POST",
							credentials: "same-origin",

							headers: {
								"X-CSRF-Token": ${stringify(req.csrfToken)},
								Accept: "application/x-empty, ${ERR_TYPE}",
								"Content-Type": "application/x-www-form-urlencoded"
							},

							body: "method=mobile-id",

							// Fetch polyfill doesn't support manual redirect, so use
							// x-empty.
							redirect: "manual"
						}).then(function(res) {
							// WhatWG-Fetch polyfill lacks res.url.
							window.location.assign(res.headers.get("Location") || "${poll}")
						})
					`}</script>
				</Fragment> : null}
		</center></section>
	</Page>
}
