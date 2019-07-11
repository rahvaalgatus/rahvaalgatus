var _ = require("root/lib/underscore")
var Config = require("root/config")
var ValidComment = require("root/test/valid_comment")
var ValidSubscription = require("root/test/valid_subscription")
var createUser = require("root/test/citizenos_fixtures").createUser
var newUser = require("root/test/citizenos_fixtures").newUser
var newUuid = require("uuid/v4")
var respond = require("root/test/fixtures").respond
var subscriptionsDb = require("root/db/initiative_subscriptions_db")
var commentsDb = require("root/db/comments_db")
var messagesDb = require("root/db/initiative_messages_db")
var parseDom = require("root/test/dom").parse
var sql = require("sqlate")
var cosDb = require("root").cosDb
var t = require("root/lib/i18n").t.bind(null, "et")
var UUID = "5f9a82a5-e815-440b-abe9-d17311b0b366"
var MAX_TITLE_LENGTH = 140
var MAX_TEXT_LENGTH = 3000
var VALID_ATTRS = {title: "I've some thoughts.", text: "But I forgot them."}
var VALID_REPLY_ATTRS = {text: "But I forgot them."}

var INITIATIVE = {
	id: UUID,
	createdAt: new Date(2000, 0, 1),
	sourcePartnerId: Config.apiPartnerId,
	status: "voting",
	title: "My thoughts",
	description: "<body><h1>My thoughts</h1></body>",
	creator: {name: "John"},
	visibility: "public",
	permission: {level: "read"},

	vote: {
		id: "396b0e5b-cca7-4255-9238-19b464e60b65",
		endsAt: new Date(3000, 0, 1),
		options: {rows: [{value: "Yes", voteCount: 0}]}
	}
}

describe("InitiativeCommentsController", function() {
	require("root/test/web")()
	require("root/test/mitm")()
	require("root/test/db")()
	require("root/test/email")()
	require("root/test/time")()
	require("root/test/fixtures").csrf()
	beforeEach(require("root/test/mitm").router)

	describe("POST /", function() {
		describe("when not logged in", function() {
			it("must respond with 401 when not logged in", function*() {
				this.router.get(`/api/topics/${UUID}`,
					respond.bind(null, {data: INITIATIVE}))

				var res = yield this.request(`/initiatives/${UUID}/comments`, {
					method: "POST",
					form: {_csrf_token: this.csrfToken}
				})

				res.statusCode.must.equal(401)
			})
		})

		describe("when logged in", function() {
			require("root/test/fixtures").user()

			it("must create comment", function*() {
				this.router.get(`/api/users/self/topics/${UUID}`,
					respond.bind(null, {data: INITIATIVE}))

				var path = `/initiatives/${UUID}`
				var res = yield this.request(path + "/comments", {
					method: "POST",

					form: {
						_csrf_token: this.csrfToken,
						title: "I've some thoughts.",
						text: "But I forgot them."
					}
				})

				res.statusCode.must.equal(303)

				var comment = new ValidComment({
					id: 1,
					initiative_uuid: UUID,
					user_uuid: this.user.id,
					title: "I've some thoughts.",
					text: "But I forgot them."
				})

				yield commentsDb.search(sql`
					SELECT * FROM comments ORDER BY created_at
				`).must.then.eql([comment])

				res.headers.location.must.equal(path + "/comments/" + comment.id)

				yield subscriptionsDb.search(sql`
					SELECT * FROM initiative_subscriptions
				`).must.then.be.empty()
			})

			it("must redirect to referrer", function*() {
				this.router.get(`/api/users/self/topics/${UUID}`,
					respond.bind(null, {data: INITIATIVE}))

				var path = `/initiatives/${UUID}`
				var res = yield this.request(path + `/comments`, {
					method: "POST",
					form: {
						__proto__: VALID_ATTRS,
						_csrf_token: this.csrfToken,
						referrer: path
					}
				})

				res.statusCode.must.equal(303)
				res.headers.location.must.equal(path + "#comment-" + 1)
			})

			describe("when subscribing", function() {
				it("must subscribe if not subscribed before", function*() {
					this.router.get(`/api/users/self/topics/${UUID}`,
						respond.bind(null, {data: INITIATIVE}))

					var res = yield this.request(`/initiatives/${UUID}/comments`, {
						method: "POST",

						form: {
							__proto__: VALID_ATTRS,
							_csrf_token: this.csrfToken,
							subscribe: true
						}
					})

					res.statusCode.must.equal(303)

					var subscriptions = yield subscriptionsDb.search(sql`
						SELECT * FROM initiative_subscriptions
					`)

					subscriptions.must.eql([new ValidSubscription({
						initiative_uuid: UUID,
						email: this.user.email,
						update_token: subscriptions[0].update_token,
						official_interest: false,
						author_interest: false,
						comment_interest: true,
						created_ip: "127.0.0.1",
						created_at: new Date,
						updated_at: new Date,
						confirmed_at: new Date
					})])
				})

				it("must subscribe if subscribed to initiative before", function*() {
					this.router.get(`/api/users/self/topics/${UUID}`,
						respond.bind(null, {data: INITIATIVE}))

					var sub = yield subscriptionsDb.create(new ValidSubscription({
						initiative_uuid: UUID,
						email: this.user.email,
						confirmed_at: null,
						official_interest: true,
						author_interest: false,
						comment_interest: false
					}))

					var res = yield this.request(`/initiatives/${UUID}/comments`, {
						method: "POST",

						form: {
							__proto__: VALID_ATTRS,
							_csrf_token: this.csrfToken,
							subscribe: true
						}
					})

					res.statusCode.must.equal(303)

					yield subscriptionsDb.search(sql`
						SELECT * FROM initiative_subscriptions
					`).must.then.eql([{
						__proto__: sub,
						comment_interest: true,
						confirmed_at: new Date,
						updated_at: new Date
					}])
				})

				it("must subscribe if subscribed to initiatives before", function*() {
					this.router.get(`/api/users/self/topics/${UUID}`,
						respond.bind(null, {data: INITIATIVE}))

					var sub = yield subscriptionsDb.create(new ValidSubscription({
						email: this.user.email,
						confirmed_at: new Date,
						official_interest: true,
						author_interest: false,
						comment_interest: false
					}))

					var res = yield this.request(`/initiatives/${UUID}/comments`, {
						method: "POST",

						form: {
							__proto__: VALID_ATTRS,
							_csrf_token: this.csrfToken,
							subscribe: true
						}
					})

					res.statusCode.must.equal(303)

					var subscriptions = yield subscriptionsDb.search(sql`
						SELECT * FROM initiative_subscriptions
					`)

					subscriptions.must.eql([sub, new ValidSubscription({
						initiative_uuid: UUID,
						email: this.user.email,
						update_token: subscriptions[1].update_token,
						official_interest: false,
						author_interest: false,
						comment_interest: true,
						created_ip: "127.0.0.1",
						created_at: new Date,
						updated_at: new Date,
						confirmed_at: new Date
					})])
				})

				it("must not subscribe if email not verified", function*() {
					yield cosDb.query(sql`UPDATE "Users" SET "emailIsVerified" = false`)

					this.router.get(`/api/users/self/topics/${UUID}`,
						respond.bind(null, {data: INITIATIVE}))

					var res = yield this.request(`/initiatives/${UUID}/comments`, {
						method: "POST",

						form: {
							__proto__: VALID_ATTRS,
							_csrf_token: this.csrfToken,
							subscribe: true
						}
					})

					res.statusCode.must.equal(303)

					yield subscriptionsDb.search(sql`
						SELECT * FROM initiative_subscriptions
					`).must.then.be.empty()
				})

				it("must unsubscribe if subscribed to initiative before", function*() {
					this.router.get(`/api/users/self/topics/${UUID}`,
						respond.bind(null, {data: INITIATIVE}))

					var sub = yield subscriptionsDb.create(new ValidSubscription({
						initiative_uuid: UUID,
						email: this.user.email,
						comment_interest: true,
						confirmed_at: new Date
					}))

					var res = yield this.request(`/initiatives/${UUID}/comments`, {
						method: "POST",

						form: {
							__proto__: VALID_ATTRS,
							_csrf_token: this.csrfToken,
							subscribe: false
						}
					})

					res.statusCode.must.equal(303)

					yield subscriptionsDb.search(sql`
						SELECT * FROM initiative_subscriptions
					`).must.then.eql([{
						__proto__: sub,
						comment_interest: false,
						updated_at: new Date
					}])
				})

				it("must unsubscribe if subscribed to initiatives before", function*() {
					this.router.get(`/api/users/self/topics/${UUID}`,
						respond.bind(null, {data: INITIATIVE}))

					var sub = yield subscriptionsDb.create(new ValidSubscription({
						email: this.user.email,
						comment_interest: true,
						confirmed_at: new Date
					}))

					var res = yield this.request(`/initiatives/${UUID}/comments`, {
						method: "POST",

						form: {
							__proto__: VALID_ATTRS,
							_csrf_token: this.csrfToken,
							subscribe: false
						}
					})

					res.statusCode.must.equal(303)

					yield subscriptionsDb.search(sql`
						SELECT * FROM initiative_subscriptions
					`).must.then.eql([sub])
				})
			})

			it("must email subscribers interested in comments", function*() {
				this.router.get(`/api/users/self/topics/${UUID}`,
					respond.bind(null, {data: INITIATIVE}))

				var subscriptions = yield subscriptionsDb.create([
					new ValidSubscription({
						initiative_uuid: INITIATIVE.id,
						confirmed_at: new Date,
						comment_interest: false
					}),

					new ValidSubscription({
						initiative_uuid: null,
						confirmed_at: new Date,
						comment_interest: false
					}),

					new ValidSubscription({
						initiative_uuid: INITIATIVE.id,
						confirmed_at: new Date,
						comment_interest: true
					}),

					new ValidSubscription({
						initiative_uuid: null,
						confirmed_at: new Date,
						comment_interest: true
					})
				])

				var path = `/initiatives/${UUID}`
				var res = yield this.request(path + `/comments`, {
					method: "POST",
					form: {
						__proto__: VALID_ATTRS,
						_csrf_token: this.csrfToken,
						referrer: path
					}
				})

				res.statusCode.must.equal(303)

				yield messagesDb.search(sql`
					SELECT * FROM initiative_messages
				`).must.then.be.empty()

				var emails = subscriptions.slice(2).map((s) => s.email).sort()

				this.emails.length.must.equal(1)
				this.emails[0].envelope.to.must.eql(emails)
				var msg = String(this.emails[0].message)
				msg.match(/^Subject: .*/m)[0].must.include(INITIATIVE.title)
				subscriptions.slice(2).forEach((s) => msg.must.include(s.update_token))
			})

			it("must not email commentator if subscribed", function*() {
				this.router.get(`/api/users/self/topics/${UUID}`,
					respond.bind(null, {data: INITIATIVE}))

				yield subscriptionsDb.create([
					new ValidSubscription({
						email: this.user.email,
						initiative_uuid: INITIATIVE.id,
						confirmed_at: new Date,
						comment_interest: true
					}),

					new ValidSubscription({
						email: this.user.email,
						initiative_uuid: null,
						confirmed_at: new Date,
						comment_interest: true
					})
				])

				var path = `/initiatives/${UUID}`
				var res = yield this.request(path + `/comments`, {
					method: "POST",
					form: {
						__proto__: VALID_ATTRS,
						_csrf_token: this.csrfToken,
						referrer: path
					}
				})

				res.statusCode.must.equal(303)
				this.emails.must.be.empty()
			})

			;[[
				"title empty",
				{title: ""},
				t("INITIATIVE_COMMENT_TITLE_LENGTH_ERROR", {max: MAX_TITLE_LENGTH})
			], [
				"title too long",
				{title: _.repeat("a", MAX_TITLE_LENGTH + 1)},
				t("INITIATIVE_COMMENT_TITLE_LENGTH_ERROR", {max: MAX_TITLE_LENGTH})
			], [
				"text empty",
				{text: ""},
				t("INITIATIVE_COMMENT_TEXT_LENGTH_ERROR", {max: MAX_TEXT_LENGTH})
			], [
				"text too long",
				{text: _.repeat("a", MAX_TEXT_LENGTH + 1)},
				t("INITIATIVE_COMMENT_TEXT_LENGTH_ERROR", {max: MAX_TEXT_LENGTH})
			]].forEach(function(test) {
				var description = test[0]
				var attrs = _.assign({}, VALID_ATTRS, test[1])
				var err = test[2]

				it(`must show error if ${description}`, function*() {
					this.router.get(`/api/users/self/topics/${UUID}`,
						respond.bind(null, {data: INITIATIVE}))

					var res = yield this.request(`/initiatives/${UUID}/comments`, {
						method: "POST",
						form: {__proto__: attrs, _csrf_token: this.csrfToken}
					})

					res.statusCode.must.equal(422)
					var dom = parseDom(res.body)
					dom.querySelector(".flash.error").textContent.must.include(err)

					var form = dom.querySelector(`#comment-form`)
					form.elements.title.value.must.equal(attrs.title)
					form.elements.text.value.must.equal(attrs.text)
				})
			})
		})
	})

	describe("GET /:id", function() {
		it("must show comment page", function*() {
			this.router.get(`/api/topics/${UUID}`,
				respond.bind(null, {data: INITIATIVE}))

			var author = yield createUser(newUser({name: "Johnny Lang"}))
			var replier = yield createUser(newUser({name: "Kenny Loggins"}))

			var comment = yield commentsDb.create(new ValidComment({
				initiative_uuid: UUID,
				user_uuid: author.id
			}))

			var reply = yield commentsDb.create(new ValidComment({
				initiative_uuid: UUID,
				user_uuid: replier.id,
				parent_id: comment.id
			}))

			var path = `/initiatives/${UUID}/comments/${comment.id}`
			var res = yield this.request(path)
			res.statusCode.must.equal(200)

			var dom = parseDom(res.body)
			var commentEl = dom.querySelector("#initiative-comment")
			commentEl.textContent.must.include(author.name)
			commentEl.textContent.must.include(comment.title)
			commentEl.textContent.must.include(comment.text)

			var replyEl = dom.querySelector("#initiative-comment .comment-replies")
			replyEl.textContent.must.include(replier.name)
			replyEl.textContent.must.include(reply.text)
		})

		it("must not show other comment's replies", function*() {
			this.router.get(`/api/topics/${UUID}`,
				respond.bind(null, {data: INITIATIVE}))

			var author = yield createUser(newUser({name: "Johnny Lang"}))

			var comment = yield commentsDb.create(new ValidComment({
				initiative_uuid: UUID,
				user_uuid: author.id
			}))

			var other = yield commentsDb.create(new ValidComment({
				initiative_uuid: UUID,
				user_uuid: author.id
			}))

			var reply = yield commentsDb.create(new ValidComment({
				initiative_uuid: UUID,
				user_uuid: author.id,
				parent_id: other.id
			}))

			var path = `/initiatives/${UUID}/comments/${comment.id}`
			var res = yield this.request(path)
			res.statusCode.must.equal(200)
			res.body.must.not.include(reply.text)
		})

		it("must include UUID anchors", function*() {
			this.router.get(`/api/topics/${UUID}`,
				respond.bind(null, {data: INITIATIVE}))

			var author = yield createUser(newUser())
			var replier = yield createUser(newUser())

			var comment = yield commentsDb.create(new ValidComment({
				uuid: newUuid(),
				initiative_uuid: UUID,
				user_uuid: author.id
			}))

			var reply = yield commentsDb.create(new ValidComment({
				uuid: newUuid(),
				initiative_uuid: UUID,
				user_uuid: replier.id,
				parent_id: comment.id
			}))

			var path = `/initiatives/${UUID}/comments/${comment.id}`
			var res = yield this.request(path)

			res.statusCode.must.equal(200)
			var dom = parseDom(res.body)
			dom.querySelector("#comment-" + comment.uuid).must.exist()
			dom.querySelector("#comment-" + reply.uuid).must.exist()
		})

		it("must redirect UUID to id", function*() {
			this.router.get(`/api/topics/${UUID}`,
				respond.bind(null, {data: INITIATIVE}))

			var comment = yield commentsDb.create(new ValidComment({
				uuid: newUuid(),
				initiative_uuid: UUID
			}))

			var path = `/initiatives/${UUID}/comments`
			var res = yield this.request(path + "/" + comment.uuid)
			res.statusCode.must.equal(308)
			res.headers.location.must.equal(path + "/" + comment.id)
		})

		it("must show 404 given a non-existent comment", function*() {
			this.router.get(`/api/topics/${UUID}`, respond.bind(null, {
				data: INITIATIVE
			}))

			var res = yield this.request(`/initiatives/${UUID}/comments/42`)
			res.statusCode.must.equal(404)
		})

		it("must redirect given a reply", function*() {
			this.router.get(`/api/topics/${UUID}`,
				respond.bind(null, {data: INITIATIVE}))

			var comment = yield commentsDb.create(new ValidComment({
				uuid: newUuid(),
				initiative_uuid: UUID,
				parent_id: 42
			}))

			var path = `/initiatives/${UUID}/comments`
			var res = yield this.request(path + "/" + comment.id)
			res.statusCode.must.equal(302)
			res.headers.location.must.equal(path + "/42")
		})

		it("must show 404 given a comment id of another initiative", function*() {
			this.router.get(`/api/topics/${UUID}`, respond.bind(null, {
				data: INITIATIVE
			}))

			var comment = yield commentsDb.create(new ValidComment)
			var path = `/initiatives/${UUID}/comments/${comment.id}`
			var res = yield this.request(path)
			res.statusCode.must.equal(404)
		})
	})

	describe("POST /:id/replies", function() {
		describe("when not logged in", function() {
			it("must respond with 401 when not logged in", function*() {
				this.router.get(`/api/topics/${UUID}`,
					respond.bind(null, {data: INITIATIVE}))

				var comment = yield commentsDb.create(new ValidComment({
					initiative_uuid: UUID
				}))

				var path = `/initiatives/${UUID}/comments/${comment.id}`
				var res = yield this.request(path + "/replies", {
					method: "POST",
					form: {_csrf_token: this.csrfToken}
				})

				res.statusCode.must.equal(401)
			})
		})

		describe("when logged in", function() {
			require("root/test/fixtures").user()

			it("must create reply", function*() {
				this.router.get(`/api/users/self/topics/${UUID}`,
					respond.bind(null, {data: INITIATIVE}))

				var comment = yield commentsDb.create(new ValidComment({
					initiative_uuid: UUID
				}))

				var path = `/initiatives/${UUID}/comments/${comment.id}`
				var res = yield this.request(path + "/replies", {
					method: "POST",

					form: {
						_csrf_token: this.csrfToken,
						text: "But I forgot them."
					}
				})

				res.statusCode.must.equal(303)

				var reply = new ValidComment({
					id: comment.id + 1,
					initiative_uuid: UUID,
					user_uuid: this.user.id,
					parent_id: comment.id,
					text: "But I forgot them."
				})

				yield commentsDb.search(sql`
					SELECT * FROM comments ORDER BY created_at
				`).must.then.eql([comment, reply])

				res.headers.location.must.equal(path + "#comment-" + reply.id)
			})

			it("must redirect to referrer", function*() {
				this.router.get(`/api/users/self/topics/${UUID}`,
					respond.bind(null, {data: INITIATIVE}))

				var comment = yield commentsDb.create(new ValidComment({
					initiative_uuid: UUID
				}))

				var path = `/initiatives/${UUID}`
				var res = yield this.request(path + `/comments/${comment.id}/replies`, {
					method: "POST",
					form: {
						__proto__: VALID_REPLY_ATTRS,
						_csrf_token: this.csrfToken,
						referrer: path
					}
				})

				res.statusCode.must.equal(303)
				res.headers.location.must.equal(path + "#comment-" + (comment.id + 1))
			})

			it("must email subscribers interested in comments", function*() {
				this.router.get(`/api/users/self/topics/${UUID}`,
					respond.bind(null, {data: INITIATIVE}))

				var comment = yield commentsDb.create(new ValidComment({
					initiative_uuid: UUID
				}))

				var subscriptions = yield subscriptionsDb.create([
					new ValidSubscription({
						initiative_uuid: INITIATIVE.id,
						confirmed_at: new Date,
						comment_interest: false
					}),

					new ValidSubscription({
						initiative_uuid: null,
						confirmed_at: new Date,
						comment_interest: false
					}),

					new ValidSubscription({
						initiative_uuid: INITIATIVE.id,
						confirmed_at: new Date,
						comment_interest: true
					}),

					new ValidSubscription({
						initiative_uuid: null,
						confirmed_at: new Date,
						comment_interest: true
					})
				])

				var path = `/initiatives/${UUID}`
				var res = yield this.request(path + `/comments/${comment.id}/replies`, {
					method: "POST",
					form: {__proto__: VALID_REPLY_ATTRS, _csrf_token: this.csrfToken}
				})

				res.statusCode.must.equal(303)

				yield messagesDb.search(sql`
					SELECT * FROM initiative_messages
				`).must.then.be.empty()

				var emails = subscriptions.slice(2).map((s) => s.email).sort()

				this.emails.length.must.equal(1)
				this.emails[0].envelope.to.must.eql(emails)
				var msg = String(this.emails[0].message)
				msg.match(/^Subject: .*/m)[0].must.include(INITIATIVE.title)
				subscriptions.slice(2).forEach((s) => msg.must.include(s.update_token))
			})

			it("must not email commentator if subscribed", function*() {
				this.router.get(`/api/users/self/topics/${UUID}`,
					respond.bind(null, {data: INITIATIVE}))

				var comment = yield commentsDb.create(new ValidComment({
					initiative_uuid: UUID
				}))

				yield subscriptionsDb.create([
					new ValidSubscription({
						email: this.user.email,
						initiative_uuid: INITIATIVE.id,
						confirmed_at: new Date,
						comment_interest: true
					}),

					new ValidSubscription({
						email: this.user.email,
						initiative_uuid: null,
						confirmed_at: new Date,
						comment_interest: true
					})
				])

				var path = `/initiatives/${UUID}`
				var res = yield this.request(path + `/comments/${comment.id}/replies`, {
					method: "POST",
					form: {__proto__: VALID_REPLY_ATTRS, _csrf_token: this.csrfToken}
				})

				res.statusCode.must.equal(303)
				this.emails.must.be.empty()
			})

			it("must respond with 405 given a reply", function*() {
				this.router.get(`/api/users/self/topics/${UUID}`,
					respond.bind(null, {data: INITIATIVE}))

				var comment = yield commentsDb.create(new ValidComment({
					uuid: newUuid(),
					initiative_uuid: UUID,
					parent_id: 42
				}))

				var path = `/initiatives/${UUID}/comments/${comment.id}/replies`
				var res = yield this.request(path, {
					method: "POST",
					form: {_csrf_token: this.csrfToken}
				})

				res.statusCode.must.equal(405)
			})

			;[[
				"text empty",
				{text: ""},
				t("INITIATIVE_COMMENT_TEXT_LENGTH_ERROR", {max: MAX_TEXT_LENGTH})
			], [
				"text too long",
				{text: _.repeat("a", MAX_TEXT_LENGTH + 1)},
				t("INITIATIVE_COMMENT_TEXT_LENGTH_ERROR", {max: MAX_TEXT_LENGTH})
			]].forEach(function(test) {
				var description = test[0]
				var attrs = _.assign({}, VALID_REPLY_ATTRS, test[1])
				var err = test[2]

				it(`must show error if ${description}`, function*() {
					this.router.get(`/api/users/self/topics/${UUID}`,
						respond.bind(null, {data: INITIATIVE}))

					var author = yield createUser(newUser())

					var comment = yield commentsDb.create(new ValidComment({
						initiative_uuid: UUID,
						user_uuid: author.id
					}))

					var path = `/initiatives/${UUID}/comments/${comment.id}`
					var res = yield this.request(path + "/replies", {
						method: "POST",
						form: {__proto__: attrs, _csrf_token: this.csrfToken}
					})

					res.statusCode.must.equal(422)
					var dom = parseDom(res.body)
					dom.querySelector(".flash.error").textContent.must.include(err)

					var form = dom.querySelector(`#comment-${comment.id}-reply`)
					form.elements.text.value.must.equal(attrs.text)
				})
			})
		})
	})
})
