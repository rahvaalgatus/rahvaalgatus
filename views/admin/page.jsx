/** @jsx Jsx */
var Jsx = require("j6pack")
var Fragment = Jsx.Fragment
var LiveReload = require("../page").LiveReload
var Form = require("../page").Form
var prefixed = require("root/lib/css").prefixed
exports = module.exports = Page
exports.FormButton = FormButton
exports.Flash = Flash

function Page(attrs, children) {
	var req = attrs.req
	var page = attrs.id
	var title = attrs.title

	return <html>
		<head>
			<meta charset="utf-8" />
			<meta name="viewport" content="width=device-width" />
			<link rel="stylesheet" href="/assets/admin.css" type="text/css" />
			<title>{title == null ? "" : title + " - "} Rahvaalgatus Admin</title>
			<LiveReload req={req} />
		</head>

		<body id={page + "-page"}>
			<header id="header">
				<h1>Rahvaalgatus.ee Admin</h1>

				<nav>
					<ul>
						<li>
							<a href="/" class={prefixed("/initiatives", req.path)}>
								Initiatives
							</a>
						</li>
					</ul>
				</nav>
			</header>

			<main>{children}</main>
		</body>
	</html>
}

function FormButton(attrs, children) {
	return <Form
		req={attrs.req}
		action={attrs.action}
		method={attrs.name == "_method" ? "post" : "put"}
	>
		<button
			id={attrs.id}
			class={attrs.class}
			type={attrs.type}
			name={attrs.name}
			value={attrs.value}
			onclick={attrs.onclick}
		>{children}</button>
	</Form>
}

function Flash(attrs) {
	var flash = attrs.flash

	return <Fragment>
		{flash("notice") ? <p class="flash notice">{flash("notice")}</p> : null}
		{flash("error") ? <p class="flash error">{flash("error")}</p> : null}
	</Fragment>
}
