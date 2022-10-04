var _ = require("root/lib/underscore")
var Url = require("url")
var Config = require("root").config
var Crypto = require("crypto")
var ValidInitiative = require("root/test/valid_initiative")
var ValidComment = require("root/test/valid_comment")
var ValidSubscription = require("root/test/valid_subscription")
var ValidUser = require("root/test/valid_user")
var {parseCookies} = require("root/test/web")
var {serializeCookies} = require("root/test/web")
var usersDb = require("root/db/users_db")
var initiativesDb = require("root/db/initiatives_db")
var subscriptionsDb = require("root/db/initiative_subscriptions_db")
var commentsDb = require("root/db/comments_db")
var parseHtml = require("root/test/html").parse
var sql = require("sqlate")
var t = require("root/lib/i18n").t.bind(null, "et")
var {SITE_URLS} = require("root/test/fixtures")
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

	beforeEach(function() {
		this.author = usersDb.create(new ValidUser)

		this.initiative = initiativesDb.create(new ValidInitiative({
			user_id: this.author.id,
			published_at: new Date
		}))
	})

	describe("POST /", function() {
		describe("when not logged in", function() {
			it("must respond with 401 when not logged in", function*() {
				var path = `/initiatives/${this.initiative.uuid}/comments`
				var res = yield this.request(path, {method: "POST"})
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
						title: "I've some thoughts.",
						text: "But I forgot them."
					}
				})

				res.statusCode.must.equal(303)
				res.statusMessage.must.equal("Comment Created")

				var comment = new ValidComment({
					id: 1,
					initiative_uuid: this.initiative.uuid,
					user_id: this.user.id,
					user_uuid: _.serializeUuid(this.user.uuid),
					title: "I've some thoughts.",
					text: "But I forgot them."
				})

				commentsDb.search(sql`
					SELECT * FROM comments
				`).must.eql([comment])

				res.headers.location.must.equal(path + "/comments/" + comment.id)

				subscriptionsDb.search(sql`
					SELECT * FROM initiative_subscriptions
				`).must.be.empty()
			})

			_.each({
				self: false,
				admin: true
			}, function(asAdmin, persona) {
				it(`must create comment for ${persona} as admin`, function*() {
					usersDb.update(this.user, {
						country: Config.adminPersonalIds[0].slice(0, 2),
						personal_id: Config.adminPersonalIds[0].slice(2)
					})

					var path = `/initiatives/${this.initiative.uuid}`
					var res = yield this.request(path + "/comments", {
						method: "POST",

						form: {
							persona: persona,
							title: "I've some thoughts.",
							text: "But I forgot them."
						}
					})

					res.statusCode.must.equal(303)
					res.statusMessage.must.equal("Comment Created")

					commentsDb.read(sql`
						SELECT * FROM comments
					`).must.eql(new ValidComment({
						id: 1,
						initiative_uuid: this.initiative.uuid,
						user_id: this.user.id,
						user_uuid: _.serializeUuid(this.user.uuid),
						title: "I've some thoughts.",
						text: "But I forgot them.",
						as_admin: asAdmin
					}))
				})
			})

			it(`must not create comment for admin as a non-admin`, function*() {
				var path = `/initiatives/${this.initiative.uuid}`
				var res = yield this.request(path + "/comments", {
					method: "POST",

					form: {
						persona: "admin",
						title: "I've some thoughts.",
						text: "But I forgot them."
					}
				})

				res.statusCode.must.equal(303)
				res.statusMessage.must.equal("Comment Created")

				commentsDb.read(sql`
					SELECT * FROM comments
				`).must.eql(new ValidComment({
					id: 1,
					initiative_uuid: this.initiative.uuid,
					user_id: this.user.id,
					user_uuid: _.serializeUuid(this.user.uuid),
					title: "I've some thoughts.",
					text: "But I forgot them.",
					as_admin: false
				}))
			})

			it("must create comment given external initiative", function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					phase: "parliament",
					external: true
				}))

				var path = `/initiatives/${initiative.uuid}`
				var res = yield this.request(path + "/comments", {
					method: "POST",

					form: {
						title: "I've some thoughts.",
						text: "But I forgot them."
					}
				})

				res.statusCode.must.equal(303)
				res.statusMessage.must.equal("Comment Created")

				commentsDb.read(sql`
					SELECT * FROM comments ORDER BY created_at
				`).must.eql(new ValidComment({
					id: 1,
					initiative_uuid: initiative.uuid,
					user_id: this.user.id,
					user_uuid: _.serializeUuid(this.user.uuid),
					title: "I've some thoughts.",
					text: "But I forgot them."
				}))
			})

			it("must redirect to referrer without host", function*() {
				var path = `/initiatives/${this.initiative.uuid}`
				var res = yield this.request(path + `/comments`, {
					method: "POST",
					form: {__proto__: VALID_ATTRS, referrer: "/comments"}
				})

				res.statusCode.must.equal(303)
				res.statusMessage.must.equal("Comment Created")
				res.headers.location.must.equal("/comments#comment-1")
			})

			it("must redirect to referrer on same host", function*() {
				var path = `/initiatives/${this.initiative.uuid}`
				var res = yield this.request(path + `/comments`, {
					method: "POST",
					form: {__proto__: VALID_ATTRS, referrer: this.url + "/comments"}
				})

				res.statusCode.must.equal(303)
				res.statusMessage.must.equal("Comment Created")
				res.headers.location.must.equal(this.url + "/comments#comment-1")
			})

			SITE_URLS.forEach(function(url) {
				it(`must redirect back to ${Url.parse(url).hostname}`, function*() {
					var path = `/initiatives/${this.initiative.uuid}`
					var res = yield this.request(path + `/comments`, {
						method: "POST",
						form: {__proto__: VALID_ATTRS, referrer: url + "/comments"}
					})

					res.statusCode.must.equal(303)
					res.statusMessage.must.equal("Comment Created")
					res.headers.location.must.equal(url + "/comments#comment-1")
				})
			})

			it("must not redirect to other hosts", function*() {
				var path = `/initiatives/${this.initiative.uuid}`
				var res = yield this.request(path + `/comments`, {
					method: "POST",
					form: {__proto__: VALID_ATTRS, referrer: "http://example.com/evil"}
				})

				res.statusCode.must.equal(303)
				res.statusMessage.must.equal("Comment Created")
				res.headers.location.must.equal(path + "/comments/1")
			})

			it("must not create comment if initiative unpublished", function*() {
				initiativesDb.update(this.initiative, {published_at: null})

				var path = `/initiatives/${this.initiative.uuid}`
				var res = yield this.request(path + `/comments`, {
					method: "POST",
					form: VALID_ATTRS
				})

				res.statusCode.must.equal(403)
				res.statusMessage.must.equal("Initiative Not Public")

				commentsDb.search(sql`
					SELECT * FROM comments
				`).must.be.empty()
			})

			it("must create comment as author if initiative unpublished",
				function*() {
				initiativesDb.update(this.initiative, {
					user_id: this.user.id,
					published_at: null
				})

				var path = `/initiatives/${this.initiative.uuid}`
				var res = yield this.request(path + `/comments`, {
					method: "POST",
					form: VALID_ATTRS
				})

				res.statusCode.must.equal(303)
				res.statusMessage.must.equal("Comment Created")
			})

			describe("when subscribing", function() {
				it("must subscribe if not subscribed before", function*() {
					usersDb.update(this.user, {
						email: "user@example.com",
						email_confirmed_at: new Date
					})

					var path = `/initiatives/${this.initiative.uuid}/comments`
					var res = yield this.request(path, {
						method: "POST",
						form: {__proto__: VALID_ATTRS, subscribe: true}
					})

					res.statusCode.must.equal(303)
					res.statusMessage.must.equal("Comment Created")

					var subscriptions = subscriptionsDb.search(sql`
						SELECT * FROM initiative_subscriptions
					`)

					subscriptions.must.eql([new ValidSubscription({
						initiative_uuid: this.initiative.uuid,
						email: "user@example.com",
						update_token: subscriptions[0].update_token,
						event_interest: false,
						comment_interest: true,
						created_ip: "127.0.0.1",
						created_at: new Date,
						updated_at: new Date,
						confirmed_at: new Date
					})])
				})

				it("must subscribe if subscribed to initiative before", function*() {
					usersDb.update(this.user, {
						email: "user@example.com",
						email_confirmed_at: new Date
					})

					var sub = subscriptionsDb.create(new ValidSubscription({
						initiative_uuid: this.initiative.uuid,
						email: "user@example.com",
						confirmed_at: null,
						event_interest: true,
						comment_interest: false
					}))

					var path = `/initiatives/${this.initiative.uuid}/comments`
					var res = yield this.request(path, {
						method: "POST",
						form: {__proto__: VALID_ATTRS, subscribe: true}
					})

					res.statusCode.must.equal(303)
					res.statusMessage.must.equal("Comment Created")

					subscriptionsDb.search(sql`
						SELECT * FROM initiative_subscriptions
					`).must.eql([{
						__proto__: sub,
						comment_interest: true,
						confirmed_at: new Date,
						updated_at: new Date
					}])
				})

				it("must subscribe if subscribed to initiatives before", function*() {
					usersDb.update(this.user, {
						email: "user@example.com",
						email_confirmed_at: new Date
					})

					var sub = subscriptionsDb.create(new ValidSubscription({
						email: "user@example.com",
						confirmed_at: new Date,
						event_interest: true,
						comment_interest: false
					}))

					var path = `/initiatives/${this.initiative.uuid}/comments`
					var res = yield this.request(path, {
						method: "POST",
						form: {__proto__: VALID_ATTRS, subscribe: true}
					})

					res.statusCode.must.equal(303)
					res.statusMessage.must.equal("Comment Created")

					var subscriptions = subscriptionsDb.search(sql`
						SELECT * FROM initiative_subscriptions
					`)

					subscriptions.must.eql([sub, new ValidSubscription({
						initiative_uuid: this.initiative.uuid,
						email: "user@example.com",
						update_token: subscriptions[1].update_token,
						event_interest: false,
						comment_interest: true,
						created_ip: "127.0.0.1",
						created_at: new Date,
						updated_at: new Date,
						confirmed_at: new Date
					})])
				})

				it("must not subscribe if email not verified", function*() {
					usersDb.update(this.user, {
						unconfirmed_email: "user@example.com",
						email_confirmation_token: Crypto.randomBytes(12)
					})

					var path = `/initiatives/${this.initiative.uuid}/comments`
					var res = yield this.request(path, {
						method: "POST",
						form: {__proto__: VALID_ATTRS, subscribe: true}
					})

					res.statusCode.must.equal(303)
					res.statusMessage.must.equal("Comment Created")

					subscriptionsDb.search(sql`
						SELECT * FROM initiative_subscriptions
					`).must.be.empty()
				})

				it("must unsubscribe if subscribed to initiative before", function*() {
					usersDb.update(this.user, {
						email: "user@example.com",
						email_confirmed_at: new Date
					})

					var sub = subscriptionsDb.create(new ValidSubscription({
						initiative_uuid: this.initiative.uuid,
						email: "user@example.com",
						comment_interest: true,
						confirmed_at: new Date
					}))

					var path = `/initiatives/${this.initiative.uuid}/comments`
					var res = yield this.request(path, {
						method: "POST",
						form: {__proto__: VALID_ATTRS, subscribe: false}
					})

					res.statusCode.must.equal(303)
					res.statusMessage.must.equal("Comment Created")

					subscriptionsDb.search(sql`
						SELECT * FROM initiative_subscriptions
					`).must.eql([{
						__proto__: sub,
						comment_interest: false,
						updated_at: new Date
					}])
				})

				it("must unsubscribe if subscribed to initiatives before", function*() {
					usersDb.update(this.user, {
						email: "user@example.com",
						email_confirmed_at: new Date
					})

					var sub = subscriptionsDb.create(new ValidSubscription({
						email: "user@example.com",
						comment_interest: true,
						confirmed_at: new Date
					}))

					var res = yield this.request(`/initiatives/${this.initiative.uuid}/comments`, {
						method: "POST",
						form: {__proto__: VALID_ATTRS, subscribe: false}
					})

					res.statusCode.must.equal(303)
					res.statusMessage.must.equal("Comment Created")

					subscriptionsDb.search(sql`
						SELECT * FROM initiative_subscriptions
					`).must.eql([sub])
				})
			})

			it("must email subscribers interested in comments", function*() {
				var subscriptions = subscriptionsDb.create([
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
					form: VALID_ATTRS
				})

				res.statusCode.must.equal(303)
				res.statusMessage.must.equal("Comment Created")

				this.emails.length.must.equal(1)

				var emailAddresses = subscriptions.slice(2).map((s) => s.email).sort()
				var email = this.emails[0]
				email.envelope.to.must.eql(emailAddresses)
				email.headers.subject.must.include(this.initiative.title)
				var vars = email.headers["x-mailgun-recipient-variables"]
				subscriptions.slice(2).forEach((s) => vars.must.include(s.update_token))
			})

			it("must email subscribers if commented as admin", function*() {
				var user = usersDb.update(this.user, {
					name: "John Smith",
					country: Config.adminPersonalIds[0].slice(0, 2),
					personal_id: Config.adminPersonalIds[0].slice(2)
				})

				subscriptionsDb.create(new ValidSubscription({
					initiative_uuid: this.initiative.uuid,
					confirmed_at: new Date,
					comment_interest: true
				}))

				var path = `/initiatives/${this.initiative.uuid}`
				var res = yield this.request(path + `/comments`, {
					method: "POST",
					form: {__proto__: VALID_ATTRS, persona: "admin"}
				})

				res.statusCode.must.equal(303)
				res.statusMessage.must.equal("Comment Created")

				this.emails.length.must.equal(1)

				var email = this.emails[0]
				email.headers.subject.must.include(this.initiative.title)
				email.headers.subject.must.not.include(user.name)
				email.body.must.not.include(user.name)
				email.body.must.include(`Autor: ${t("COMMENT_AUTHOR_ADMIN")}`)
			})

			it("must not email subscribers if private", function*() {
				initiativesDb.update(this.initiative, {
					user_id: this.user.id,
					published_at: null
				})

				subscriptionsDb.create([
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
					form: VALID_ATTRS
				})

				res.statusCode.must.equal(303)
				res.statusMessage.must.equal("Comment Created")
				this.emails.must.be.empty()
			})

			it("must not email commentator if subscribed", function*() {
				usersDb.update(this.user, {
					email: "user@example.com",
					email_confirmed_at: new Date
				})

				subscriptionsDb.create([
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
					form: VALID_ATTRS
				})

				res.statusCode.must.equal(303)
				res.statusMessage.must.equal("Comment Created")
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
					var res = yield this.request(path, {method: "POST", form: attrs})

					res.statusCode.must.equal(422)
					var dom = parseHtml(res.body)
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
				res.statusMessage.must.equal("Unauthorized")
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
				var initiative = initiativesDb.create(new ValidInitiative({
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
			var author = usersDb.create(new ValidUser({name: "Johnny Lang"}))
			var replier = usersDb.create(new ValidUser({name: "Kenny Loggins"}))

			var comment = commentsDb.create(new ValidComment({
				initiative_uuid: this.initiative.uuid,
				user_id: author.id,
				user_uuid: _.serializeUuid(author.uuid)
			}))

			var reply = commentsDb.create(new ValidComment({
				initiative_uuid: this.initiative.uuid,
				user_id: replier.id,
				user_uuid: _.serializeUuid(replier.uuid),
				parent_id: comment.id
			}))

			var path = `/initiatives/${this.initiative.uuid}`
			path += `/comments/${comment.id}`
			var res = yield this.request(path)
			res.statusCode.must.equal(200)

			var dom = parseHtml(res.body)
			var commentEl = dom.querySelector("#initiative-comment")
			commentEl.querySelector(".author").textContent.must.equal(author.name)
			commentEl.textContent.must.include(comment.title)
			commentEl.textContent.must.include(comment.text)

			var replyEl = dom.querySelector("#initiative-comment .comment-replies")
			replyEl.querySelector(".author").textContent.must.equal(replier.name)
			replyEl.textContent.must.include(reply.text)
		})

		it("must not render author name for anonymized comment", function*() {
			var author = usersDb.create(new ValidUser({name: "Johnny Lang"}))

			var comment = commentsDb.create(new ValidComment({
				initiative_uuid: this.initiative.uuid,
				user_id: author.id,
				user_uuid: _.serializeUuid(author.uuid),
				anonymized_at: new Date
			}))

			var path = `/initiatives/${this.initiative.uuid}`
			path += `/comments/${comment.id}`
			var res = yield this.request(path)
			res.statusCode.must.equal(200)

			var dom = parseHtml(res.body)
			res.body.must.not.include(author.name)

			var commentEl = dom.querySelector("#initiative-comment")
			commentEl.querySelector(".author").textContent.must.equal(
				t("COMMENT_AUTHOR_HIDDEN")
			)
		})

		it("must not render author name for admin comment", function*() {
			var author = usersDb.create(new ValidUser({name: "Johnny Lang"}))

			var comment = commentsDb.create(new ValidComment({
				initiative_uuid: this.initiative.uuid,
				user_id: author.id,
				user_uuid: _.serializeUuid(author.uuid),
				as_admin: true
			}))

			var path = `/initiatives/${this.initiative.uuid}`
			path += `/comments/${comment.id}`
			var res = yield this.request(path)
			res.statusCode.must.equal(200)

			var dom = parseHtml(res.body)
			res.body.must.not.include(author.name)

			var commentEl = dom.querySelector("#initiative-comment")
			commentEl.querySelector(".author").textContent.must.equal(
				t("COMMENT_AUTHOR_ADMIN")
			)
		})

		it("must not render author name for anonymized reply", function*() {
			var author = usersDb.create(new ValidUser({name: "Johnny Lang"}))
			var replier = usersDb.create(new ValidUser({name: "Kenny Loggins"}))

			var comment = commentsDb.create(new ValidComment({
				initiative_uuid: this.initiative.uuid,
				user_id: author.id,
				user_uuid: _.serializeUuid(author.uuid)
			}))

			commentsDb.create(new ValidComment({
				initiative_uuid: this.initiative.uuid,
				user_id: replier.id,
				user_uuid: _.serializeUuid(replier.uuid),
				parent_id: comment.id,
				anonymized_at: new Date
			}))

			var path = `/initiatives/${this.initiative.uuid}`
			path += `/comments/${comment.id}`
			var res = yield this.request(path)
			res.statusCode.must.equal(200)

			var dom = parseHtml(res.body)

			var commentEl = dom.querySelector("#initiative-comment")
			commentEl.querySelector(".author").textContent.must.equal(author.name)

			res.body.must.not.include(replier.name)

			var replyEl = dom.querySelector("#initiative-comment .comment-replies")
			replyEl.querySelector(".author").textContent.must.equal(
				t("COMMENT_AUTHOR_HIDDEN")
			)
		})

		it("must not render author name for admin reply", function*() {
			var author = usersDb.create(new ValidUser({name: "Johnny Lang"}))
			var replier = usersDb.create(new ValidUser({name: "Kenny Loggins"}))

			var comment = commentsDb.create(new ValidComment({
				initiative_uuid: this.initiative.uuid,
				user_id: author.id,
				user_uuid: _.serializeUuid(author.uuid)
			}))

			commentsDb.create(new ValidComment({
				initiative_uuid: this.initiative.uuid,
				user_id: replier.id,
				user_uuid: _.serializeUuid(replier.uuid),
				parent_id: comment.id,
				as_admin: true
			}))

			var path = `/initiatives/${this.initiative.uuid}`
			path += `/comments/${comment.id}`
			var res = yield this.request(path)
			res.statusCode.must.equal(200)

			var dom = parseHtml(res.body)

			var commentEl = dom.querySelector("#initiative-comment")
			commentEl.querySelector(".author").textContent.must.equal(author.name)

			res.body.must.not.include(replier.name)

			var replyEl = dom.querySelector("#initiative-comment .comment-replies")
			replyEl.querySelector(".author").textContent.must.equal(
				t("COMMENT_AUTHOR_ADMIN")
			)
		})
		it("must show comment page given external initiative", function*() {
			var initiative = initiativesDb.create(new ValidInitiative({
				phase: "parliament",
				external: true
			}))

			var author = usersDb.create(new ValidUser({name: "Johnny Lang"}))

			var comment = commentsDb.create(new ValidComment({
				initiative_uuid: initiative.uuid,
				user_id: author.id,
				user_uuid: _.serializeUuid(author.uuid)
			}))

			var path = `/initiatives/${initiative.uuid}/comments/${comment.id}`
			var res = yield this.request(path)
			res.statusCode.must.equal(200)

			var dom = parseHtml(res.body)
			var commentEl = dom.querySelector("#initiative-comment")
			commentEl.querySelector(".author").textContent.must.equal(author.name)
			commentEl.textContent.must.include(comment.title)
			commentEl.textContent.must.include(comment.text)
		})

		it("must not show other comment's replies", function*() {
			var author = usersDb.create(new ValidUser({name: "Johnny Lang"}))

			var comment = commentsDb.create(new ValidComment({
				initiative_uuid: this.initiative.uuid,
				user_id: author.id,
				user_uuid: _.serializeUuid(author.uuid)
			}))

			var other = commentsDb.create(new ValidComment({
				initiative_uuid: this.initiative.uuid,
				user_id: author.id,
				user_uuid: _.serializeUuid(author.uuid)
			}))

			var reply = commentsDb.create(new ValidComment({
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
			var author = usersDb.create(new ValidUser)
			var replier = usersDb.create(new ValidUser)

			var comment = commentsDb.create(new ValidComment({
				uuid: "f80ebc50-8f96-4482-8211-602b7376f204",
				initiative_uuid: this.initiative.uuid,
				user_id: author.id,
				user_uuid: _.serializeUuid(replier.uuid)
			}))

			var reply = commentsDb.create(new ValidComment({
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
			var dom = parseHtml(res.body)
			dom.querySelector("#comment-" + comment.uuid).must.exist()
			dom.querySelector("#comment-" + reply.uuid).must.exist()
		})

		it("must redirect UUID to id", function*() {
			var author = usersDb.create(new ValidUser)

			var comment = commentsDb.create(new ValidComment({
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
			var author = usersDb.create(new ValidUser)

			var parent = commentsDb.create(new ValidComment({
				initiative_uuid: this.initiative.uuid,
				user_id: author.id,
				user_uuid: _.serializeUuid(author.uuid)
			}))

			var comment = commentsDb.create(new ValidComment({
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
			var other = initiativesDb.create(new ValidInitiative({
				user_id: this.author.id
			}))

			var author = usersDb.create(new ValidUser)

			var comment = commentsDb.create(new ValidComment({
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

	describe("DELETE /:id", function() {
		describe("when not logged in", function() {
			it("must respond with 401 when not logged in", function*() {
				var author = usersDb.create(new ValidUser)

				var comment = commentsDb.create(new ValidComment({
					initiative_uuid: this.initiative.uuid,
					user_id: author.id,
					user_uuid: _.serializeUuid(author.uuid)
				}))

				var path = `/initiatives/${this.initiative.uuid}/comments/${comment.id}`
				var res = yield this.request(path, {method: "DELETE"})
				res.statusCode.must.equal(401)
				res.statusMessage.must.equal("Unauthorized")
			})
		})

		describe("when logged in", function() {
			require("root/test/fixtures").user()

			it("must respond with 403 if not author", function*() {
				var author = usersDb.create(new ValidUser)

				var comment = commentsDb.create(new ValidComment({
					initiative_uuid: this.initiative.uuid,
					user_id: author.id,
					user_uuid: _.serializeUuid(author.uuid)
				}))

				var path = `/initiatives/${this.initiative.uuid}/comments/${comment.id}`
				var res = yield this.request(path, {method: "DELETE"})

				res.statusCode.must.equal(403)
				res.statusMessage.must.equal("Not Author")
				commentsDb.read(comment).must.eql(comment)
			})

			it("must respond with 405 given reply", function*() {
				var comment = commentsDb.create(new ValidComment({
					initiative_uuid: this.initiative.uuid,
					user_id: this.user.id,
					user_uuid: _.serializeUuid(this.user.uuid)
				}))

				var reply = commentsDb.create(new ValidComment({
					initiative_uuid: this.initiative.uuid,
					user_id: this.user.id,
					user_uuid: _.serializeUuid(this.user.uuid),
					parent_id: comment.id
				}))

				var path = `/initiatives/${this.initiative.uuid}/comments/${reply.id}`
				var res = yield this.request(path, {method: "DELETE"})

				res.statusCode.must.equal(405)
				res.statusMessage.must.equal("Cannot Delete Replies")
				commentsDb.read(comment).must.eql(comment)
			})

			it("must respond with 405 given anonymized comment even if other's",
				function*() {
				var author = usersDb.create(new ValidUser)

				var comment = commentsDb.create(new ValidComment({
					initiative_uuid: this.initiative.uuid,
					user_id: author.id,
					user_uuid: _.serializeUuid(author.uuid),
					anonymized_at: new Date
				}))

				var path = `/initiatives/${this.initiative.uuid}/comments/${comment.id}`
				var res = yield this.request(path, {method: "DELETE"})

				res.statusCode.must.equal(405)
				res.statusMessage.must.equal("Already Anonymized")
				commentsDb.read(comment).must.eql(comment)
			})

			it("must anonymize comment", function*() {
				var comment = commentsDb.create(new ValidComment({
					initiative_uuid: this.initiative.uuid,
					user_id: this.user.id,
					user_uuid: _.serializeUuid(this.user.uuid)
				}))

				var path = `/initiatives/${this.initiative.uuid}/comments/${comment.id}`
				var res = yield this.request(path, {method: "DELETE"})

				res.statusCode.must.equal(303)
				res.statusMessage.must.equal("Comment Anonymized")
				res.headers.location.must.equal(path)

				commentsDb.read(comment).must.eql({
					__proto__: comment,
					anonymized_at: new Date
				})

				var cookies = parseCookies(res.headers["set-cookie"])
				res = yield this.request(res.headers.location, {
					headers: {Cookie: serializeCookies(cookies)}
				})

				res.statusCode.must.equal(200)
				res.body.must.include(t("COMMENT_ANONYMIZED"))
				res.body.must.not.include(this.user.name)
			})
		})
	})

	describe("POST /:id/replies", function() {
		describe("when not logged in", function() {
			it("must respond with 401 when not logged in", function*() {
				var author = usersDb.create(new ValidUser)

				var comment = commentsDb.create(new ValidComment({
					initiative_uuid: this.initiative.uuid,
					user_id: author.id,
					user_uuid: _.serializeUuid(author.uuid)
				}))

				var path = `/initiatives/${this.initiative.uuid}/comments/${comment.id}`
				var res = yield this.request(path + "/replies", {method: "POST"})
				res.statusCode.must.equal(401)
				res.statusMessage.must.equal("Unauthorized")
			})
		})

		describe("when logged in", function() {
			require("root/test/fixtures").user()

			it("must create reply", function*() {
				var author = usersDb.create(new ValidUser)

				var comment = commentsDb.create(new ValidComment({
					user_id: author.id,
					user_uuid: _.serializeUuid(author.uuid),
					initiative_uuid: this.initiative.uuid
				}))

				var path = `/initiatives/${this.initiative.uuid}/comments/${comment.id}`
				var res = yield this.request(path + "/replies", {
					method: "POST",
					form: {text: "But I forgot them."}
				})

				res.statusCode.must.equal(303)
				res.statusMessage.must.equal("Comment Reply Created")

				var reply = new ValidComment({
					id: comment.id + 1,
					initiative_uuid: this.initiative.uuid,
					user_id: this.user.id,
					user_uuid: _.serializeUuid(this.user.uuid),
					parent_id: comment.id,
					text: "But I forgot them."
				})

				commentsDb.search(sql`
					SELECT * FROM comments ORDER BY created_at
				`).must.eql([comment, reply])

				res.headers.location.must.equal(path + "#comment-" + reply.id)
			})

			_.each({
				self: false,
				admin: true
			}, function(asAdmin, persona) {
				it("must create reply", function*() {
					usersDb.update(this.user, {
						country: Config.adminPersonalIds[0].slice(0, 2),
						personal_id: Config.adminPersonalIds[0].slice(2)
					})

					var author = usersDb.create(new ValidUser)

					var comment = commentsDb.create(new ValidComment({
						user_id: author.id,
						user_uuid: _.serializeUuid(author.uuid),
						initiative_uuid: this.initiative.uuid
					}))

					var path = `/initiatives/${this.initiative.uuid}/comments/${comment.id}`
					var res = yield this.request(path + "/replies", {
						method: "POST",
						form: {text: "But I forgot them.", persona: persona}
					})

					res.statusCode.must.equal(303)
					res.statusMessage.must.equal("Comment Reply Created")

					commentsDb.search(sql`
						SELECT * FROM comments ORDER BY created_at
					`).must.eql([comment, new ValidComment({
						id: comment.id + 1,
						initiative_uuid: this.initiative.uuid,
						user_id: this.user.id,
						user_uuid: _.serializeUuid(this.user.uuid),
						parent_id: comment.id,
						text: "But I forgot them.",
						as_admin: asAdmin
					})])
				})
			})

			it("must not create reply for admin as a non-admin", function*() {
				var author = usersDb.create(new ValidUser)

				var comment = commentsDb.create(new ValidComment({
					user_id: author.id,
					user_uuid: _.serializeUuid(author.uuid),
					initiative_uuid: this.initiative.uuid
				}))

				var path = `/initiatives/${this.initiative.uuid}/comments/${comment.id}`
				var res = yield this.request(path + "/replies", {
					method: "POST",
					form: {text: "But I forgot them.", persona: "admin"}
				})

				res.statusCode.must.equal(303)
				res.statusMessage.must.equal("Comment Reply Created")

				commentsDb.search(sql`
					SELECT * FROM comments ORDER BY created_at
				`).must.eql([comment, new ValidComment({
					id: comment.id + 1,
					initiative_uuid: this.initiative.uuid,
					user_id: this.user.id,
					user_uuid: _.serializeUuid(this.user.uuid),
					parent_id: comment.id,
					text: "But I forgot them.",
					as_admin: false
				})])
			})

			it("must create reply given external initiative", function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					phase: "parliament",
					external: true
				}))

				var author = usersDb.create(new ValidUser)

				var comment = commentsDb.create(new ValidComment({
					user_id: author.id,
					user_uuid: _.serializeUuid(author.uuid),
					initiative_uuid: initiative.uuid
				}))

				var path = `/initiatives/${initiative.uuid}/comments/${comment.id}`
				var res = yield this.request(path + "/replies", {
					method: "POST",
					form: {text: "But I forgot them."}
				})

				res.statusCode.must.equal(303)
				res.statusMessage.must.equal("Comment Reply Created")

				commentsDb.search(sql`
					SELECT * FROM comments ORDER BY created_at
				`).must.eql([comment, new ValidComment({
					id: comment.id + 1,
					initiative_uuid: initiative.uuid,
					user_id: this.user.id,
					user_uuid: _.serializeUuid(this.user.uuid),
					parent_id: comment.id,
					text: "But I forgot them."
				})])
			})

			it("must redirect to referrer without host", function*() {
				var author = usersDb.create(new ValidUser)

				var comment = commentsDb.create(new ValidComment({
					user_id: author.id,
					user_uuid: _.serializeUuid(author.uuid),
					initiative_uuid: this.initiative.uuid
				}))

				var path = `/initiatives/${this.initiative.uuid}/comments/${comment.id}`
				var res = yield this.request(path + `/replies`, {
					method: "POST",
					form: {__proto__: VALID_REPLY_ATTRS, referrer: "/comments"}
				})

				res.statusCode.must.equal(303)
				res.statusMessage.must.equal("Comment Reply Created")
				res.headers.location.must.equal("/comments#comment-" + (comment.id + 1))
			})

			it("must redirect to referrer on same host", function*() {
				var author = usersDb.create(new ValidUser)

				var comment = commentsDb.create(new ValidComment({
					user_id: author.id,
					user_uuid: _.serializeUuid(author.uuid),
					initiative_uuid: this.initiative.uuid
				}))

				var path = `/initiatives/${this.initiative.uuid}/comments/${comment.id}`
				var res = yield this.request(path + `/replies`, {
					method: "POST",
					form: {__proto__: VALID_REPLY_ATTRS, referrer: this.url + "/comments"}
				})

				res.statusCode.must.equal(303)
				res.statusMessage.must.equal("Comment Reply Created")

				res.headers.location.must.equal(
					this.url + "/comments#comment-" + (comment.id + 1)
				)
			})

			SITE_URLS.forEach(function(url) {
				it(`must redirect back to ${Url.parse(url).hostname}`, function*() {
					var author = usersDb.create(new ValidUser)

					var comment = commentsDb.create(new ValidComment({
						user_id: author.id,
						user_uuid: _.serializeUuid(author.uuid),
						initiative_uuid: this.initiative.uuid
					}))

					var path = `/initiatives/${this.initiative.uuid}`
					path += `/comments/${comment.id}/replies`
					var res = yield this.request(path, {
						method: "POST",
						form: {__proto__: VALID_REPLY_ATTRS, referrer: url + "/comments"}
					})

					res.statusCode.must.equal(303)
					res.statusMessage.must.equal("Comment Reply Created")

					res.headers.location.must.equal(
						url + "/comments#comment-" + (comment.id + 1)
					)
				})
			})

			it("must not redirect back to other hosts", function*() {
				var author = usersDb.create(new ValidUser)

				var comment = commentsDb.create(new ValidComment({
					user_id: author.id,
					user_uuid: _.serializeUuid(author.uuid),
					initiative_uuid: this.initiative.uuid
				}))

				var path = `/initiatives/${this.initiative.uuid}/comments/${comment.id}`
				var res = yield this.request(path + `/replies`, {
					method: "POST",
					form: {
						__proto__: VALID_REPLY_ATTRS,
						referrer: "http://example.com/evil"
					}
				})

				res.statusCode.must.equal(303)
				res.statusMessage.must.equal("Comment Reply Created")
				res.headers.location.must.equal(path + "#comment-" + (comment.id + 1))
			})

			it("must email subscribers interested in comments", function*() {
				var author = usersDb.create(new ValidUser)

				var comment = commentsDb.create(new ValidComment({
					user_id: author.id,
					user_uuid: _.serializeUuid(author.uuid),
					initiative_uuid: this.initiative.uuid
				}))

				var subscriptions = subscriptionsDb.create([
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

				var path = `/initiatives/${this.initiative.uuid}/comments/${comment.id}`
				var res = yield this.request(path + `/replies`, {
					method: "POST",
					form: VALID_REPLY_ATTRS
				})

				res.statusCode.must.equal(303)

				this.emails.length.must.equal(1)

				var emailAddresses = subscriptions.slice(2).map((s) => s.email).sort()
				var email = this.emails[0]
				email.envelope.to.must.eql(emailAddresses)
				email.headers.subject.must.include(this.initiative.title)
				var vars = email.headers["x-mailgun-recipient-variables"]
				subscriptions.slice(2).forEach((s) => vars.must.include(s.update_token))
			})

			it("must email subscribers if commented as admin", function*() {
				var user = usersDb.update(this.user, {
					name: "John Smith",
					country: Config.adminPersonalIds[0].slice(0, 2),
					personal_id: Config.adminPersonalIds[0].slice(2)
				})

				var author = usersDb.create(new ValidUser)

				var comment = commentsDb.create(new ValidComment({
					user_id: author.id,
					user_uuid: _.serializeUuid(author.uuid),
					initiative_uuid: this.initiative.uuid
				}))

				subscriptionsDb.create(new ValidSubscription({
					initiative_uuid: this.initiative.uuid,
					confirmed_at: new Date,
					comment_interest: true
				}))

				var path = `/initiatives/${this.initiative.uuid}/comments/${comment.id}`
				var res = yield this.request(path + `/replies`, {
					method: "POST",
					form: {__proto__: VALID_REPLY_ATTRS, persona: "admin"}
				})

				res.statusCode.must.equal(303)

				this.emails.length.must.equal(1)

				var email = this.emails[0]
				email.headers.subject.must.include(this.initiative.title)
				email.headers.subject.must.not.include(user.name)
				email.body.must.not.include(user.name)
				email.body.must.include(`Autor: ${t("COMMENT_AUTHOR_ADMIN")}`)
			})

			it("must not email subscribers if private", function*() {
				initiativesDb.update(this.initiative, {
					user_id: this.user.id,
					published_at: null
				})

				var author = usersDb.create(new ValidUser)

				var comment = commentsDb.create(new ValidComment({
					user_id: author.id,
					user_uuid: _.serializeUuid(author.uuid),
					initiative_uuid: this.initiative.uuid
				}))

				subscriptionsDb.create([
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

				var path = `/initiatives/${this.initiative.uuid}/comments/${comment.id}`
				var res = yield this.request(path + `/replies`, {
					method: "POST",
					form: VALID_REPLY_ATTRS
				})

				res.statusCode.must.equal(303)
				this.emails.must.be.empty()
			})

			it("must not email commentator if subscribed", function*() {
				usersDb.update(this.user, {
					email: "user@example.com",
					email_confirmed_at: new Date
				})

				var author = usersDb.create(new ValidUser)

				var comment = commentsDb.create(new ValidComment({
					user_id: author.id,
					user_uuid: _.serializeUuid(author.uuid),
					initiative_uuid: this.initiative.uuid
				}))

				subscriptionsDb.create([
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

				var path = `/initiatives/${this.initiative.uuid}/comments/${comment.id}`
				var res = yield this.request(path + `/replies`, {
					method: "POST",
					form: VALID_REPLY_ATTRS
				})

				res.statusCode.must.equal(303)
				this.emails.must.be.empty()
			})

			it("must respond with 405 given a reply", function*() {
				var author = usersDb.create(new ValidUser)

				var parent = commentsDb.create(new ValidComment({
					initiative_uuid: this.initiative.uuid,
					user_id: author.id,
					user_uuid: _.serializeUuid(author.uuid)
				}))

				var comment = commentsDb.create(new ValidComment({
					initiative_uuid: this.initiative.uuid,
					user_id: author.id,
					user_uuid: _.serializeUuid(author.uuid),
					parent_id: parent.id
				}))

				var path = `/initiatives/${this.initiative.uuid}/comments/${comment.id}`
				var res = yield this.request(path + "/replies", {method: "POST"})
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
					var author = usersDb.create(new ValidUser)

					var comment = commentsDb.create(new ValidComment({
						initiative_uuid: this.initiative.uuid,
						user_id: author.id,
						user_uuid: _.serializeUuid(author.uuid)
					}))

					var path = `/initiatives/${this.initiative.uuid}`
					path += `/comments/${comment.id}`

					var res = yield this.request(path + "/replies", {
						method: "POST",
						form: attrs
					})

					res.statusCode.must.equal(422)
					var dom = parseHtml(res.body)
					dom.querySelector(".flash.error").textContent.must.include(err)

					var form = dom.querySelector(`#comment-${comment.id}-reply`)
					form.elements.text.value.must.equal(attrs.text)
				})
			})

			it("must not create reply if initiative unpublished", function*() {
				initiativesDb.update(this.initiative, {published_at: null})

				var author = usersDb.create(new ValidUser)
				var comment = commentsDb.create(new ValidComment({
					user_id: author.id,
					user_uuid: _.serializeUuid(author.uuid),
					initiative_uuid: this.initiative.uuid
				}))

				var path = `/initiatives/${this.initiative.uuid}/comments/${comment.id}`
				var res = yield this.request(path + `/replies`, {
					method: "POST",
					form: VALID_REPLY_ATTRS
				})

				res.statusCode.must.equal(403)
				res.statusMessage.must.equal("Initiative Not Public")

				commentsDb.search(sql`
					SELECT * FROM comments
				`).must.eql([comment])
			})

			it("must create reply as author if initiative unpublished", function*() {
				initiativesDb.update(this.initiative, {
					user_id: this.user.id,
					published_at: null
				})

				var author = usersDb.create(new ValidUser)
				var comment = commentsDb.create(new ValidComment({
					user_id: author.id,
					user_uuid: _.serializeUuid(author.uuid),
					initiative_uuid: this.initiative.uuid
				}))

				var path = `/initiatives/${this.initiative.uuid}/comments/${comment.id}`
				var res = yield this.request(path + `/replies`, {
					method: "POST",
					form: VALID_REPLY_ATTRS
				})

				res.statusCode.must.equal(303)
			})
		})
	})
})
