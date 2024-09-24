/** @jsx Jsx */
var _ = require("root/lib/underscore")
var Qs = require("qs")
var Jsx = require("j6pack")
var {LiveReload} = require("../page")
var {selected} = require("root/lib/css")
var {prefixed} = require("root/lib/css")
exports = module.exports = Page
exports.Form = require("../page").Form
exports.FormButton = require("../page").FormButton
exports.Flash = require("../page").Flash
exports.SortButton = require("../page").SortButton
exports.FiltersView = FiltersView
exports.PaginationView = PaginationView

function Page(attrs, children) {
	var {req} = attrs
	var {page} = attrs
	var {title} = attrs
	var path = (req.baseUrl + req.path).slice(req.rootUrl.length)
	if (!path.endsWith("/")) path += "/"

	return <html>
		<head>
			<meta charset="utf-8" />
			<meta name="viewport" content="width=device-width" />
			<link rel="stylesheet" href="/assets/admin.css" type="text/css" />
			<title>{title == null ? "" : title + " - "} Rahvaalgatus Admin</title>
			<LiveReload req={req} />
		</head>

		<body id={page + "-page"} class={attrs.class}>
			<header id="header">
				<h1>Rahvaalgatus.ee Admin</h1>

				<nav>
					<ul>
						<li>
							<a
								href={req.rootUrl || "/"}
								class={selected(req.rootUrl || "/", path)}
							>
								Dashboard
							</a>
						</li>

						<li>
							<a
								href={req.rootUrl + "/history"}
								class={prefixed("/history/", path)}>
								History
							</a>
						</li>

						<li>
							<a
								href={req.rootUrl + "/users"}
								class={prefixed("/users/", path)}>
								Users
							</a>
						</li>

						<li>
							<a
								href={req.rootUrl + "/destinations"}
								class={prefixed("/destinations/", path)}>
								Destinations
							</a>
						</li>

						<li>
							<a
								href={req.rootUrl + "/initiatives"}
								class={prefixed("/initiatives/", path)}>
								Initiatives
							</a>
						</li>

						{req.adminPermissions.includes("signatures") ? <li>
							<a
								href={req.rootUrl + "/signatures"}
								class={prefixed("/signatures/", path)}>
								Signatures
							</a>
						</li> : null}

						<li>
							<a
								href={req.rootUrl + "/comments"}
								class={prefixed("/comments/", path)}>
								Comments
							</a>
						</li>

						{/*<li>
							<a
								href={req.rootUrl + "/comment-reports"}
								class={prefixed("/comment-reports/", path)}>
								Comment Reports
							</a>
						</li>*/}

						<li>
							<a
								href={req.rootUrl + "/subscriptions"}
								class={prefixed("/subscriptions/", path)}
							>Subscriptions</a>
						</li>

						<li>
							<a
								href={req.rootUrl + "/external-responses"}
								class={prefixed("/external-responses/", path)}
							>External Responses</a>
						</li>
					</ul>
				</nav>
			</header>

			<main>{children}</main>
		</body>
	</html>
}

function FiltersView({label, path, submitLabel, expanded}, children) {
	return <details class="filters-view" open={expanded}>
		<summary>{label}</summary>

		<form method="get" action={path}>
			{children}

			<br />
			<button type="submit" class="admin-submit">
				{submitLabel}
			</button>
		</form>
	</details>
}

function PaginationView({total, index, pageSize, path, query}) {
  var pageCount = Math.max(1, pageSize > 0 ? Math.ceil(total / pageSize) : 0)
  var pageNumber = pageSize > 0 ? Math.floor(index / pageSize) : index
	var isAtEdge = pageNumber < 3 || pageNumber >= pageCount - 3

  // As the ellipsis can be said to take the space of the 11th page number,
  // only use ellipsis if we've got at least 12 pages.
  var pageGroups = pageCount < 12
    ? [_.range(0, pageCount)]
    : _.groupAdjacent(_.uniq(_.concat(
      _.range(0, isAtEdge ? 5 : 3),
      _.range(Math.max(0, pageNumber - 2), Math.min(pageNumber + 3, pageCount)),
      _.range(pageCount - (isAtEdge ? 5 : 3), pageCount)
    )).sort(_.subtract), (a, b) => a + 1 == b)

	return <ol class="pagination-view">
		{_.intersperse(pageGroups.map((pages) => pages.map(function(page) {
			var pagePath = path + "?" + Qs.stringify(_.assign({}, query, {
				offset: page * pageSize,
        limit: pageSize
			}))

			var isCurrent = page == pageNumber

			return <li class={isCurrent ? "page current" : "page"}>
				<a href={isCurrent ? "#" : pagePath}>{page + 1}</a>
			</li>
			})
		), <li class="middle">…</li>)}
	</ol>
}
