/** @jsx Jsx */
var Jsx = require("j6pack")
var Page = require("../page")
var Fragment = Jsx.Fragment
var formatDateTime = require("root/lib/i18n").formatDateTime

module.exports = function(attrs) {
	var req = attrs.req
	var user = attrs.user

	return <Page page="user" title={"User - " + user.name} req={req}>
		<a href={req.baseUrl + "/users"} class="admin-back">Users</a>
		<h1 class="admin-heading">{user.name}</h1>

		<table id="initiative-table" class="admin-horizontal-table">
			<tr>
				<th scope="row">Created At</th>
				<td>{formatDateTime("numeric", user.created_at)}</td>
			</tr>

			<tr>
				<th scope="row">Official Name</th>
				<td>{user.official_name}</td>
			</tr>

			<tr>
				<th scope="row">Personal Id</th>
				<td>
					{user.personal_id ? user.country + " " + user.personal_id : null}
				</td>
			</tr>

			<tr>
				<th scope="row">Email</th>
				<td>{user.email ? <Fragment>
					<a href={"mailto:" + user.email} class="admin-link">
					{user.email}
					</a><br />

					Confirmed at {formatDateTime("numeric", user.email_confirmed_at)}.
				</Fragment> : null}</td>
			</tr>

			<tr>
				<th scope="row">Unconfirmed Email</th>
				<td>{user.unconfirmed_email ? <Fragment>
					<a href={"mailto:" + user.unconfirmed_email} class="admin-link">
					{user.unconfirmed_email}
					</a><br />

					Confirmation sent at
					{formatDateTime("numeric", user.email_confirmed_at)}.
				</Fragment> : null}</td>
			</tr>
		</table>
	</Page>
}
