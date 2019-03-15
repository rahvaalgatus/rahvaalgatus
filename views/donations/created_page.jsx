/** @jsx Jsx */
var Jsx = require("j6pack")
var Page = require("../page")

module.exports = function(attrs) {
	var req = attrs.req
	var t = req.t

	return <Page page="donated" title={t("SUPPORT_US_TITLE")} req={req}>
		<section id="about" class="primary-section text-section"><center>
			<h1>{t("SUPPORT_US_TITLE")}</h1>
			<p>Täname toetuse eest!</p>
		</center></section>
	</Page>
}
