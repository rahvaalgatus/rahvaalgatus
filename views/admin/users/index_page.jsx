/** @jsx Jsx */
var Jsx = require("j6pack")
var Page = require("../page")
var formatDateTime = require("root/lib/i18n").formatDateTime

module.exports = function(attrs) {
	var req = attrs.req
	var users = attrs.users

	return <Page page="users" title="Users" req={req}>
		<h1 class="admin-heading">
			Users
			{" "}
			<span class="admin-count">({users.length})</span>
		</h1>

		<table class="admin-table users">
			<thead>
				<th>Created At</th>
				<th>Name</th>
			</thead>

			<tbody>{users.map(function(user) {
				var url = req.baseUrl + "/users/" + user.id

				return <tr>
					<td>
						{formatDateTime("numeric", user.created_at)}<br />
					</td>

					<td>
						<a href={url} class="admin-link">{user.name}</a>
					</td>
				</tr>
			})}</tbody>
		</table>
	</Page>
}
