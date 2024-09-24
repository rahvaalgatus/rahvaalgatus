/** @jsx Jsx */
var Jsx = require("j6pack")
var Page = require("../page")
var {Form} = Page
var {Flash} = Page
var {formatDateTime} = require("root/lib/i18n")

module.exports = function({req, comment, reports}) {
	return <Page page="comment" title="Comment" req={req}>
		<a href={req.baseUrl} class="admin-back">Comments</a>
		<h1 class="admin-heading">Comment {comment.id}</h1>

		<Flash flash={req.flash} />

		<table class="admin-horizontal-table">
			<tr>
				<th scope="row">Initiative</th>
				<td>
					<a
						class="admin-link"
						href={req.rootUrl + "/initiatives/" + comment.initiative_id}
					>
						{comment.initiative_title}
					</a>
				</td>
			</tr>

			{comment.parent_id ? <tr>
				<th scope="row">Parent Comment</th>
				<td>
					<a class="admin-link" href={req.baseUrl + "/" + comment.parent_id}>
						{comment.parent_id}
					</a>
				</td>
			</tr> : null}

			<tr>
				<th scope="row">Created At</th>
				<td>{formatDateTime("numeric", comment.created_at)}</td>
			</tr>

			<tr>
				<th scope="row">Author</th>

				<td>
					<a
						class="admin-link"
						href={req.rootUrl + "/users/" + comment.user_id}
					>
						{comment.user_name}
					</a>
				</td>
			</tr>

			{comment.as_admin ? <tr>
				<th scope="row">As Admin</th>
				<td>Yes</td>
			</tr> : null}

			{comment.anonymized_at ? <tr>
				<th scope="row">Anonymized At</th>
				<td>{formatDateTime("numeric", comment.anonymized_at)}</td>
			</tr> : null}

			<tr>
				<th scope="row">Walled</th>

				<td>
					<Form
						req={req}
						id="comment-walled-form"
						class="admin-form --one-line"
						action={req.baseUrl + "/" + comment.id + "/walled"}
						method="put"
					>
						<label class="admin-form-field">
							<input
								type="radio"
								name="walled"
								value="false"
								checked={comment.walled === false}
							/>

							Unwalled
						</label>

						<label class="admin-form-field">
							<input
								type="radio"
								name="walled"
								value="true"
								checked={comment.walled === true}
							/>

							Walled
						</label>

						<button class="admin-submit">Set</button>
					</Form>

					{comment.walled != null ? <>
						{"Last set "}
						{formatDateTime("numeric", comment.walled_at)}
						{ " by "}
						<a
							class="admin-link"
							href={req.rootUrl + "/users/" + comment.walled_by_id}
						>
							{comment.walled_by_name}
						</a>
					</> : null}
				</td>
			</tr>
		</table>

		<div id="comment-text">
			{comment.parent_id == null ? <h3>{comment.title}</h3> : null}
			<p class="admin-text">{comment.text}</p>
		</div>

		{reports.length > 0 ? <>
			<h2 class="admin-subheading">
				Reports
			</h2>

			<table class="admin-table">
				<thead>
					<th>Reported At</th>
					<th>Reporter</th>
				</thead>

				<tbody>{reports.map((report) => <tr>
					<td>{formatDateTime("numeric", comment.created_at)}</td>

					<td>
						<a
							class="admin-link"
							href={req.rootUrl + "/users/" + report.created_by_id}
						>
							{report.created_by_name}
						</a>
					</td>
				</tr>)}</tbody>
			</table>
		</> : null}
	</Page>
}
