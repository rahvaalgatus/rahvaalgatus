var _ = require("root/lib/underscore")
var Config = require("root/config")
var Crypto = require("crypto")
var ValidInitiative = require("root/test/valid_db_initiative")
var ValidComment = require("root/test/valid_comment")
var ValidSubscription = require("root/test/valid_subscription")
var newPartner = require("root/test/citizenos_fixtures").newPartner
var newTopic = require("root/test/citizenos_fixtures").newTopic
var createPartner = require("root/test/citizenos_fixtures").createPartner
var createUser = require("root/test/fixtures").createUser
var createTopic = require("root/test/citizenos_fixtures").createTopic
var usersDb = require("root/db/users_db")
var initiativesDb = require("root/db/initiatives_db")
var subscriptionsDb = require("root/db/initiative_subscriptions_db")
var commentsDb = require("root/db/comments_db")
var parseDom = require("root/lib/dom").parse
var sql = require("sqlate")
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
		this.author = yield createUser()

		this.initiative = yield initiativesDb.create(new ValidInitiative({
			user_id: this.author.id,
			published_at: new Date
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
				res.statusMessage.must.equal("Unauthorized")
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
					user_id: this.user.id,
					user_uuid: _.serializeUuid(this.user.uuid),
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
					phase: "parliament",
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
					user_id: this.user.id,
					user_uuid: _.serializeUuid(this.user.uuid),
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

			it("must not create comment if initiative unpublished", function*() {
				yield initiativesDb.update(this.initiative, {published_at: null})

				var path = `/initiatives/${this.initiative.uuid}`
				var res = yield this.request(path + `/comments`, {
					method: "POST",
					form: {__proto__: VALID_ATTRS, _csrf_token: this.csrfToken}
				})

				res.statusCode.must.equal(403)
				res.statusMessage.must.equal("Initiative Not Public")

				yield commentsDb.search(sql`
					SELECT * FROM comments
				`).must.then.be.empty()
			})

			it("must create comment as author if initiative unpublished",
				function*() {
				yield initiativesDb.update(this.initiative, {
					user_id: this.user.id,
					published_at: null
				})

				var path = `/initiatives/${this.initiative.uuid}`
				var res = yield this.request(path + `/comments`, {
					method: "POST",
					form: {__proto__: VALID_ATTRS, _csrf_token: this.csrfToken}
				})

				res.statusCode.must.equal(303)
			})

			describe("when subscribing", function() {
				it("must subscribe if not subscribed before", function*() {
					yield usersDb.update(this.user, {
						email: "user@example.com",
						email_confirmed_at: new Date
					})

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
						email: "user@example.com",
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
					yield usersDb.update(this.user, {
						email: "user@example.com",
						email_confirmed_at: new Date
					})

					var sub = yield subscriptionsDb.create(new ValidSubscription({
						initiative_uuid: this.initiative.uuid,
						email: "user@example.com",
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
					yield usersDb.update(this.user, {
						email: "user@example.com",
						email_confirmed_at: new Date
					})

					var sub = yield subscriptionsDb.create(new ValidSubscription({
						email: "user@example.com",
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
						email: "user@example.com",
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
					yield usersDb.update(this.user, {
						unconfirmed_email: "user@example.com",
						email_confirmation_token: Crypto.randomBytes(12)
					})

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
					yield usersDb.update(this.user, {
						email: "user@example.com",
						email_confirmed_at: new Date
					})

					var sub = yield subscriptionsDb.create(new ValidSubscription({
						initiative_uuid: this.initiative.uuid,
						email: "user@example.com",
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
					yield usersDb.update(this.user, {
						email: "user@example.com",
						email_confirmed_at: new Date
					})

					var sub = yield subscriptionsDb.create(new ValidSubscription({
						email: "user@example.com",
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

				var emails = subscriptions.slice(2).map((s) => s.email).sort()

				this.emails.length.must.equal(1)
				this.emails[0].envelope.to.must.eql(emails)
				var msg = String(this.emails[0].message)
				msg.match(/^Subject: .*/m)[0].must.include(this.initiative.title)
				subscriptions.slice(2).forEach((s) => msg.must.include(s.update_token))
			})

			describe("when CitizenOS initiative", function() {
				it("must email subscribers with CitizenOS title", function*() {
					var partner = yield createPartner(newPartner({
						id: Config.apiPartnerId
					}))

					var topic = yield createTopic(newTopic({
						id: this.initiative.uuid,
						creatorId: this.user.uuid,
						sourcePartnerId: partner.id
					}))

					var subscription = yield subscriptionsDb.create(
						new ValidSubscription({
							initiative_uuid: this.initiative.uuid,
							confirmed_at: new Date,
							comment_interest: true
						})
					)

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

					this.emails.length.must.equal(1)
					this.emails[0].envelope.to.must.eql([subscription.email])
					var msg = String(this.emails[0].message)
					msg.match(/^Subject: .*/m)[0].must.include(topic.title)
				})
			})

			it("must not email subscribers if private", function*() {
				yield initiativesDb.update(this.initiative, {
					user_id: this.user.id,
					published_at: null
				})

				yield subscriptionsDb.create([
					new ValidSubscription({
						email: "user@example.com",
						initiative_uuid: this.initiative.uuid,
						confirmed_at: new Date,
						comment_interest: true
					}),

					new ValidSubscription({
						email: "user@example.com",
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

			it("must not email commentator if subscribed", function*() {
				yield usersDb.update(this.user, {
					email: "user@example.com",
					email_confirmed_at: new Date
				})

				yield subscriptionsDb.create([
					new ValidSubscription({
						email: "user@example.com",
						initiative_uuid: this.initiative.uuid,
						confirmed_at: new Date,
						comment_interest: true
					}),

					new ValidSubscription({
						email: "user@example.com",
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
					phase: "parliament",
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
			var author = yield createUser({name: "Johnny Lang"})
			var replier = yield createUser({name: "Kenny Loggins"})

			var comment = yield commentsDb.create(new ValidComment({
				initiative_uuid: this.initiative.uuid,
				user_id: author.id,
				user_uuid: _.serializeUuid(author.uuid)
			}))

			var reply = yield commentsDb.create(new ValidComment({
				initiative_uuid: this.initiative.uuid,
				user_id: replier.id,
				user_uuid: _.serializeUuid(replier.uuid),
				parent_id: comment.id
			}))

			var path = `/initiatives/${this.initiative.uuid}`
			path += `/comments/${comment.id}`
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
				phase: "parliament",
				external: true
			}))

			var author = yield createUser({name: "Johnny Lang"})

			var comment = yield commentsDb.create(new ValidComment({
				initiative_uuid: initiative.uuid,
				user_id: author.id,
				user_uuid: _.serializeUuid(author.uuid)
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
			var author = yield createUser({name: "Johnny Lang"})

			var comment = yield commentsDb.create(new ValidComment({
				initiative_uuid: this.initiative.uuid,
				user_id: author.id,
				user_uuid: _.serializeUuid(author.uuid)
			}))

			var other = yield commentsDb.create(new ValidComment({
				initiative_uuid: this.initiative.uuid,
				user_id: author.id,
				user_uuid: _.serializeUuid(author.uuid)
			}))

			var reply = yield commentsDb.create(new ValidComment({
				initiative_uuid: this.initiative.uuid,
				user_id: author.id,
				user_uuid: _.serializeUuid(author.uuid),
				parent_id: other.id
			}))

			var path = `/initiatives/${this.initiative.uuid}/comments/${comment.id}`
			var res = yield this.request(path)
			res.statusCode.must.equal(200)
			res.body.must.not.include(reply.text)
		})

		it("must include UUID anchors", function*() {
			var author = yield createUser()
			var replier = yield createUser()

			var comment = yield commentsDb.create(new ValidComment({
				uuid: "f80ebc50-8f96-4482-8211-602b7376f204",
				initiative_uuid: this.initiative.uuid,
				user_id: author.id,
				user_uuid: _.serializeUuid(replier.uuid)
			}))

			var reply = yield commentsDb.create(new ValidComment({
				uuid: "c3e1f67c-41b0-4db7-8467-79bc0b80cfb7",
				initiative_uuid: this.initiative.uuid,
				user_id: author.id,
				user_uuid: _.serializeUuid(replier.uuid),
				parent_id: comment.id
			}))

			var path = `/initiatives/${this.initiative.uuid}`
			path += `/comments/${comment.id}`
			var res = yield this.request(path)

			res.statusCode.must.equal(200)
			var dom = parseDom(res.body)
			dom.querySelector("#comment-" + comment.uuid).must.exist()
			dom.querySelector("#comment-" + reply.uuid).must.exist()
		})

		it("must redirect UUID to id", function*() {
			var author = yield createUser()

			var comment = yield commentsDb.create(new ValidComment({
				uuid: "30898eb8-4177-4040-8fc0-d3402ecb14c7",
				initiative_uuid: this.initiative.uuid,
				user_id: author.id,
				user_uuid: _.serializeUuid(author.uuid)
			}))

			var path = `/initiatives/${this.initiative.uuid}/comments`
			var res = yield this.request(path + "/" + comment.uuid)
			res.statusCode.must.equal(308)
			res.headers.location.must.equal(path + "/" + comment.id)
		})

		it("must show 404 given a non-existent comment", function*() {
			var path = `/initiatives/${this.initiative.uuid}/comments/42`
			var res = yield this.request(path)
			res.statusCode.must.equal(404)
		})

		it("must redirect given a reply", function*() {
			var author = yield createUser()

			var parent = yield commentsDb.create(new ValidComment({
				initiative_uuid: this.initiative.uuid,
				user_id: author.id,
				user_uuid: _.serializeUuid(author.uuid)
			}))

			var comment = yield commentsDb.create(new ValidComment({
				initiative_uuid: this.initiative.uuid,
				user_id: author.id,
				user_uuid: _.serializeUuid(author.uuid),
				parent_id: parent.id
			}))

			var path = `/initiatives/${this.initiative.uuid}/comments`
			var res = yield this.request(path + "/" + comment.id)
			res.statusCode.must.equal(302)
			res.headers.location.must.equal(path + "/" + parent.id)
		})

		it("must show 404 given a comment id of another initiative", function*() {
			var other = yield initiativesDb.create(new ValidInitiative({
				user_id: this.author.id
			}))

			var author = yield createUser()

			var comment = yield commentsDb.create(new ValidComment({
				initiative_uuid: other.uuid,
				user_id: author.id,
				user_uuid: _.serializeUuid(author.uuid)
			}))

			var path = `/initiatives/${this.initiative.uuid}`
			path += `/comments/${comment.id}`
			var res = yield this.request(path)
			res.statusCode.must.equal(404)
		})
	})

	describe("POST /:id/replies", function() {
		describe("when not logged in", function() {
			it("must respond with 401 when not logged in", function*() {
				var author = yield createUser()

				var comment = yield commentsDb.create(new ValidComment({
					initiative_uuid: this.initiative.uuid,
					user_id: author.id,
					user_uuid: _.serializeUuid(author.uuid)
				}))

				var path = `/initiatives/${this.initiative.uuid}`
				path += `/comments/${comment.id}`
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
				var author = yield createUser()

				var comment = yield commentsDb.create(new ValidComment({
					user_id: author.id,
					user_uuid: _.serializeUuid(author.uuid),
					initiative_uuid: this.initiative.uuid
				}))

				var path = `/initiatives/${this.initiative.uuid}`
				path += `/comments/${comment.id}`
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
					user_id: this.user.id,
					user_uuid: _.serializeUuid(this.user.uuid),
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
					phase: "parliament",
					external: true
				}))

				var author = yield createUser()

				var comment = yield commentsDb.create(new ValidComment({
					user_id: author.id,
					user_uuid: _.serializeUuid(author.uuid),
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
					user_id: this.user.id,
					user_uuid: _.serializeUuid(this.user.uuid),
					parent_id: comment.id,
					text: "But I forgot them."
				})

				yield commentsDb.search(sql`
					SELECT * FROM comments ORDER BY created_at
				`).must.then.eql([comment, reply])

				res.headers.location.must.equal(path + "#comment-" + reply.id)
			})

			it("must redirect to referrer", function*() {
				var author = yield createUser()

				var comment = yield commentsDb.create(new ValidComment({
					user_id: author.id,
					user_uuid: _.serializeUuid(author.uuid),
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
				var author = yield createUser()

				var comment = yield commentsDb.create(new ValidComment({
					user_id: author.id,
					user_uuid: _.serializeUuid(author.uuid),
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

				var emails = subscriptions.slice(2).map((s) => s.email).sort()

				this.emails.length.must.equal(1)
				this.emails[0].envelope.to.must.eql(emails)
				var msg = String(this.emails[0].message)
				msg.match(/^Subject: .*/m)[0].must.include(this.initiative.title)

				subscriptions.slice(2).forEach((s) => (
					msg.must.include(s.update_token))
				)
			})

			describe("when CitizenOS initiative", function() {
				it("must email subscribers interested in comments", function*() {
					var partner = yield createPartner(newPartner({
						id: Config.apiPartnerId
					}))

					var topic = yield createTopic(newTopic({
						id: this.initiative.uuid,
						creatorId: this.user.uuid,
						sourcePartnerId: partner.id
					}))

					var author = yield createUser()

					var comment = yield commentsDb.create(new ValidComment({
						user_id: author.id,
						user_uuid: _.serializeUuid(author.uuid),
						initiative_uuid: this.initiative.uuid
					}))

					var subscription = yield subscriptionsDb.create(
						new ValidSubscription({
							initiative_uuid: this.initiative.uuid,
							confirmed_at: new Date,
							comment_interest: true
						})
					)

					var path = `/initiatives/${this.initiative.uuid}`
					var res = yield this.request(path + `/comments/${comment.id}/replies`, {
						method: "POST",
						form: {__proto__: VALID_REPLY_ATTRS, _csrf_token: this.csrfToken}
					})

					res.statusCode.must.equal(303)

					this.emails.length.must.equal(1)
					this.emails[0].envelope.to.must.eql([subscription.email])
					var msg = String(this.emails[0].message)
					msg.match(/^Subject: .*/m)[0].must.include(topic.title)
				})
			})

			it("must not email subscribers if private", function*() {
				yield initiativesDb.update(this.initiative, {
					user_id: this.user.id,
					published_at: null
				})

				var author = yield createUser()

				var comment = yield commentsDb.create(new ValidComment({
					user_id: author.id,
					user_uuid: _.serializeUuid(author.uuid),
					initiative_uuid: this.initiative.uuid
				}))

				yield subscriptionsDb.create([
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
				path += `/comments/${comment.id}`

				var res = yield this.request(path + `/replies`, {
					method: "POST",
					form: {__proto__: VALID_REPLY_ATTRS, _csrf_token: this.csrfToken}
				})

				res.statusCode.must.equal(303)
				this.emails.must.be.empty()
			})

			it("must not email commentator if subscribed", function*() {
				yield usersDb.update(this.user, {
					email: "user@example.com",
					email_confirmed_at: new Date
				})

				var author = yield createUser()

				var comment = yield commentsDb.create(new ValidComment({
					user_id: author.id,
					user_uuid: _.serializeUuid(author.uuid),
					initiative_uuid: this.initiative.uuid
				}))

				yield subscriptionsDb.create([
					new ValidSubscription({
						email: "user@example.com",
						initiative_uuid: this.initiative.uuid,
						confirmed_at: new Date,
						comment_interest: true
					}),

					new ValidSubscription({
						email: "user@example.com",
						initiative_uuid: null,
						confirmed_at: new Date,
						comment_interest: true
					})
				])

				var path = `/initiatives/${this.initiative.uuid}`
				path += `/comments/${comment.id}`

				var res = yield this.request(path + `/replies`, {
					method: "POST",
					form: {__proto__: VALID_REPLY_ATTRS, _csrf_token: this.csrfToken}
				})

				res.statusCode.must.equal(303)
				this.emails.must.be.empty()
			})

			it("must respond with 405 given a reply", function*() {
				var author = yield createUser()

				var parent = yield commentsDb.create(new ValidComment({
					initiative_uuid: this.initiative.uuid,
					user_id: author.id,
					user_uuid: _.serializeUuid(author.uuid)
				}))

				var comment = yield commentsDb.create(new ValidComment({
					initiative_uuid: this.initiative.uuid,
					user_id: author.id,
					user_uuid: _.serializeUuid(author.uuid),
					parent_id: parent.id
				}))

				var path = `/initiatives/${this.initiative.uuid}`
				path += `/comments/${comment.id}`

				var res = yield this.request(path + "/replies", {
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
					var author = yield createUser()

					var comment = yield commentsDb.create(new ValidComment({
						initiative_uuid: this.initiative.uuid,
						user_id: author.id,
						user_uuid: _.serializeUuid(author.uuid)
					}))

					var path = `/initiatives/${this.initiative.uuid}`
					path += `/comments/${comment.id}`

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

			it("must not create reply if initiative unpublished", function*() {
				yield initiativesDb.update(this.initiative, {published_at: null})

				var author = yield createUser()
				var comment = yield commentsDb.create(new ValidComment({
					user_id: author.id,
					user_uuid: _.serializeUuid(author.uuid),
					initiative_uuid: this.initiative.uuid
				}))

				var path = `/initiatives/${this.initiative.uuid}`
				path += `/comments/${comment.id}`
				var res = yield this.request(path + `/replies`, {
					method: "POST",
					form: {__proto__: VALID_REPLY_ATTRS, _csrf_token: this.csrfToken}
				})

				res.statusCode.must.equal(403)
				res.statusMessage.must.equal("Initiative Not Public")

				yield commentsDb.search(sql`
					SELECT * FROM comments
				`).must.then.eql([comment])
			})

			it("must create reply as author if initiative unpublished", function*() {
				yield initiativesDb.update(this.initiative, {
					user_id: this.user.id,
					published_at: null
				})

				var author = yield createUser()
				var comment = yield commentsDb.create(new ValidComment({
					user_id: author.id,
					user_uuid: _.serializeUuid(author.uuid),
					initiative_uuid: this.initiative.uuid
				}))

				var path = `/initiatives/${this.initiative.uuid}`
				path += `/comments/${comment.id}`
				var res = yield this.request(path + `/replies`, {
					method: "POST",
					form: {__proto__: VALID_REPLY_ATTRS, _csrf_token: this.csrfToken}
				})

				res.statusCode.must.equal(303)
			})
		})
	})
})
