/** @jsx Jsx */
var Jsx = require("j6pack")
var Page = require("../page")
var {Section} = require("../page")
var I18n = require("root/lib/i18n")

module.exports = function(attrs) {
	var req = attrs.req
	var t = req.t
	var lang = req.lang

	return <Page page="eu" title={t("EU_PAGE_TITLE")} req={req}>
		<Section id="hero-image" class="primary-section">
			<h1>
				<img src="/assets/eu-page-header.svg" alt={t("EU_PAGE_TITLE")} />
			</h1>
		</Section>

		<Section class="primary-section text-section">
			{Jsx.html(I18n.markdown(lang, "eu"))}
		</Section>

		<Section id="footer-image" class="primary-section">
			<img src="/assets/eu-page-footer.svg" alt="" />
		</Section>
	</Page>
}
