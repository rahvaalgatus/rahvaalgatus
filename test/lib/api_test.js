var _ = require("lodash")
var Api = require("root/lib/citizenos_api")
var parseCitizenInitiative = Api.parseCitizenInitiative
var outdent = require("root/lib/outdent")
var DATE = new Date(2015, 5, 18)

var INITIATIVE = {
	createdAt: DATE.toUTCString(),
	updatedAt: DATE.toUTCString()
}

var PARSED_INITIATIVE = {
	createdAt: DATE,
	updatedAt: DATE
}

describe("Api", function() {
	describe(".parseCitizenInitiative", function() {
		// Initiative with id 1f821c9e-1b93-4ef5-947f-fe0be45855c5 has the main
		// title with <h2>, not <h1>.
		forEachHeader(function(tagName) {
			it(`must parse title from first <${tagName}>`, function() {
				var html = outdent`
					<!DOCTYPE HTML>
					<html>
						<body>
							<${tagName}>Vote for Peace</${tagName}>
							<p>Rest in peace!</p>
						</body>
					</html>
				`
				parseCitizenInitiative({
					__proto__: INITIATIVE,
					description: html
				}).must.eql({
					__proto__: PARSED_INITIATIVE,
					title: "Vote for Peace",
					html: "<p>Rest in peace!</p>"
				})
			})
		})

		it("must parse title from HTML if on multiple lines", function() {
			var html = outdent`
				<!DOCTYPE HTML>
				<html>
					<body>
						<h1>
							Vote for Peace
						</h1>
						<p>Rest in peace!</p>
					</body>
				</html>
			`
			parseCitizenInitiative({
				__proto__: INITIATIVE,
				description: html
			}).must.eql({
				__proto__: PARSED_INITIATIVE,
				title: "Vote for Peace",
				html: "<p>Rest in peace!</p>"
			})
		})

		it("must decode HTML entities in title", function() {
			var html = outdent`
				<!DOCTYPE HTML>
				<html>
					<body>
						<h1>Vote&#x3a; War &amp; Peace</h1>
						<p>Rest in peace!</p>
					</body>
				</html>
			`
			parseCitizenInitiative({
				__proto__: INITIATIVE,
				description: html
			}).must.eql({
				__proto__: PARSED_INITIATIVE,
				title: "Vote: War & Peace",
				html: "<p>Rest in peace!</p>"
			})
		})

		it("must parse a single title from HTML with multiple <h1>s", function() {
			var html = outdent`
				<!DOCTYPE HTML>
				<html>
					<body>
						<h1>Vote for Peace</h1>
						<h1>Vote for Terror</h1>
						<p>Rest in peace!</p>
					</body>
				</html>
			`
			parseCitizenInitiative({
				__proto__: INITIATIVE,
				description: html
			}).must.eql({
				__proto__: PARSED_INITIATIVE,
				title: "Vote for Peace",
				html: outdent`
					<h1>Vote for Terror</h1>
					\t\t<p>Rest in peace!</p>
				`
			})
		})

		// An initiative with id a2089bf7-9768-42a8-9fd8-e8139b14da47 has one empty
		// <h1></h1> preceding and one following the actual title.
		it("must parse title from HTML with multiple empty and blank <h1>s",
			function() {
			var html = outdent`
				<!DOCTYPE HTML>
				<html>
					<body>
						<h1></h1>
						<h1> </h1>
						<h1>Vote for Peace</h1>
						<p>Rest in peace!</p>
					</body>
				</html>
			`
			parseCitizenInitiative({
				__proto__: INITIATIVE,
				description: html
			}).must.eql({
				__proto__: PARSED_INITIATIVE,
				title: "Vote for Peace",
				html: "<p>Rest in peace!</p>"
			})
		})

		it("must parse title from HTML with multiple empty and blank <h1>s",
			function() {
			var html = outdent`
				<!DOCTYPE HTML>
				<html>
					<body>
						<h2></h2>
						<h2> </h2>
						<h2>Vote for Peace</h2>
						<p>Rest in peace!</p>
					</body>
				</html>
			`
			parseCitizenInitiative({
				__proto__: INITIATIVE,
				description: html
			}).must.eql({
				__proto__: PARSED_INITIATIVE,
				title: "Vote for Peace",
				html: "<p>Rest in peace!</p>"
			})
		})

		it("must strip leading and trailing <br>s", function() {
			var html = outdent`
				<!DOCTYPE HTML>
				<html>
					<body>
						<br>
						<br>
						<h1>Vote for Peace</h1>
						<br>
						<br>
						<p>Rest in peace!</p>
						<br>
						<br>
					</body>
				</html>
			`
			parseCitizenInitiative({
				__proto__: INITIATIVE,
				description: html
			}).must.eql({
				__proto__: PARSED_INITIATIVE,
				title: "Vote for Peace",
				html: "<p>Rest in peace!</p>"
			})
		})

		forEachHeader(function(tagName) {
			it(`must strip <br>s around <${tagName}>s`, function() {
				var html = outdent`
					<!DOCTYPE HTML>
					<html>
						<body>
							<h1>Vote for Peace</h1>
							<p>Indeed</p>
							<br>
							<br>
							<${tagName}>Reasons</${tagName}>
							<br>
							<br>
							<p>Because.</p>
						</body>
					</html>
				`
				parseCitizenInitiative({
					__proto__: INITIATIVE,
					description: html
				}).must.eql({
					__proto__: PARSED_INITIATIVE,
					title: "Vote for Peace",
					html: outdent`
						<p>Indeed</p>
						\t\t<${tagName}>Reasons</${tagName}>
						\t\t<p>Because.</p>
					`
				})
			})
		})
	})
})

function forEachHeader(fn) { _.times(6, (i) => fn(`h${i + 1}`)) }
