/** @jsx Jsx */
var Jsx = require("j6pack")
var Page = require("../page")
var {MobileIdView} = require("root/views/initiatives/signatures/creating_page")
exports = module.exports = CreatingPage

function CreatingPage(attrs) {
	var req = attrs.req
	var t = req.t
	var error = attrs.error
	var method = attrs.method
	var code = attrs.code
	var poll = attrs.poll

	return <Page
		page="creating-demo-signature"
		title={t("DEMO_SIGNATURES_TITLE")}
		navless
		req={req}>
		<script src="/assets/html5.js" />

		<section class="text-section primary-section">
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
	</Page>
}
