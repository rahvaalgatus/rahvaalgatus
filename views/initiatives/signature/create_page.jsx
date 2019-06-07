/** @jsx Jsx */
var Jsx = require("j6pack")
var Fragment = Jsx.Fragment
var InitiativePage = require("../initiative_page")
var javascript = require("root/lib/jsx").javascript

module.exports = function(attrs) {
	var req = attrs.req
	var t = req.t
	var initiative = attrs.initiative
	var error = attrs.error
	var method = attrs.method
	var code = attrs.code
	var poll = attrs.poll

	return <InitiativePage
		page="initiative-signature"
		title={initiative.title}
		initiative={initiative}
		req={req}>
		<section id="initiative-signature" class="text-section primary-section">
			<center>
				{error
					? <p class="flash error">{error}</p>
					: method == "mobile-id" ? <Fragment>
						<p>
							<strong>{t("CONTROL_CODE", {code: code})}</strong>
							<br />
							{t("MAKE_SURE_CONTROL_CODE")}
						</p>

						<script>{javascript`
							fetch("${poll}", {
								redirect: "manual",
								credentials: "same-origin"
							}).then(function(res) {
								if (res.status >= 302 && res.status <= 303)
									window.location.assign(res.headers.get("location"))
								else
									// WhatWG-Fetch polyfill lacks res.url.
									window.location.assign("${poll}")
							})
						`}</script>
				</Fragment> : null}
			</center>
		</section>
	</InitiativePage>
}
