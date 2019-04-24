/** @jsx Jsx */
var Jsx = require("j6pack")

module.exports = function(attrs) {
	return <html>
		<head>
			<meta charset="utf-8" />
		</head>

		<body>
			<script>{`
				window.location = "${attrs.path}?" + window.location.hash.substring(1)
			`}</script>
		</body>
	</html>
}
