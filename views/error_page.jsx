/** @jsx Jsx */
var Jsx = require("j6pack")
var Page = require("./page")
var {Section} = require("./page")

module.exports = function(attrs) {
	var req = attrs.req

	return <Page page="error" req={req}>
		<Section class="primary-section text-section">
			<h1>{attrs.title}</h1>
			<p>{attrs.body}</p>
		</Section>
	</Page>
}
