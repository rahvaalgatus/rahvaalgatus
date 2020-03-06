/** @jsx Jsx */
var Jsx = require("j6pack")
var Page = require("../page")
var I18n = require("root/lib/i18n")
var DonateForm = require("../donations/create_page").DonateForm

module.exports = function(attrs) {
	var req = attrs.req
	var t = req.t
  var lang = req.lang
	var signature = req.signature
	var signatureUrl = "/demo-signatures/" + signature.token.toString("hex")
		
	return <Page
		page="created-demo-signature"
		class="demo-signatures-page"
		title={t("DEMO_SIGNATURES_TITLE")}
		navless
		req={req}>
		<header class="header-section text-header"><center>
			<h1>{t("DEMO_SIGNATURES_HEADER")}</h1>
		</center></header>

		<section class="primary-section text-section"><center>
			<h2 class="subheading">{t("THANKS_FOR_SIGNING")}</h2>

			<p>Nam nec consequat mi. Aenean vitae orci elit. Sed non finibus risus. Ut feugiat enim nec dolor scelerisque venenatis. Donec urna felis, tristique sit amet libero sed, ultricies ullamcorper dolor. Pellentesque sed ullamcorper nisi. Phasellus pretium tristique nunc eget tempus. Donec eget magna lacinia, iaculis purus nec, accumsan quam. Pellentesque consectetur magna ut pretium tempus. Aenean iaculis justo erat, a viverra diam pulvinar non. Donec ac urna purus. Vestibulum nec nulla efficitur, molestie leo in, aliquet orci. Donec facilisis porta sapien quis viverra. Maecenas at eros et urna ultricies suscipit in blandit ex.</p>

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
