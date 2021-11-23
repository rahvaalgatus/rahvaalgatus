/** @jsx Jsx */
var Jsx = require("j6pack")
var t = require("root/lib/i18n").t.bind(null, "et")
var {Section} = require("./page")
var {Footer} = require("./page")

module.exports = function() {
	return <html lang="et">
		<head>
			<meta charset="utf-8" />
			<meta name="viewport" content="width=device-width" />
			<link rel="stylesheet" href="/assets/page.css" type="text/css" />
			<title>503 vabandust!</title>
		</head>

		<body id="503-page">
			<header id="header"><center>
				<a href="/" class="logo">
					<img src="/assets/rahvaalgatus.png" alt="Rahvaalgatus" />
				</a>
			</center></header>

			<main id="main">
				<Section class="primary-section text-section">
					<h1>503 vabandust!</h1>

					<p>
						Rahvaalgatus teeb parasjagu hooldustöid. Oleme peatselt tagasi!
					</p>
				</Section>
			</main>

			<Footer t={t} siteUrl="" />
		</body>
	</html>.toString("doctype")
}
