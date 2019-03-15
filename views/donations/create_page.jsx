/** @jsx Jsx */
var Jsx = require("j6pack")
var Page = require("../page")
var Form = require("../page").Form
exports = module.exports = CreatePage
exports.DonateForm = DonateForm

function CreatePage(attrs) {
	var req = attrs.req
	var t = req.t
	var amount = attrs.amount

	return <Page page="donate" title={t("SUPPORT_US_TITLE")} req={req}>
		<section class="primary-section">
			<center class="text-section">
				<h1>{t("SUPPORT_US_TITLE")}</h1>
				{Jsx.html(t("SUPPORT_US_CONTENT"))}
			</center>

			<center><DonateForm req={req} t={t} amount={amount} /></center>
		</section>

		<section class="secondary-section text-section"><center>
			<p>{Jsx.html(t("SUPPORTERS"))}</p>
		</center></section>
	</Page>
}

function DonateForm(attrs) {
	var req = attrs.req
	var t = attrs.t
	var amount = attrs.amount
	var pseudoInt = require("root/lib/crypto").pseudoInt
	var def = amount == null ? 3 + pseudoInt(7) : 0

	return <Form req={req} method="post" action="/donations" class="donate-form">
		<input type="hidden" name="default" value={def} />

		<label class="form-label">{t("SUPPORT_LABEL")}</label>
		<br />
		<label class="amount-input">
			<input
				type="numeric"
				name="amount"
				value={amount || def}
				required
				class="form-input"
			/>
		</label>

		<br />
		<label class="form-label">Isikukood (kui soovid tulumaksu tagasi)</label>
		<br />
		<input name="person" maxlength={32} class="form-input" />

		<button class="form-submit secondary-button">{t("SUPPORT_BUTTON")}</button>

		<label class="form-checkbox tos-checkbox">
			<input type="checkbox" name="accept-tos" required />
			{Jsx.html(t("I_HAVE_READ", {url: "/about#tos"}))}
		</label>

		<p class="text">{t("SUPPORT_REDIRECT")}</p>
	</Form>
}
