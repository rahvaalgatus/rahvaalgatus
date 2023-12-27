/** @jsx Jsx */
var Jsx = require("j6pack")
var Page = require("../page")
var Comment = require("root/lib/comment")
var Initiative = require("root/lib/initiative")
var {formatDateTime} = require("root/lib/i18n")

module.exports = function(attrs) {
	var {req} = attrs
	var {comments} = attrs

	return <Page page="comments" title="Comments" req={req}>
		<h1 class="admin-heading">Comments</h1>
		<h2 class="admin-subheading">Latest 15 Comments</h2>

		<table class="admin-table comments">
			<thead>
				<th>Created At &amp; By</th>
				<th>Text</th>
			</thead>

			<tbody>{comments.map((comment) => <tr>
				<td>
					{formatDateTime("numeric", comment.created_at)}<br />

					<a
						class="admin-link"
						href={req.baseUrl + "/users/" + comment.user_id}
					>
						{comment.user_name}
					</a>
				</td>

				<td>
					{comment.title ? <h3>
						<a
							href={Initiative.slugUrl({
								id: comment.initiative_id,
								slug: comment.initiative_slug
							}) + "/comments/" + (comment.parent_id || comment.id)}

							class="admin-link"
						>{comment.title}</a>
					</h3> : null}

					<p class="admin-text">{Jsx.html(Comment.htmlify(comment.text))}</p>
				</td>
			</tr>)}</tbody>
		</table>
	</Page>
}
