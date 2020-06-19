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
				<th>
					Name<br />
					<small>Identity Code</small>
				</th>
				<th>Email</th>
			</thead>

			<tbody>{users.map(function(user) {
				var url = req.baseUrl + "/" + user.id

				return <tr>
					<td>
						{formatDateTime("numeric", user.created_at)}<br />
					</td>

					<td>
						<a href={url} class="admin-link">{user.name}</a>
						<br />
						{user.personal_id
							? user.country + " " + user.personal_id
							: <em>No personal id</em>
						}
					</td>

					<td>{user.email ? <a href={"mailto:" + user.email} class="admin-link">
						{user.email}
					</a> : user.unconfirmed_email ? <span class="unconfirmed-email">
						<a
							href={"mailto:" + user.unconfirmed_email}
							class="admin-link"
						>
							{user.unconfirmed_email}
						</a> (Unconfirmed)
					</span> : null}</td>
				</tr>
			})}</tbody>
		</table>
	</Page>
}
