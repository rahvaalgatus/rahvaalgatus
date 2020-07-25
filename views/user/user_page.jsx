/** @jsx Jsx */
var Jsx = require("j6pack")
var Page = require("../page")
var {selected} = require("root/lib/css")

module.exports = function(attrs, children) {
	var req = attrs.req
	var t = req.t
	var path = req.path
	var user = attrs.user

	return <Page {...attrs} class={"user-page " + (attrs.class || "")}>
		<header id="user-header"><center>
			<h1>{user.name}</h1>

			<menu id="tabs">
				<a href="/user" class={selected(path, "/")}>
					{t("USER_PAGE_TABS_USER")}
				</a>

				<a href="/user/signatures" class={selected(path, "/signatures")}>
					{t("USER_PAGE_TABS_SIGNATURES")}
				</a>

				<a href="/user/subscriptions" class={selected(path, "/subscriptions")}>
					{t("USER_PAGE_TABS_SUBSCRIPTIONS")}
				</a>
			</menu>
		</center></header>

		{children}
	</Page>
}
