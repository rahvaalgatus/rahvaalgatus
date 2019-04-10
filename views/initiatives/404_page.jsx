/** @jsx Jsx */
var Jsx = require("j6pack")
var Page = require("../page")

module.exports = function(attrs) {
	var req = attrs.req
	var t = attrs.t

	return <Page page="error" req={req}>
		<section class="primary-section text-section"><center>
			<h1>{attrs.title || t("INITIATIVE_404_TITLE")}</h1>
			<p>{attrs.body || t("INITIATIVE_404_BODY")}</p>
		</center></section>
	</Page>
}
