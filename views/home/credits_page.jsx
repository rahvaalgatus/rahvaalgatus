/** @jsx Jsx */
var Jsx = require("j6pack")
var Page = require("../page")
var readMarkdown = require("root/lib/markdown").readSync
var CREDITS = fixPaths(readMarkdown(__dirname + "/../../CREDITS.md"))

module.exports = function(attrs) {
	var req = attrs.req

	return <Page page="credits" title="Credits" req={req}>
		<section id="credits" class="primary-section text-section"><center>
			{Jsx.html(CREDITS)}
		</center></section>
	</Page>
}

function fixPaths(html) { return html.replace(/public\//g, "/") }
