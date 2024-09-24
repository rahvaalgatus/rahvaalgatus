/** @jsx Jsx */
var _ = require("root/lib/underscore")
var Jsx = require("j6pack")
var Page = require("../page")
var Initiative = require("root/lib/initiative")
var Filtering = require("root/lib/filtering")
var {FiltersView} = Page
var {PaginationView} = Page
var {SortButton} = Page
var {formatDateTime} = require("root/lib/i18n")

module.exports = function(attrs) {
	var {req} = attrs
	var {filters} = attrs
	var {offset} = attrs
	var {limit} = attrs
	var {comments} = attrs
	var {totalCount} = attrs
	var [orderBy, orderDir] = attrs.order
	var filterQuery = serializeFilters(filters)
	var basePath = req.baseUrl

	var query = _.defaults({
		order: orderBy ? (orderDir == "asc" ? "" : "-") + orderBy : undefined
	}, filterQuery)

	return <Page page="comments" title="Comments" req={req}>
		<h1 class="admin-heading">Comments</h1>

		<FiltersView
			label="Filter Comments"
			expanded={anyDefined(filters)}
			path={basePath}
			submitLabel = "Filter Comments"
		>
			<label class="admin-form-field">
				<span class="admin-form-label">Walled</span>

				<select name="walled" class="admin-select">
					<option value="" selected={filters.walled === undefined}>
						All
					</option>

					<hr />

					<option value="null" selected={filters.walled === null}>
						Undecided
					</option>

					<option value="false" selected={filters.walled === false}>
						Unwalled
					</option>

					<option value="true" selected={filters.walled === true}>
						Walled
					</option>
				</select>
			</label>

			<input type="hidden" name="limit" value={limit} />

			<input
				type="hidden"
				name="order"
				value={(orderDir == "asc" ? "" : "-") + orderBy}
			/>
		</FiltersView>

		<table class="admin-table comments">
			{totalCount > 0 ? <caption>Showing {offset + 1}-{Math.min(offset + limit, totalCount)} out of {totalCount} comments.</caption> : null}

			<thead>
				<th>
					<SortButton
						path={basePath}
						query={filterQuery}
						name="id"
						direction="desc"
						sorted={orderBy == "id" ? orderDir : null}
					>
						Id
					</SortButton>
				</th>

				<th>Created At<br /><small>Author</small></th>
				<th class="text-column">Text</th>

				<th class="reports-column">
					<SortButton
						path={basePath}
						query={filterQuery}
						name="report-count"
						direction="desc"
						sorted={orderBy == "report-count" ? orderDir : null}
					>
						Reports
					</SortButton>
				</th>
			</thead>

			<tbody>{comments.map((comment) => <tr>
				<td>
					<a class="admin-link" href={basePath + "/" + comment.id}>
						{comment.id}
					</a>
				</td>

				<td>
					{formatDateTime("numeric", comment.created_at)}<br />

					<a
						class="admin-link"
						href={req.rootUrl + "/users/" + comment.user_id}
					>
						{comment.user_name}
					</a>
				</td>

				<td class="text-column">
					{comment.title ? <h3>
						<a
							href={Initiative.slugUrl({
								id: comment.initiative_id,
								slug: comment.initiative_slug
							}) + "/comments/" + (comment.parent_id || comment.id)}

							class="admin-link"
						>{comment.title}</a>
					</h3> : null}

					<p class="admin-text">{comment.text}</p>
				</td>

				<td class="reports-column">
					<p class="report-decision">{comment.walled != null
						? <>
							<strong>{comment.walled ? "Walled" : "Unwalled"}</strong>
							{" by "}
							<a
								class="admin-link"
								href={req.rootUrl + "/users/" + comment.walled_by_id}
							>
								{comment.walled_by_name}
							</a>
						</>
						: comment.reports.length > 0
						? <i>Undecided</i>
						: null
					}</p>

					{comment.reports.length > 0 ? <>
						<h2>Reported By</h2>

						<ul class="reports">{comment.reports.map((report) => <li>
							<a
								class="admin-link"
								href={req.rootUrl + "/users/" + report.created_by_id}
							>
								{report.created_by_name}
							</a>
						</li>)}</ul>
					</> : null}
				</td>
			</tr>)}</tbody>
		</table>

		{totalCount > 0 ? <PaginationView
			total={totalCount}
			index={offset}
			pageSize={limit}
			path={basePath}
			query={query}
		/> : null}
	</Page>
}

function serializeFilters(filters) {
	filters = _.clone(filters)
	if (filters.walled === null) filters.walled = "null"
	return Filtering.serializeFilters(filters)
}

function anyDefined(obj) { return _.any(obj, (value) => value !== undefined) }
