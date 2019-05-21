/** @jsx Jsx */
var Jsx = require("j6pack")
var Page = require("./page")

module.exports = function(attrs) {
	var req = attrs.req
	var t = attrs.t
	var errors = attrs.errors

	return <Page page="error" req={req}>
		<section class="primary-section text-section"><center>
			<h1>{t("INVALID_FORM")}</h1>
			<ol>{errors.map((error) => <li>{error}</li>)}</ol>
		</center></section>
	</Page>
}
