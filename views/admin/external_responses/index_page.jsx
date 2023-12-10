/** @jsx Jsx */
var Url = require("url")
var Jsx = require("j6pack")
var Page = require("../page")
var {formatDateTime} = require("root/lib/i18n")

module.exports = function({req, responses}) {
	return <Page page="external-responses" title="External Responses" req={req}>
		<h1 class="admin-heading">
			External Responses
			{" "}
			<span class="admin-count">({responses.length})</span>
		</h1>

		<table class="admin-table users">
			<thead>
				<th>Requested At</th>
				<th>Origin</th>
				<th>Path</th>
				<th>Updated At</th>
				<th>Updated Count</th>
				<th class="duration-column">Duration</th>
			</thead>

			<tbody>{responses.map(function(res) {
				var url = Url.parse(res.origin).resolve(res.path)

				return <tr>
					<td>{formatDateTime("numeric", res.requested_at)}</td>
					<td>{res.origin}</td>
					<td><a href={url} class="admin-link">{res.path}</a></td>
					<td>{formatDateTime("numeric", res.updated_at)}</td>
					<td>{res.updated_count} of {res.requested_count}</td>
					<td class="duration-column">{res.duration}s</td>
				</tr>
			})}</tbody>
		</table>
	</Page>
}
