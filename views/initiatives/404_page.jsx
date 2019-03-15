/** @jsx Jsx */
var Jsx = require("j6pack")
var Page = require("../page")

module.exports = function(attrs) {
	var req = attrs.req

	return <Page page="error" req={req}>
		<section class="primary-section text-section"><center>
			<h1>Algatust ei leitud</h1>

			<p>
				See võib olla tingitud vigasest lingist või avalikustamata algatuse
				ligipääsupiirangutest. Kui arvad, et peaksid algatust nägema, palu
				algatuse loojal kontrollida, kas sulle on antud enne avalikustamiseks
				sellele ligipääs.
			</p>
		</center></section>
	</Page>
}
