/** @jsx Jsx */
var Jsx = require("j6pack")
var Page = require("./page")
var {Section} = require("./page")

// TODO: Rename `body` to `description`.
module.exports = function({req, title, body}) {
	return <Page title={title} page="error" req={req}>
		<Section id="error" class="primary-section text-section">
			<h1>{title}</h1>
			<p class="description">{body}</p>
		</Section>
	</Page>
}
