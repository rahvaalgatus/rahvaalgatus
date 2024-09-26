/** @jsx Jsx */
var Jsx = require("j6pack")
var Page = require("../page")
var {Form} = require("../page")
var I18n = require("root/lib/i18n")
exports = module.exports = CreatePage
exports.DonateForm = DonateForm

function CreatePage(attrs) {
	var {req} = attrs
  var {lang} = req
	var {t} = req
	var {amount} = attrs

	return <Page page="donate" title={t("SUPPORT_US_TITLE")} req={req}>
		<section class="primary-section">
			<center class="text-section">
				<h1>{t("SUPPORT_US_TITLE")}</h1>
				{Jsx.html(I18n.markdown(lang, "donate"))}
			</center>

			<center><DonateForm req={req} t={t} amount={amount} /></center>
		</section>

		<section id="logo-section" class="secondary-section text-section"><center>
			<a href="https://heakodanik.ee/annetuste-kogumise-hea-tava/">
				<img src="/assets/hea-annetuse-koguja.png" alt="Hea Kodanik — Annetuste kogumise hea tava" />
			</a>

			<a href="https://www.teemeara.ee">
				<img src="/assets/teeme-ära.png" alt="Teeme Ära SA" />
			</a>

			<a href="https://www.kysk.ee/">
				<img src="/assets/kysk.png" alt="Kodanikuühiskonna Sihtkapital SA" />
			</a>
		</center></section>
	</Page>
}

function DonateForm(attrs) {
	var {req} = attrs
	var {t} = attrs
	var {amount} = attrs
	var {pseudoInt} = require("root/lib/crypto")
	var def = amount == null ? 3 + pseudoInt(23) : 0

  return <Form
    req={req}
    method="post"
    action="/donations"
    class="form donate-form"
  >
		<input type="hidden" name="default" value={def} />
		{attrs.for ? <input type="hidden" name="for" value={attrs.for} /> : null}

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
