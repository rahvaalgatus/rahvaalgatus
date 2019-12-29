/** @jsx Jsx */
var _ = require("root/lib/underscore")
var Jsx = require("j6pack")
var Fragment = Jsx.Fragment
var InitiativePage = require("../initiative_page")
var javascript = require("root/lib/jsx").javascript

module.exports = function(attrs) {
	var req = attrs.req
	var t = req.t
	var initiative = attrs.initiative
	var topic = attrs.topic
	var error = attrs.error
	var method = attrs.method
	var code = attrs.code
	var poll = attrs.poll

	return <InitiativePage
		page="initiative-signature"
		title={initiative.title}
		initiative={initiative}
		topic={topic}
		req={req}>
		<script src="/assets/html5.js" />

		<section id="initiative-signature" class="text-section primary-section">
			<center>
				{error
					? <p class="flash error">{error}</p>
					: method == "mobile-id" ? <Fragment>
						<p>
							<strong>
								{t("CONTROL_CODE", {code: _.padLeft(code, 4, 0)})}
							</strong>
							<br />
							{t("MAKE_SURE_CONTROL_CODE")}
						</p>

						<script>{javascript`
							fetch("${poll}", {
								credentials: "same-origin",

								// Fetch polyfill doesn't support manual redirect, so use
								// x-empty.
								redirect: "manual",
								headers: {Accept: "application/x-empty"}
							}).then(function(res) {
								// WhatWG-Fetch polyfill lacks res.url.
								window.location.assign(res.headers.get("Location") || "${poll}")
							})
						`}</script>
				</Fragment> : null}
			</center>
		</section>
	</InitiativePage>
}
