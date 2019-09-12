/** @jsx Jsx */
var Jsx = require("j6pack")
var Page = require("../page")
var Form = require("../page").Form
var I18n = require("root/lib/i18n")
exports = module.exports = CreatePage
exports.DonateForm = DonateForm

function CreatePage(attrs) {
	var req = attrs.req
  var lang = req.lang
	var t = req.t
	var amount = attrs.amount

	return <Page page="donate" title={t("SUPPORT_US_TITLE")} req={req}>
		<section class="primary-section">
			<center class="text-section">
				<h1>{t("SUPPORT_US_TITLE")}</h1>
				{Jsx.html(I18n.markdown(lang, "donate"))}
			</center>

			<center><DonateForm req={req} t={t} amount={amount} /></center>
		</section>

		<section class="secondary-section text-section"><center>
			<p>{Jsx.html(I18n.markdown(lang, "donators"))}</p>
		</center></section>
	</Page>
}

function DonateForm(attrs) {
	var req = attrs.req
	var t = attrs.t
	var amount = attrs.amount
	var pseudoInt = require("root/lib/crypto").pseudoInt
	var def = amount == null ? 3 + pseudoInt(7) : 0

  return <Form
    req={req}
    method="post"
    action="/donations"
    class="form donate-form"
  >
		<input type="hidden" name="default" value={def} />

    <label class="form-fields">
      <span class="form-label">{t("SUPPORT_LABEL")}</span>
      <br />
      <span class="amount-input">
        <input
          type="numeric"
          name="amount"
          value={amount || def}
          required
          class="form-input"
        />
      </span>
    </label>

    <label class="form-fields">
      <span class="form-label">{t("SUPPORT_PERSONAL_CODE")}</span>
      <br />
      <input name="person" maxlength={32} class="form-input" />
    </label>

		<button class="form-submit secondary-button">{t("SUPPORT_BUTTON")}</button>

		<p class="text">{Jsx.html(t("SUPPORT_REDIRECT"))}</p>
	</Form>
}
