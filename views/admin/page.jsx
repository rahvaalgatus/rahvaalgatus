/** @jsx Jsx */
var Jsx = require("j6pack")
var {Fragment} = Jsx
var {LiveReload} = require("../page")
var {selected} = require("root/lib/css")
var {prefixed} = require("root/lib/css")
exports = module.exports = Page
exports.Form = require("../page").Form
exports.FormButton = require("../page").FormButton
exports.Flash = Flash

function Page(attrs, children) {
	var {req} = attrs
	var {page} = attrs
	var {title} = attrs
	var fullPath = req.baseUrl + req.path
	var path = fullPath.slice(req.rootUrl.length)

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
								href={req.rootUrl + "/users"}
								class={prefixed("/users/", path)}>
								Users
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

						<li>
							<a
								href={req.rootUrl + "/subscriptions"}
								class={prefixed("/subscriptions/", path)}
							>Subscriptions</a>
						</li>
					</ul>
				</nav>
			</header>

			<main>{children}</main>
		</body>
	</html>
}

function Flash(attrs) {
	var {flash} = attrs

	return <Fragment>
		{flash("notice") ? <p class="flash notice">{flash("notice")}</p> : null}
		{flash("error") ? <p class="flash error">{flash("error")}</p> : null}
	</Fragment>
}
