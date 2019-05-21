/** @jsx Jsx */
var Jsx = require("j6pack")
var Page = require("./page")

module.exports = function(attrs) {
	var req = attrs.req

	return <Page page="error" req={req}>
		<section class="primary-section text-section"><center>
			<h1>{attrs.title}</h1>
			<p>{attrs.body}</p>
		</center></section>
	</Page>
}
