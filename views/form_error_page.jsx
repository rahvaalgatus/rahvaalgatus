/** @jsx Jsx */
var Jsx = require("j6pack")
var Page = require("./page")

module.exports = function(attrs) {
	var {req} = attrs
	var {t} = attrs
	var {errors} = attrs

	return <Page page="error" req={req}>
		<section class="primary-section text-section"><center>
			<h1>{t("INVALID_FORM")}</h1>
			<ol>{errors.map((error) => <li>{error}</li>)}</ol>
		</center></section>
	</Page>
}
