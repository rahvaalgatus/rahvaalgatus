/** @jsx Jsx */
var Jsx = require("j6pack")
var Page = require("../page")
var I18n = require("root/lib/i18n")

module.exports = function(attrs) {
	var req = attrs.req
	var lang = req.lang

	return <Page page="api" title="API" req={req}>
		<script src="/assets/html5.js" />

		<section class="primary-section text-section"><center>
			{Jsx.html(I18n.markdown(lang, "api"))}
		</center></section>
	</Page>
}
