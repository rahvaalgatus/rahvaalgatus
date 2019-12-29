var _ = require("root/lib/underscore")
var newUuid = require("uuid/v4")
var countSignaturesById = require("root/lib/citizenos_db").countSignaturesById
var countSignaturesByIds = require("root/lib/citizenos_db").countSignaturesByIds
var flatten = Function.apply.bind(Array.prototype.concat, Array.prototype)
var newUser = require("root/test/citizenos_fixtures").newUser
var newTopic = require("root/test/citizenos_fixtures").newTopic
var newVote = require("root/test/citizenos_fixtures").newVote
var newSignature = require("root/test/citizenos_fixtures").newSignature
var createUser = require("root/test/citizenos_fixtures").createUser
var createTopic = require("root/test/citizenos_fixtures").createTopic
var createVote = require("root/test/citizenos_fixtures").createVote
var createOptions = require("root/test/citizenos_fixtures").createOptions
var createSignature = require("root/test/citizenos_fixtures").createSignature
var parseTopic = require("root/lib/citizenos_db").parseTopic
var outdent = require("root/lib/outdent")

describe("CitizenosDb", function() {
	require("root/test/db")()

	describe(".countSignaturesById", function() {
		beforeEach(function*() {
			var user = yield createUser(newUser())
			this.topic = yield createTopic(newTopic({creatorId: user.id}))
			this.vote = yield createVote(this.topic, newVote())
			this.yesAndNo = yield createOptions(this.vote)
		})

		it("must return 0 for existing initiative", function*() {
			yield countSignaturesById(this.topic.id).must.then.equal(0)
		})

		it("must return null for non-existing initiative", function*() {
			yield countSignaturesById(newUuid()).must.then.equal(0)
		})

		it("must count only Yes signatures", function*() {
			var users = yield _.times(10, _.compose(createUser, newUser))

			yield createSignature(users.map((user, i) => newSignature({
				userId: user.id,
				voteId: this.vote.id,
				optionId: this.yesAndNo[i % 2]
			})))

			yield countSignaturesById(this.topic.id).must.then.equal(users.length / 2)
		})

		it("must count the latest Yes signature", function*() {
			var users = yield _.times(3, _.compose(createUser, newUser))

			yield createSignature(flatten(users.map((user, i) => [
				newSignature({
					userId: user.id,
					voteId: this.vote.id,
					optionId: this.yesAndNo[(i + 1) % 2],
					createdAt: new Date(2015, 0, 1)
				}),

				newSignature({
					userId: user.id,
					voteId: this.vote.id,
					optionId: this.yesAndNo[i % 2],
					createdAt: new Date(2015, 0, 2)
				})
			])))

			yield countSignaturesById(this.topic.id).must.then.equal(2)
		})
	})

	describe(".countSignaturesByIds", function() {
		beforeEach(function*() {
			var user = yield createUser(newUser())

			this.topics = yield _.times(5, (_i) => (
				createTopic(newTopic({creatorId: user.id}))
			))

			this.votes = yield this.topics.map((t) => createVote(t, newVote()))
			this.yesAndNos = yield this.votes.map(createOptions)
		})

		it("must return an empty object given no initiatives", function*() {
			yield countSignaturesByIds([]).must.then.eql({})
		})

		it("must return 0s for existing initiatives", function*() {
			var ids = this.topics.map((t) => t.id)
			yield countSignaturesByIds(ids).must.then.eql(_.object(ids, () => 0))
		})

		it("must return 0s for non-existing initiatives", function*() {
			var ids = _.times(3, newUuid)
			yield countSignaturesByIds(ids).must.then.eql(_.object(ids, () => 0))
		})

		it("must count only Yes signatures", function*() {
			var users = yield _.times(12, _.compose(createUser, newUser))

			var sigs = flatten(users.map((user, i) => this.topics.map((_t, j) => (
				newSignature({
					userId: user.id,
					voteId: this.votes[j].id,
					optionId: this.yesAndNos[j][(j & 1 ? i % 2 : i % 3) && 1]
				})
			))))

			yield createSignature(sigs)

			var ids = this.topics.map((t) => t.id)
			yield countSignaturesByIds(ids).must.then.eql(_.object(ids, (_t, i) => (
				i & 1 ? users.length / 2 : users.length / 3
			)))
		})
	})

	describe(".parseTopic", function() {
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
				parseTopic({
					description: html
				}).must.eql({
					title: "Vote for Peace",
					description: html,
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
			parseTopic({
				description: html
			}).must.eql({
				title: "Vote for Peace",
				description: html,
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
			parseTopic({
				description: html
			}).must.eql({
				title: "Vote: War & Peace",
				description: html,
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
			parseTopic({
				description: html
			}).must.eql({
				title: "Vote for Peace",
				description: html,
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
			parseTopic({
				description: html
			}).must.eql({
				title: "Vote for Peace",
				description: html,
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
			parseTopic({
				description: html
			}).must.eql({
				title: "Vote for Peace",
				description: html,
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
			parseTopic({
				description: html
			}).must.eql({
				title: "Vote for Peace",
				description: html,
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
				parseTopic({
					description: html
				}).must.eql({
					title: "Vote for Peace",
					description: html,

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
