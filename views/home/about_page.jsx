/** @jsx Jsx */
var Jsx = require("j6pack")
var Page = require("../page")
var I18n = require("root/lib/i18n")

module.exports = function(attrs) {
	var {req} = attrs
	var {t} = req
	var {lang} = req

	return <Page page="about" title={t("ABOUT_TITLE")} req={req}>
		<section id="about" class="primary-section text-section"><center>
			{Jsx.html(I18n.markdown(lang, "about"))}
		</center></section>
	</Page>
}
