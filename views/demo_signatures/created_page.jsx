/** @jsx Jsx */
var Jsx = require("j6pack")
var Page = require("../page")
var I18n = require("root/lib/i18n")
var {DonateForm} = require("../donations/create_page")

module.exports = function(attrs) {
	var {req} = attrs
	var {t} = req
  var {lang} = req
	var {signature} = req
	var signatureUrl = "/demo-signatures/" + signature.token.toString("hex")

	return <Page
		page="created-demo-signature"
		class="demo-signatures-page"
		title={t("DEMO_SIGNATURES_TITLE")}
		headless
		req={req}>
		<header class="header-section text-header"><center>
			<a href="https://demokraatia.rahvaalgatus.ee" class="home">
				<img src="/assets/dtv.svg" alt="Demokraatia töövihik" />
			</a>

			<h1>{t("DEMO_SIGNATURES_HEADER")}</h1>
		</center></header>

		<section class="primary-section text-section"><center>
			<h2 class="subheading">{t("DEMO_SIGNATURES_SIGNED_HEADER")}</h2>
			<p>{t("DEMO_SIGNATURES_SIGNED_TEXT")}</p>

			<a class="button blue-button" href={signatureUrl + ".asice"}>
				Lae allkiri alla
			</a>
		</center></section>

		<section id="sign" class="secondary-section text-section"><center>
			<h2 class="subheading">{t("SUPPORT_US_TITLE")}</h2>
			{Jsx.html(I18n.markdown(lang, "donate"))}
			<DonateForm req={req} t={t} for="education" />
		</center></section>
	</Page>
}
