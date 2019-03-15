/** @jsx Jsx */
var Jsx = require("j6pack")
var Page = require("../page")

module.exports = function(attrs) {
	var req = attrs.req
	var t = req.t

	return <Page page="about" title={t("ABOUT_TITLE")} req={req}>
		<section id="about" class="primary-section text-section"><center>
			{Jsx.html(t("ABOUT_CONTENT"))}
		</center></section>
	</Page>
}
