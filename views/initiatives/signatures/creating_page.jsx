/** @jsx Jsx */
var _ = require("root/lib/underscore")
var Jsx = require("j6pack")
var InitiativePage = require("../initiative_page")
var {javascript} = require("root/lib/jsx")
var ERR_TYPE = "application/vnd.rahvaalgatus.error+json"
exports = module.exports = CreatingPage
exports.MobileIdView = MobileIdView

function CreatingPage(attrs) {
	var {req} = attrs
	var {t} = req
	var {initiative} = attrs
	var {error} = attrs
	var {method} = attrs
	var {code} = attrs
	var {poll} = attrs

	return <InitiativePage
		page="initiative-signature"
		title={initiative.title}
		initiative={initiative}
		req={req}>
		<script src="/assets/html5.js" />

		<section id="initiative-signature" class="text-section primary-section">
			<center>
				{error
					? <p class="flash error">{error}</p>
					: method == "mobile-id" || method == "smart-id" ? <MobileIdView
						t={t}
						method={method}
						code={code}
						poll={poll}
				/>
				: null}
			</center>
		</section>
	</InitiativePage>
}

function MobileIdView(attrs) {
	var {t} = attrs
	var {code} = attrs
	var {poll} = attrs
	var {method} = attrs

	return <>
		<p>
			<strong>{t("CONTROL_CODE", {code: _.padLeft(code, 4, 0)})}</strong><br />

			{method == "mobile-id"
				? t("MOBILE_ID_CONFIRMATION_CODE_FOR_SIGNING")
				: t("SMART_ID_CONFIRMATION_CODE_FOR_SIGNING")
			}
		</p>

		<script>{javascript`
			fetch(${poll}, {
				credentials: "same-origin",
				headers: {Accept: ${"application/x-empty, " + ERR_TYPE}},

				// Fetch polyfill doesn't support manual redirect, so use
				// x-empty.
				redirect: "manual"
			}).then(function(res) {
				// WhatWG-Fetch polyfill lacks res.url.
				window.location.assign(res.headers.get("Location") || ${poll})
			})
		`}</script>
	</>
}
