/** @jsx Jsx */
var Jsx = require("j6pack")
var Page = require("../page")
var {Form} = Page
var {Flash} = Page
var Config = require("root").config
var {Fragment} = Jsx
var {formatDateTime} = require("root/lib/i18n")

module.exports = function(attrs) {
	var {req} = attrs
	var {user} = attrs
	var {initiatives} = attrs
	var {comments} = attrs

	return <Page page="user" title={"User - " + user.name} req={req}>
		<a href={req.baseUrl} class="admin-back">Users</a>
		<h1 class="admin-heading">{user.name}</h1>

		<Flash flash={req.flash} />

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

					{user.email_confirmation_sent_at ? <Fragment>
						Confirmation sent at {
							formatDateTime("numeric", user.email_confirmation_sent_at)
						}.
					</Fragment> : null}
				</Fragment> : null}</td>
			</tr>
		</table>

		<h2 class="admin-subheading">
			Initiatives
			{" "}
			<span class="admin-count">({initiatives.length})</span>
		</h2>

		<table id="initiatives" class="admin-table">
			<thead>
				<tr>
					<th>
						Title<br />
						<small>Created At</small>
					</th>

					<th />
				</tr>
			</thead>

			<tbody>
				{initiatives.map(function(initiative) {
					var initiativePath = `${req.rootUrl}/initiatives/${initiative.uuid}`

					return <tr>
						<td>
							<h3 class={initiative.published_at ? "" : "unpublished"}>
								{initiative.published_at ? <a
									href={initiativePath}
									class="admin-link">{initiative.title}
								</a> : "Unpublished"}
							</h3>

							{initiative.created_at ?
								formatDateTime("numeric", initiative.created_at)
							: null}
						</td>

						<td>
							{initiative.published_at ? <a
								href={Config.url + "/initiatives/" + initiative.uuid}
								class="admin-link"
							>View on Rahvaalgatus</a> : null}
						</td>
					</tr>
				})}
			</tbody>
		</table>

		<h2 class="admin-subheading">
			Comments
			{" "}
			<span class="admin-count">({comments.length})</span>
		</h2>

		<table id="comments" class="admin-table">
			<thead>
				<tr>
					<th>
						Title<br />
						<small>Created At</small>
					</th>

					<th />
				</tr>
			</thead>

			<tbody>
				{comments.map(function(comment) {
					return <tr>
						<td>
							<h3 class={comment.parent_id == null ? "" : "reply"}>
								{comment.parent_id == null ? comment.title : "Reply"}
							</h3>

							{formatDateTime("numeric", comment.created_at)}<br />
						</td>

						<td>
							<a
								href={[
									Config.url,
									"/initiatives/",
									comment.initiative_uuid,
									"/comments/",
									comment.id
								].join("")}
								class="admin-link"
							>View on Rahvaalgatus</a>
						</td>
					</tr>
				})}
			</tbody>
		</table>

		<h2 class="admin-subheading">Merge Users</h2>
		{user.merged_with_id ? <p>
			This user was already merged with <a
			class="admin-link"
			href={req.baseUrl + "/" + user.merged_with_id}
			>{user.merged_with_name}</a>.
		</p> : user.personal_id == null ? <Form
			req={req}
			id="merge-form"
			method="put"
			action={req.baseUrl + "/" + user.id}
			>
			<p>
				Merge this account with another by specifying its <strong>personal
				id</strong>. Every initiative and comment made by the current account
				will be assigned to the new one.
			</p>

			<input
				class="admin-input"
				required
				name="mergedWithPersonalId"
				placeholder="Personal Id"
			/>
			<button class="admin-submit">Merge</button>
		</Form> : <p>
			This user already has a related personal id. You can't merge such
			accounts.
		</p>}
	</Page>
}
