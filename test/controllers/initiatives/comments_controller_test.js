var _ = require("root/lib/underscore")
var Config = require("root/config")
var ValidInitiative = require("root/test/valid_db_initiative")
var ValidComment = require("root/test/valid_comment")
var ValidSubscription = require("root/test/valid_subscription")
var newPartner = require("root/test/citizenos_fixtures").newPartner
var newUser = require("root/test/citizenos_fixtures").newUser
var newTopic = require("root/test/citizenos_fixtures").newTopic
var createPartner = require("root/test/citizenos_fixtures").createPartner
var createUser = require("root/test/citizenos_fixtures").createUser
var createTopic = require("root/test/citizenos_fixtures").createTopic
var initiativesDb = require("root/db/initiatives_db")
var subscriptionsDb = require("root/db/initiative_subscriptions_db")
var commentsDb = require("root/db/comments_db")
var messagesDb = require("root/db/initiative_messages_db")
var parseDom = require("root/lib/dom").parse
var sql = require("sqlate")
var cosDb = require("root").cosDb
var t = require("root/lib/i18n").t.bind(null, "et")
var MAX_TITLE_LENGTH = 140
var MAX_TEXT_LENGTH = 3000
var VALID_ATTRS = {title: "I've some thoughts.", text: "But I forgot them."}
var VALID_REPLY_ATTRS = {text: "But I forgot them."}

describe("InitiativeCommentsController", function() {
	require("root/test/web")()
	require("root/test/mitm")()
	require("root/test/db")()
	require("root/test/email")()
	require("root/test/time")()
	require("root/test/fixtures").csrf()
	beforeEach(require("root/test/mitm").router)

	beforeEach(function*() {
		this.partner = yield createPartner(newPartner({id: Config.apiPartnerId}))
		this.initiative = yield initiativesDb.create(new ValidInitiative)

		this.topic = yield createTopic(newTopic({
			id: this.initiative.uuid,
			creatorId: (yield createUser(newUser())).id,
			sourcePartnerId: this.partner.id,
			visibility: "public"
		}))
	})

	describe("POST /", function() {
		describe("when not logged in", function() {
			it("must respond with 401 when not logged in", function*() {
				var path = `/initiatives/${this.initiative.uuid}/comments`
				var res = yield this.request(path, {
					method: "POST",
					form: {_csrf_token: this.csrfToken}
				})

				res.statusCode.must.equal(401)
			})
		})

		describe("when logged in", function() {
			require("root/test/fixtures").user()

			it("must create comment", function*() {
				var path = `/initiatives/${this.initiative.uuid}`
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
					initiative_uuid: this.initiative.uuid,
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

			it("must create comment given external initiative", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					external: true
				}))

				var path = `/initiatives/${initiative.uuid}`
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
					initiative_uuid: initiative.uuid,
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
				var path = `/initiatives/${this.initiative.uuid}`
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
					var path = `/initiatives/${this.initiative.uuid}/comments`
					var res = yield this.request(path, {
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
						initiative_uuid: this.initiative.uuid,
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
					var sub = yield subscriptionsDb.create(new ValidSubscription({
						initiative_uuid: this.initiative.uuid,
						email: this.user.email,
						confirmed_at: null,
						official_interest: true,
						author_interest: false,
						comment_interest: false
					}))

					var path = `/initiatives/${this.initiative.uuid}/comments`
					var res = yield this.request(path, {
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
					var sub = yield subscriptionsDb.create(new ValidSubscription({
						email: this.user.email,
						confirmed_at: new Date,
						official_interest: true,
						author_interest: false,
						comment_interest: false
					}))

					var path = `/initiatives/${this.initiative.uuid}/comments`
					var res = yield this.request(path, {
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
						initiative_uuid: this.initiative.uuid,
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

					var path = `/initiatives/${this.initiative.uuid}/comments`
					var res = yield this.request(path, {
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
					var sub = yield subscriptionsDb.create(new ValidSubscription({
						initiative_uuid: this.initiative.uuid,
						email: this.user.email,
						comment_interest: true,
						confirmed_at: new Date
					}))

					var path = `/initiatives/${this.initiative.uuid}/comments`
					var res = yield this.request(path, {
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
					var sub = yield subscriptionsDb.create(new ValidSubscription({
						email: this.user.email,
						comment_interest: true,
						confirmed_at: new Date
					}))

					var res = yield this.request(`/initiatives/${this.initiative.uuid}/comments`, {
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
				var subscriptions = yield subscriptionsDb.create([
					new ValidSubscription({
						initiative_uuid: this.initiative.uuid,
						confirmed_at: new Date,
						comment_interest: false
					}),

					new ValidSubscription({
						initiative_uuid: null,
						confirmed_at: new Date,
						comment_interest: false
					}),

					new ValidSubscription({
						initiative_uuid: this.initiative.uuid,
						confirmed_at: new Date,
						comment_interest: true
					}),

					new ValidSubscription({
						initiative_uuid: null,
						confirmed_at: new Date,
						comment_interest: true
					})
				])

				var path = `/initiatives/${this.initiative.uuid}`
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
				msg.match(/^Subject: .*/m)[0].must.include(this.topic.title)
				subscriptions.slice(2).forEach((s) => msg.must.include(s.update_token))
			})

			it("must not email commentator if subscribed", function*() {
				yield subscriptionsDb.create([
					new ValidSubscription({
						email: this.user.email,
						initiative_uuid: this.initiative.uuid,
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

				var path = `/initiatives/${this.initiative.uuid}`
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
					var path = `/initiatives/${this.initiative.uuid}/comments`
					var res = yield this.request(path, {
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

	describe("GET /new", function() {
		describe("when not logged in", function() {
			it("must respond with 401 when not logged in", function*() {
				var path = `/initiatives/${this.initiative.uuid}/comments/new`
				var res = yield this.request(path)
				res.statusCode.must.equal(401)
			})
		})

		describe("when logged in", function() {
			require("root/test/fixtures").user()

			it("must render new comment page", function*() {
				var path = `/initiatives/${this.initiative.uuid}/comments/new`
				var res = yield this.request(path)
				res.statusCode.must.equal(200)
				res.body.must.include(t("POST_COMMENT"))
				res.body.must.include(t("SUBSCRIBE_TO_COMMENTS_WHEN_COMMENTING"))
			})

			it("must render new comment page given external initiative", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					external: true
				}))
				
				var path = `/initiatives/${initiative.uuid}/comments/new`
				var res = yield this.request(path)
				res.statusCode.must.equal(200)
				res.body.must.include(t("POST_COMMENT"))
				res.body.must.include(t("SUBSCRIBE_TO_COMMENTS_WHEN_COMMENTING"))
			})
		})
	})

	describe("GET /:id", function() {
		it("must show comment page", function*() {
			var author = yield createUser(newUser({name: "Johnny Lang"}))
			var replier = yield createUser(newUser({name: "Kenny Loggins"}))

			var comment = yield commentsDb.create(new ValidComment({
				initiative_uuid: this.initiative.uuid,
				user_uuid: author.id
			}))

			var reply = yield commentsDb.create(new ValidComment({
				initiative_uuid: this.initiative.uuid,
				user_uuid: replier.id,
				parent_id: comment.id
			}))

			var path = `/initiatives/${this.initiative.uuid}/comments/${comment.id}`
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

		it("must show comment page given external initiative", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				external: true
			}))

			var author = yield createUser(newUser({name: "Johnny Lang"}))

			var comment = yield commentsDb.create(new ValidComment({
				initiative_uuid: initiative.uuid,
				user_uuid: author.id
			}))

			var path = `/initiatives/${initiative.uuid}/comments/${comment.id}`
			var res = yield this.request(path)
			res.statusCode.must.equal(200)

			var dom = parseDom(res.body)
			var commentEl = dom.querySelector("#initiative-comment")
			commentEl.textContent.must.include(author.name)
			commentEl.textContent.must.include(comment.title)
			commentEl.textContent.must.include(comment.text)
		})

		it("must not show other comment's replies", function*() {
			var author = yield createUser(newUser({name: "Johnny Lang"}))

			var comment = yield commentsDb.create(new ValidComment({
				initiative_uuid: this.initiative.uuid,
				user_uuid: author.id
			}))

			var other = yield commentsDb.create(new ValidComment({
				initiative_uuid: this.initiative.uuid,
				user_uuid: author.id
			}))

			var reply = yield commentsDb.create(new ValidComment({
				initiative_uuid: this.initiative.uuid,
				user_uuid: author.id,
				parent_id: other.id
			}))

			var path = `/initiatives/${this.initiative.uuid}/comments/${comment.id}`
			var res = yield this.request(path)
			res.statusCode.must.equal(200)
			res.body.must.not.include(reply.text)
		})

		it("must include UUID anchors", function*() {
			var author = yield createUser(newUser())
			var replier = yield createUser(newUser())

			var comment = yield commentsDb.create(new ValidComment({
				uuid: "f80ebc50-8f96-4482-8211-602b7376f204",
				initiative_uuid: this.initiative.uuid,
				user_uuid: author.id
			}))

			var reply = yield commentsDb.create(new ValidComment({
				uuid: "c3e1f67c-41b0-4db7-8467-79bc0b80cfb7",
				initiative_uuid: this.initiative.uuid,
				user_uuid: replier.id,
				parent_id: comment.id
			}))

			var path = `/initiatives/${this.initiative.uuid}/comments/${comment.id}`
			var res = yield this.request(path)

			res.statusCode.must.equal(200)
			var dom = parseDom(res.body)
			dom.querySelector("#comment-" + comment.uuid).must.exist()
			dom.querySelector("#comment-" + reply.uuid).must.exist()
		})

		it("must redirect UUID to id", function*() {
			var comment = yield commentsDb.create(new ValidComment({
				uuid: "30898eb8-4177-4040-8fc0-d3402ecb14c7",
				initiative_uuid: this.initiative.uuid
			}))

			var path = `/initiatives/${this.initiative.uuid}/comments`
			var res = yield this.request(path + "/" + comment.uuid)
			res.statusCode.must.equal(308)
			res.headers.location.must.equal(path + "/" + comment.id)
		})

		it("must show 404 given a non-existent comment", function*() {
			var res = yield this.request(`/initiatives/${this.initiative.uuid}/comments/42`)
			res.statusCode.must.equal(404)
		})

		it("must redirect given a reply", function*() {
			var parent = yield commentsDb.create(new ValidComment({
				initiative_uuid: this.initiative.uuid
			}))

			var comment = yield commentsDb.create(new ValidComment({
				initiative_uuid: this.initiative.uuid,
				parent_id: parent.id
			}))

			var path = `/initiatives/${this.initiative.uuid}/comments`
			var res = yield this.request(path + "/" + comment.id)
			res.statusCode.must.equal(302)
			res.headers.location.must.equal(path + "/" + parent.id)
		})

		it("must show 404 given a comment id of another initiative", function*() {
			var other = yield initiativesDb.create(new ValidInitiative)

			var comment = yield commentsDb.create(new ValidComment({
				initiative_uuid: other.uuid
			}))

			var path = `/initiatives/${this.initiative.uuid}/comments/${comment.id}`
			var res = yield this.request(path)
			res.statusCode.must.equal(404)
		})
	})

	describe("POST /:id/replies", function() {
		describe("when not logged in", function() {
			it("must respond with 401 when not logged in", function*() {
				var comment = yield commentsDb.create(new ValidComment({
					initiative_uuid: this.initiative.uuid
				}))

				var path = `/initiatives/${this.initiative.uuid}/comments/${comment.id}`
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
				var comment = yield commentsDb.create(new ValidComment({
					initiative_uuid: this.initiative.uuid
				}))

				var path = `/initiatives/${this.initiative.uuid}/comments/${comment.id}`
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
					initiative_uuid: this.initiative.uuid,
					user_uuid: this.user.id,
					parent_id: comment.id,
					text: "But I forgot them."
				})

				yield commentsDb.search(sql`
					SELECT * FROM comments ORDER BY created_at
				`).must.then.eql([comment, reply])

				res.headers.location.must.equal(path + "#comment-" + reply.id)
			})

			it("must create reply given external initiative", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					external: true
				}))

				var comment = yield commentsDb.create(new ValidComment({
					initiative_uuid: initiative.uuid
				}))

				var path = `/initiatives/${initiative.uuid}/comments/${comment.id}`
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
					initiative_uuid: initiative.uuid,
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
				var comment = yield commentsDb.create(new ValidComment({
					initiative_uuid: this.initiative.uuid
				}))

				var path = `/initiatives/${this.initiative.uuid}`
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
				var comment = yield commentsDb.create(new ValidComment({
					initiative_uuid: this.initiative.uuid
				}))

				var subscriptions = yield subscriptionsDb.create([
					new ValidSubscription({
						initiative_uuid: this.initiative.uuid,
						confirmed_at: new Date,
						comment_interest: false
					}),

					new ValidSubscription({
						initiative_uuid: null,
						confirmed_at: new Date,
						comment_interest: false
					}),

					new ValidSubscription({
						initiative_uuid: this.initiative.uuid,
						confirmed_at: new Date,
						comment_interest: true
					}),

					new ValidSubscription({
						initiative_uuid: null,
						confirmed_at: new Date,
						comment_interest: true
					})
				])

				var path = `/initiatives/${this.initiative.uuid}`
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
				msg.match(/^Subject: .*/m)[0].must.include(this.topic.title)
				subscriptions.slice(2).forEach((s) => msg.must.include(s.update_token))
			})

			it("must not email commentator if subscribed", function*() {
				var comment = yield commentsDb.create(new ValidComment({
					initiative_uuid: this.initiative.uuid
				}))

				yield subscriptionsDb.create([
					new ValidSubscription({
						email: this.user.email,
						initiative_uuid: this.initiative.uuid,
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

				var path = `/initiatives/${this.initiative.uuid}`
				var res = yield this.request(path + `/comments/${comment.id}/replies`, {
					method: "POST",
					form: {__proto__: VALID_REPLY_ATTRS, _csrf_token: this.csrfToken}
				})

				res.statusCode.must.equal(303)
				this.emails.must.be.empty()
			})

			it("must respond with 405 given a reply", function*() {
				var parent = yield commentsDb.create(new ValidComment({
					initiative_uuid: this.initiative.uuid
				}))

				var comment = yield commentsDb.create(new ValidComment({
					initiative_uuid: this.initiative.uuid,
					parent_id: parent.id
				}))

				var path = `/initiatives/${this.initiative.uuid}/comments/${comment.id}/replies`
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
					var author = yield createUser(newUser())

					var comment = yield commentsDb.create(new ValidComment({
						initiative_uuid: this.initiative.uuid,
						user_uuid: author.id
					}))

					var path = `/initiatives/${this.initiative.uuid}/comments/${comment.id}`
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
