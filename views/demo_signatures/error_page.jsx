/** @jsx Jsx */
var Jsx = require("j6pack")
var Page = require("../page")
var {Section} = require("../page")

module.exports = function({req, title, description}) {
	return <Page
		page="demo-signature-error"
		title={title}
		headless
		req={req}
	>
		<Section id="error" class="primary-section text-section"><center>
			<h1>{title}</h1>
			<p class="description">{description}</p>
		</center></Section>
	</Page>
}
