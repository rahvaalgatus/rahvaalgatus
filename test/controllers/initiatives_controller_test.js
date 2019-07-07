var _ = require("root/lib/underscore")
var O = require("oolong")
var Url = require("url")
var Atom = require("root/lib/atom")
var DateFns = require("date-fns")
var Config = require("root/config")
var ValidInitiative = require("root/test/valid_db_initiative")
var ValidSubscription = require("root/test/valid_db_initiative_subscription")
var ValidComment = require("root/test/valid_comment")
var Http = require("root/lib/http")
var I18n = require("root/lib/i18n")
var sql = require("sqlate")
var t = require("root/lib/i18n").t.bind(null, "et")
var renderEmail = require("root/lib/i18n").email.bind(null, "et")
var tHtml = _.compose(_.escapeHtml, t)
var respond = require("root/test/fixtures").respond
var newPartner = require("root/test/citizenos_fixtures").newPartner
var newUser = require("root/test/citizenos_fixtures").newUser
var newTopic = require("root/test/citizenos_fixtures").newTopic
var newVote = require("root/test/citizenos_fixtures").newVote
var newSignature = require("root/test/citizenos_fixtures").newSignature
var createPartner = require("root/test/citizenos_fixtures").createPartner
var createUser = require("root/test/citizenos_fixtures").createUser
var createTopic = require("root/test/citizenos_fixtures").createTopic
var createVote = require("root/test/citizenos_fixtures").createVote
var createSignature = require("root/test/citizenos_fixtures").createSignature
var createOptions = require("root/test/citizenos_fixtures").createOptions
var concat = Array.prototype.concat.bind(Array.prototype)
var encodeBase64 = require("root/lib/crypto").encodeBase64
var parseCookies = Http.parseCookies
var parseFlash = Http.parseFlash.bind(null, Config.cookieSecret)
var serializeFlash = Http.serializeFlash.bind(null, Config.cookieSecret)
var initiativesDb = require("root/db/initiatives_db")
var subscriptionsDb = require("root/db/initiative_subscriptions_db")
var eventsDb = require("root/db/initiative_events_db")
var messagesDb = require("root/db/initiative_messages_db")
var signaturesDb = require("root/db/initiative_signatures_db")
var commentsDb = require("root/db/comments_db")
var encodeMime = require("nodemailer/lib/mime-funcs").encodeWord
var parseDom = require("root/test/dom").parse
var next = require("co-next")
var UUID = "5f9a82a5-e815-440b-abe9-d17311b0b366"
var VOTE_UUID = "396b0e5b-cca7-4255-9238-19b464e60b65"
var INITIATIVE_TYPE = "application/vnd.rahvaalgatus.initiative+json; v=1"
var ATOM_TYPE = "application/atom+xml"
var AUTH_TOKEN = "deadbeef"
var SIGN_TOKEN = "feedfed"
var USER_ID = "bb7abca5-dac0-47c2-86c2-88dbd4850b7a"
var BDOC_URL = "http://example.com/api/users/self/topics/" + UUID
BDOC_URL += `/votes/${VOTE_UUID}/downloads/bdocs/user`
BDOC_URL += "?token=" + fakeJwt({userId: USER_ID})

var DISCUSSION = {
	id: UUID,
	createdAt: new Date(2000, 0, 1),
	updatedAt: new Date(2000, 0, 2),
	sourcePartnerId: Config.apiPartnerId,
	status: "inProgress",
	title: "My future thoughts",
	description: "<body><h1>My future thoughts</h1></body>",
	creator: {name: "John"},
	visibility: "public",
	permission: {level: "read"}
}

var PRIVATE_DISCUSSION = O.merge({}, DISCUSSION, {
	visibility: "private",
	permission: {level: "admin"}
})

var EDITABLE_DISCUSSION = O.merge({}, DISCUSSION, {
	permission: {level: "admin"}
})

var CLOSED_DISCUSSION = O.merge({}, DISCUSSION, {
	status: "closed"
})

var INITIATIVE = {
	id: UUID,
	createdAt: new Date(2000, 0, 1),
	updatedAt: new Date(2000, 0, 2),
	sourcePartnerId: Config.apiPartnerId,
	status: "voting",
	title: "My thoughts",
	description: "<body><h1>My thoughts</h1></body>",
	creator: {name: "John"},
	visibility: "public",
	permission: {level: "read"},

	vote: {
		id: VOTE_UUID,
		createdAt: new Date(2999, 11, 15),
		endsAt: new Date(3000, 0, 1),
		options: {rows: [{value: "Yes", voteCount: 0}]}
	}
}

var SIGNED_INITIATIVE = O.merge({}, INITIATIVE, {
	vote: {options: {rows: [{value: "Yes", voteCount: 1, selected: true}]}}
})

var SUCCESSFUL_INITIATIVE = O.merge({}, INITIATIVE, {
	vote: {
		endsAt: new Date(Date.now() - 3600 * 1000),
		options: {rows: [{value: "Yes", voteCount: Config.votesRequired}]}
	}
})

var FAILED_INITIATIVE = O.merge({}, INITIATIVE, {
	vote: {
		endsAt: new Date(Date.now() - 3600 * 1000),
		options: {rows: [{value: "Yes", voteCount: Config.votesRequired / 2}]}
	}
})

var PROCEEDING_INITIATIVE = O.merge({}, SUCCESSFUL_INITIATIVE, {
	status: "followUp"
})

var PROCESSED_FAILED_INITIATIVE = O.merge({}, FAILED_INITIATIVE, {
	status: "closed"
})

var PROCESSED_SUCCESSFUL_INITIATIVE = O.merge({}, SUCCESSFUL_INITIATIVE, {
	status: "closed"
})

describe("InitiativesController", function() {
	require("root/test/web")()
	require("root/test/mitm")()
	require("root/test/db")()
	require("root/test/email")()
	require("root/test/fixtures").csrf()
	beforeEach(require("root/test/mitm").router)

	describe("GET /", function() {
		beforeEach(function*() {
			this.user = yield createUser(newUser())
			this.partner = yield createPartner(newPartner({id: Config.apiPartnerId}))
		})

		it("must show initiatives in discussion", function*() {
			var topic = yield createTopic(newTopic({
				creatorId: this.user.id,
				sourcePartnerId: this.partner.id
			}))

			var res = yield this.request("/initiatives")
			res.statusCode.must.equal(200)
			res.body.must.include(topic.id)
		})

		it("must show initiatives in signing", function*() {
			var topic = yield createTopic(newTopic({
				creatorId: this.user.id,
				sourcePartnerId: this.partner.id,
				status: "voting"
			}))

			yield createVote(topic, newVote())

			var res = yield this.request("/initiatives")
			res.statusCode.must.equal(200)
			res.body.must.include(topic.id)
		})

		it("must show initiatives in parliament", function*() {
			var topic = yield createTopic(newTopic({
				creatorId: this.user.id,
				sourcePartnerId: this.partner.id,
				status: "followUp"
			}))

			yield createVote(topic, newVote())

			var res = yield this.request("/initiatives")
			res.statusCode.must.equal(200)
			res.body.must.include(topic.id)
		})

		it("must show closed initiatives", function*() {
			var topic = yield createTopic(newTopic({
				creatorId: this.user.id,
				sourcePartnerId: this.partner.id,
				status: "closed"
			}))

			var res = yield this.request("/initiatives")
			res.statusCode.must.equal(200)
			res.body.must.include(topic.id)
		})

		_.each(Config.partners, function(partner, id) {
			if (id == Config.apiPartnerId) return

			it("must show initiatives for " + partner.name, function*() {
				var partner = yield createPartner(newPartner({id: id}))

				var topic = yield createTopic(newTopic({
					creatorId: this.user.id,
					sourcePartnerId: partner.id
				}))

				var res = yield this.request("/initiatives")
				res.statusCode.must.equal(200)
				res.body.must.include(topic.id)
			})

			it("must not show closed discussions for " + partner.name, function*() {
				var partner = yield createPartner(newPartner({id: id}))

				var topic = yield createTopic(newTopic({
					creatorId: this.user.id,
					sourcePartnerId: partner.id,
					status: "closed"
				}))

				var res = yield this.request("/initiatives")
				res.statusCode.must.equal(200)
				res.body.must.not.include(topic.id)
			})

			it("must not show closed initiatives for " + partner.name, function*() {
				var partner = yield createPartner(newPartner({id: id}))

				var topic = yield createTopic(newTopic({
					creatorId: this.user.id,
					sourcePartnerId: partner.id,
					status: "closed"
				}))

				yield createVote(topic, newVote())

				var res = yield this.request("/initiatives")
				res.statusCode.must.equal(200)
				res.body.must.include(topic.id)
			})
		})

		it("must not show initiatives from other partners", function*() {
			var partner = yield createPartner(newPartner())

			var topic = yield createTopic(newTopic({
				creatorId: this.user.id,
				sourcePartnerId: partner.id
			}))

			var res = yield this.request("/initiatives")
			res.statusCode.must.equal(200)
			res.body.must.not.include(topic.id)
		})

		it("must not show private initiatives", function*() {
			var topic = yield createTopic(newTopic({
				creatorId: this.user.id,
				sourcePartnerId: this.partner.id,
				visibility: "private"
			}))

			var res = yield this.request("/initiatives")
			res.statusCode.must.equal(200)
			res.body.must.not.include(topic.id)
		})

		it("must not show deleted initiatives", function*() {
			var topic = yield createTopic(newTopic({
				creatorId: this.user.id,
				sourcePartnerId: this.partner.id,
				deletedAt: new Date
			}))

			var res = yield this.request("/initiatives")
			res.statusCode.must.equal(200)
			res.body.must.not.include(topic.id)
		})

		it("must show initiatives by category if given", function*() {
			var topic = yield createTopic(newTopic({
				creatorId: this.user.id,
				sourcePartnerId: this.partner.id,
				categories: ["uuseakus"]
			}))

			var other = yield createTopic(newTopic({
				creatorId: this.user.id,
				sourcePartnerId: this.partner.id
			}))

			var res = yield this.request("/initiatives?category=uuseakus")
			res.statusCode.must.equal(200)
			res.body.must.include(topic.id)
			res.body.must.not.include(other.id)
		})
	})

	describe("GET /new", function() {
		describe("when logged in", function() {
			require("root/test/fixtures").user()

			it("must render", function*() {
				var res = yield this.request("/initiatives/new")
				res.statusCode.must.equal(200)
			})
		})
	})

	describe("POST /", function() {
		describe("when logged in", function() {
			require("root/test/fixtures").user()

			it("must create initiative", function*() {
				var created = 0
				this.router.post("/api/users/self/topics", function(req, res) {
					++created
					req.headers.authorization.must.exist(0)

					req.body.visibility.must.equal("private")

					req.body.description.must.equal(t("INITIATIVE_DEFAULT_HTML", {
						title: "Hello!"
					}))

					respond({data: {id: UUID}}, req, res)
				})

				var res = yield this.request("/initiatives", {
					method: "POST",
					form: {
						_csrf_token: this.csrfToken,
						"accept-tos": true,
						title: "Hello!"
					}
				})

				res.statusCode.must.equal(303)
				res.headers.location.must.equal("/initiatives/" + UUID + "/edit")
				created.must.equal(1)

				yield initiativesDb.search(sql`
					SELECT * FROM initiatives
				`).must.then.eql([new ValidInitiative({uuid: UUID})])
			})

			it("must escape title", function*() {
				this.router.post("/api/users/self/topics", function(req, res) {
					req.headers.authorization.must.exist(0)

					req.body.description.must.equal(t("INITIATIVE_DEFAULT_HTML", {
						title: "Hello &lt;mike&gt;!"
					}))

					respond({data: {id: UUID}}, req, res)
				})

				var res = yield this.request("/initiatives", {
					method: "POST",
					form: {
						_csrf_token: this.csrfToken,
						"accept-tos": true,
						title: "Hello <mike>!"
					}
				})

				res.statusCode.must.equal(303)
			})
		})
	})

	describe("GET /:id", function() {
		describe("when not logged in", function() {
			it("must request initiative", function*() {
				this.router.get(`/api/topics/${UUID}`, function(req, res) {
					var query = Url.parse(req.url, true).query
					query["include[]"].must.be.a.permutationOf(["vote", "event"])
					respond({data: DISCUSSION}, req, res)
				})

				var res = yield this.request("/initiatives/" + UUID)
				res.statusCode.must.equal(200)
			})

			it("must render private discussion", function*() {
				this.router.get(`/api/topics/${UUID}`,
					respond.bind(null, {data: PRIVATE_DISCUSSION}))

				var res = yield this.request("/initiatives/" + UUID)
				res.statusCode.must.equal(200)

				var dom = parseDom(res.body)
				var phases = queryPhases(dom)

				_.sum(_.map(phases, "past")).must.equal(0)
				_.sum(_.map(phases, "current")).must.equal(1)
				phases.edit.current.must.be.true()
				phases.edit.text.must.equal("")
			})

			it("must render discussion", function*() {
				this.router.get(`/api/topics/${UUID}`,
					respond.bind(null, {data: _.merge({}, DISCUSSION, {
						endsAt: DateFns.addDays(new Date, 5)
					})})
				)

				var res = yield this.request("/initiatives/" + UUID)
				res.statusCode.must.equal(200)

				res.body.must.include(tHtml("INITIATIVE_IN_DISCUSSION"))
				res.body.must.include(t("DISCUSSION_DEADLINE"))

				var dom = parseDom(res.body)
				var phases = queryPhases(dom)

				_.sum(_.map(phases, "past")).must.equal(0)
				_.sum(_.map(phases, "current")).must.equal(1)
				phases.edit.current.must.be.true()

				phases.edit.text.must.equal(
					t("TXT_DEADLINE_CALENDAR_DAYS_LEFT", {numberOfDaysLeft: 6})
				)
			})

			it("must render discussion over its deadline", function*() {
				this.router.get(`/api/topics/${UUID}`,
					respond.bind(null, {data: _.merge({}, DISCUSSION, {
						endsAt: DateFns.addDays(new Date, -5)
					})})
				)

				var res = yield this.request("/initiatives/" + UUID)
				res.statusCode.must.equal(200)

				var dom = parseDom(res.body)
				var phases = queryPhases(dom)
				phases.edit.current.must.be.true()
				phases.edit.text.must.equal(t("DISCUSSION_FINISHED"))
			})

			it("must render initiative in signing", function*() {
				yield initiativesDb.create({
					uuid: UUID,
					phase: "sign"
				})

				this.router.get(`/api/topics/${UUID}`,
					respond.bind(null, {data: SIGNED_INITIATIVE}))

				var res = yield this.request("/initiatives/" + UUID)
				res.statusCode.must.equal(200)
				res.body.must.not.include(tHtml("INITIATIVE_IN_DISCUSSION"))
				res.body.must.not.include(tHtml("VOTING_SUCCEEDED"))
				res.body.must.not.include(tHtml("VOTING_FAILED"))

				var dom = parseDom(res.body)
				var phases = queryPhases(dom)

				_.sum(_.map(phases, "past")).must.equal(1)
				_.sum(_.map(phases, "current")).must.equal(1)
				phases.edit.past.must.be.true()
				phases.sign.current.must.be.true()

				phases.edit.text.must.equal(I18n.formatDateSpan(
					"numeric",
					INITIATIVE.createdAt,
					INITIATIVE.vote.createdAt
				))

				phases.sign.text.must.equal(t("N_SIGNATURES", {votes: 1}))
			})

			it("must render successful initiative", function*() {
				yield initiativesDb.create({
					uuid: UUID,
					phase: "sign"
				})

				this.router.get(`/api/topics/${UUID}`,
					respond.bind(null, {data: SUCCESSFUL_INITIATIVE}))

				var res = yield this.request("/initiatives/" + UUID)
				res.statusCode.must.equal(200)
				res.body.must.include(tHtml("VOTING_SUCCEEDED"))

				var dom = parseDom(res.body)
				var phases = queryPhases(dom)

				_.sum(_.map(phases, "past")).must.equal(1)
				_.sum(_.map(phases, "current")).must.equal(1)
				phases.edit.past.must.be.true()
				phases.sign.current.must.be.true()

				phases.sign.text.must.equal(t("N_SIGNATURES", {votes: 10}))
			})

			it("must render initiative in parliament", function*() {
				yield initiativesDb.create({
					uuid: UUID,
					phase: "parliament",
					sent_to_parliament_at: DateFns.addDays(new Date, -5)
				})

				this.router.get(`/api/topics/${UUID}`,
					respond.bind(null, {data: PROCEEDING_INITIATIVE}))

				var res = yield this.request("/initiatives/" + UUID)
				res.statusCode.must.equal(200)
				res.body.must.include(tHtml("INITIATIVE_IN_PARLIAMENT"))

				var dom = parseDom(res.body)
				var phases = queryPhases(dom)

				_.sum(_.map(phases, "past")).must.equal(2)
				_.sum(_.map(phases, "current")).must.equal(1)
				phases.edit.past.must.be.true()
				phases.sign.past.must.be.true()
				phases.parliament.current.must.be.true()

				phases.sign.text.must.equal(t("N_SIGNATURES", {
					votes: Config.votesRequired
				}))

				phases.parliament.text.must.equal(t("PARLIAMENT_PHASE_N_DAYS_LEFT", {
					days: 25
				}))
			})

			it("must render initiative in parliament with deadline today",
				function*() {
				yield initiativesDb.create({
					uuid: UUID,
					phase: "parliament",
					sent_to_parliament_at: DateFns.addDays(new Date, -30)
				})

				this.router.get(`/api/topics/${UUID}`,
					respond.bind(null, {data: PROCEEDING_INITIATIVE}))

				var res = yield this.request("/initiatives/" + UUID)
				res.statusCode.must.equal(200)

				var dom = parseDom(res.body)
				var phases = queryPhases(dom)
				phases.parliament.text.must.equal(t("PARLIAMENT_PHASE_0_DAYS_LEFT"))
			})

			it("must render initiative in parliament with deadline past",
				function*() {
				yield initiativesDb.create({
					uuid: UUID,
					phase: "parliament",
					sent_to_parliament_at: DateFns.addDays(new Date, -35)
				})

				this.router.get(`/api/topics/${UUID}`,
					respond.bind(null, {data: PROCEEDING_INITIATIVE}))

				var res = yield this.request("/initiatives/" + UUID)
				res.statusCode.must.equal(200)

				var dom = parseDom(res.body)
				var phases = queryPhases(dom)

				phases.parliament.text.must.equal(t("PARLIAMENT_PHASE_N_DAYS_OVER", {
					days: 5
				}))
			})

			it("must render initiative in government", function*() {
				yield initiativesDb.create({
					uuid: UUID,
					phase: "government",
					sent_to_parliament_at: new Date
				})

				this.router.get(`/api/topics/${UUID}`,
					respond.bind(null, {data: PROCEEDING_INITIATIVE}))

				var res = yield this.request("/initiatives/" + UUID)
				res.statusCode.must.equal(200)
				res.body.must.include(tHtml("INITIATIVE_IN_PARLIAMENT"))

				var dom = parseDom(res.body)
				var phases = queryPhases(dom)

				_.sum(_.map(phases, "past")).must.equal(3)
				_.sum(_.map(phases, "current")).must.equal(1)
				phases.edit.past.must.be.true()
				phases.sign.past.must.be.true()
				phases.parliament.past.must.be.true()
				phases.government.current.must.be.true()

				phases.sign.text.must.equal(t("N_SIGNATURES", {
					votes: Config.votesRequired
				}))

				phases.parliament.text.must.equal("")
			})

			it("must render done initiative", function*() {
				yield initiativesDb.create({
					uuid: UUID,
					phase: "done",
					sent_to_parliament_at: new Date
				})

				this.router.get(`/api/topics/${UUID}`,
					respond.bind(null, {data: PROCEEDING_INITIATIVE}))

				var res = yield this.request("/initiatives/" + UUID)
				res.statusCode.must.equal(200)
				res.body.must.include(tHtml("INITIATIVE_IN_PARLIAMENT"))

				var dom = parseDom(res.body)
				var phases = queryPhases(dom)

				_.sum(_.map(phases, "past")).must.equal(4)
				_.sum(_.map(phases, "current")).must.equal(1)
				phases.edit.past.must.be.true()
				phases.sign.past.must.be.true()
				phases.parliament.past.must.be.true()
				phases.government.past.must.be.true()
				phases.done.current.must.be.true()
			})

			it("must render failed initiative", function*() {
				this.router.get(`/api/topics/${UUID}`,
					respond.bind(null, {data: FAILED_INITIATIVE}))

				var res = yield this.request("/initiatives/" + UUID)
				res.statusCode.must.equal(200)
				res.body.must.include(tHtml("VOTING_FAILED"))
			})

			// This was a bug on Dec 13, 2018 where the code checking to display vote
			// results assumed a closed initiative had been voted on.
			it("must render closed discussion", function*() {
				this.router.get(`/api/topics/${UUID}`,
					respond.bind(null, {data: CLOSED_DISCUSSION}))

				var res = yield this.request("/initiatives/" + UUID)
				res.statusCode.must.equal(200)
				res.body.must.not.include(tHtml("INITIATIVE_IN_DISCUSSION"))
			})

			it("must render processed failed initiative", function*() {
				yield initiativesDb.create({
					uuid: UUID,
					sent_to_parliament_at: new Date
				})

				this.router.get(`/api/topics/${UUID}`,
					respond.bind(null, {data: PROCESSED_FAILED_INITIATIVE}))

				var res = yield this.request("/initiatives/" + UUID)
				res.statusCode.must.equal(200)
				res.body.must.include(tHtml("INITIATIVE_PROCESSED"))
				res.body.must.not.include(tHtml("VOTING_SUCCEEDED"))
				res.body.must.not.include(tHtml("VOTING_FAILED"))
				res.body.must.not.include(tHtml("VOTING_DEADLINE"))
			})

			it("must render processed successful initiative", function*() {
				this.router.get(`/api/topics/${UUID}`,
					respond.bind(null, {data: PROCESSED_SUCCESSFUL_INITIATIVE}))

				var res = yield this.request("/initiatives/" + UUID)
				res.statusCode.must.equal(200)
				res.body.must.include(tHtml("INITIATIVE_PROCESSED"))
				res.body.must.not.include(tHtml("VOTING_SUCCEEDED"))
				res.body.must.not.include(tHtml("VOTING_FAILED"))
				res.body.must.not.include(tHtml("VOTING_DEADLINE"))
			})

			it("must render initiative comments", function*() {
				yield initiativesDb.create({uuid: UUID})

				this.router.get(`/api/topics/${UUID}`,
					respond.bind(null, {data: DISCUSSION}))

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

				var res = yield this.request("/initiatives/" + UUID)
				res.statusCode.must.equal(200)

				var dom = parseDom(res.body)
				var commentsEl = dom.getElementById("initiative-comments")
				commentsEl.textContent.must.include(author.name)
				commentsEl.textContent.must.include(comment.title)
				commentsEl.textContent.must.include(comment.text)
				commentsEl.textContent.must.include(replier.name)
				commentsEl.textContent.must.include(reply.text)
			})

			it("must not render comments from other initiatives", function*() {
				yield initiativesDb.create({uuid: UUID})

				this.router.get(`/api/topics/${UUID}`,
					respond.bind(null, {data: DISCUSSION}))

				var comment = yield commentsDb.create(new ValidComment)
				var res = yield this.request("/initiatives/" + UUID)
				res.statusCode.must.equal(200)

				var dom = parseDom(res.body)
				var commentsEl = dom.getElementById("initiative-comments")
				commentsEl.textContent.must.not.include(comment.text)
			})

			it("must respond with 404 when API responds 403 Forbidden", function*() {
				this.router.get(`/api/topics/${UUID}`, function(_req, res) {
					res.statusCode = 403
					res.end()
				})

				var res = yield this.request("/initiatives/" + UUID)
				res.statusCode.must.equal(404)
			})

			it("must respond with 404 when API responds 404 Not Found", function*() {
				this.router.get(`/api/topics/${UUID}`, function(_req, res) {
					res.statusCode = 404
					res.end()
				})

				var res = yield this.request("/initiatives/" + UUID)
				res.statusCode.must.equal(404)
			})

			// This was a bug noticed on Mar 24, 2017 where the UI translation strings
			// were not rendered on the page. They were used only for ID-card errors.
			it("must render UI strings when voting", function*() {
				this.router.get(`/api/topics/${UUID}`, respond.bind(null, {
					data: INITIATIVE
				}))

				var res = yield this.request("/initiatives/" + UUID)
				res.statusCode.must.equal(200)
				res.body.must.include("MSG_ERROR_HWCRYPTO_NO_CERTIFICATES")
			})

			describe("after signing", function() {
				beforeEach(function*() {
					this.user = yield createUser(newUser({id: USER_ID}))

					this.partner = yield createPartner(newPartner({
						id: Config.apiPartnerId
					}))

					this.topic = yield createTopic(newTopic({
						id: UUID,
						creatorId: this.user.id,
						sourcePartnerId: this.partner.id,
						status: "voting"
					}))

					this.vote = yield createVote(this.topic, newVote({id: VOTE_UUID}))
					this.yesAndNo = yield createOptions(this.vote)

					this.router.get(`/api/topics/${UUID}`, respond.bind(null, {
						data: _.merge({}, INITIATIVE, {
							vote: {options: {rows: [
								{id: this.yesAndNo[0], value: "Yes", voteCount: 0},
								{id: this.yesAndNo[1], value: "No", voteCount: 0},
							]}}
						})
					}))
				})

				it("must show thanks and revoke form", function*() {
					var signature = yield createSignature(newSignature({
						userId: this.user.id,
						voteId: this.vote.id,
						optionId: this.yesAndNo[0]
					}))

					var res = yield this.request("/initiatives/" + UUID, {
						cookies: {flash: serializeFlash({signatureId: signature.id})}
					})

					res.statusCode.must.equal(200)
					res.body.must.include(t("THANKS_FOR_SIGNING"))
					res.body.must.include("donate-form")
					res.body.must.not.include(this.yesAndNo[0])
					res.body.must.include(this.yesAndNo[1])
				})

				it("must confirm signature deletion", function*() {
					var signature = yield createSignature(newSignature({
						userId: this.user.id,
						voteId: this.vote.id,
						optionId: this.yesAndNo[1]
					}))

					var res = yield this.request("/initiatives/" + UUID, {
						cookies: {flash: serializeFlash({signatureId: signature.id})}
					})

					res.statusCode.must.equal(200)
					res.body.must.include(t("SIGNATURE_REVOKED"))
					res.body.must.not.include(t("THANKS_FOR_SIGNING"))
					res.body.must.not.include("donate-form")
					res.body.must.include(this.yesAndNo[0])
					res.body.must.not.include(this.yesAndNo[1])
				})

				it("must show thanks when signing twice", function*() {
					var signatures = yield createSignature([
						newSignature({
							userId: this.user.id,
							voteId: this.vote.id,
							optionId: this.yesAndNo[0],
							createdAt: DateFns.addMinutes(new Date, -2)
						}),

						newSignature({
							userId: this.user.id,
							voteId: this.vote.id,
							optionId: this.yesAndNo[0],
							createdAt: DateFns.addMinutes(new Date, -1)
						}),
					])

					var res = yield this.request("/initiatives/" + UUID, {
						cookies: {flash: serializeFlash({signatureId: signatures[1].id})}
					})

					res.statusCode.must.equal(200)
					res.body.must.include(t("THANKS_FOR_SIGNING_AGAIN"))
					res.body.must.include("donate-form")
					res.body.must.not.include(this.yesAndNo[0])
					res.body.must.include(this.yesAndNo[1])
				})

				it("must show thanks when signing after revoking", function*() {
					var signatures = yield createSignature([
						newSignature({
							userId: this.user.id,
							voteId: this.vote.id,
							optionId: this.yesAndNo[1],
							createdAt: DateFns.addMinutes(new Date, -2)
						}),

						newSignature({
							userId: this.user.id,
							voteId: this.vote.id,
							optionId: this.yesAndNo[0],
							createdAt: DateFns.addMinutes(new Date, -1)
						}),
					])

					var res = yield this.request("/initiatives/" + UUID, {
						cookies: {flash: serializeFlash({signatureId: signatures[1].id})}
					})

					res.statusCode.must.equal(200)
					res.body.must.include(t("THANKS_FOR_SIGNING"))
					res.body.must.not.include(t("THANKS_FOR_SIGNING_AGAIN"))
					res.body.must.include("donate-form")
					res.body.must.not.include(this.yesAndNo[0])
					res.body.must.include(this.yesAndNo[1])
				})

				it("must show thanks when signing after signing on another initiative",
					function*() {
					var topic = yield createTopic(newTopic({
						creatorId: this.user.id,
						sourcePartnerId: this.partner.id,
						status: "voting"
					}))

					var vote = yield createVote(topic, newVote())

					var signatures = yield createSignature([
						newSignature({
							userId: this.user.id,
							voteId: vote.id,
							optionId: this.yesAndNo[0],
							createdAt: DateFns.addMinutes(new Date, -2)
						}),

						newSignature({
							userId: this.user.id,
							voteId: this.vote.id,
							optionId: this.yesAndNo[0],
							createdAt: DateFns.addMinutes(new Date, -1)
						}),
					])

					var res = yield this.request("/initiatives/" + UUID, {
						cookies: {flash: serializeFlash({signatureId: signatures[1].id})}
					})

					res.statusCode.must.equal(200)
					res.body.must.not.include(t("THANKS_FOR_SIGNING_AGAIN"))
				})

				it("must show thanks when signing after another user signed",
					function*() {
					var user = yield createUser(newUser())

					var signatures = yield createSignature([
						newSignature({
							userId: user.id,
							voteId: this.vote.id,
							optionId: this.yesAndNo[0],
							createdAt: DateFns.addMinutes(new Date, -2)
						}),

						newSignature({
							userId: this.user.id,
							voteId: this.vote.id,
							optionId: this.yesAndNo[0],
							createdAt: DateFns.addMinutes(new Date, -1)
						}),
					])

					var res = yield this.request("/initiatives/" + UUID, {
						cookies: {flash: serializeFlash({signatureId: signatures[1].id})}
					})

					res.statusCode.must.equal(200)
					res.body.must.not.include(t("THANKS_FOR_SIGNING_AGAIN"))
				})
			})
		})

		describe("when logged in", function() {
			require("root/test/fixtures").user()

			it("must render discussion", function*() {
				this.router.get(`/api/users/self/topics/${UUID}`, respond.bind(null, {
					data: DISCUSSION
				}))

				var res = yield this.request("/initiatives/" + UUID)
				res.statusCode.must.equal(200)
			})

			it("must render signed initiative", function*() {
				this.router.get(`/api/users/self/topics/${UUID}`,
					respond.bind(null, {data: SIGNED_INITIATIVE}))

				var res = yield this.request("/initiatives/" + UUID)
				res.statusCode.must.equal(200)
				res.body.must.include(t("THANKS_FOR_SIGNING"))
				res.body.must.not.include("donate-form")
			})

			it("must render signed initiative with hidden signature", function*() {
				this.router.get(`/api/users/self/topics/${UUID}`,
					respond.bind(null, {data: O.merge({}, INITIATIVE, {
						vote: {
							id: "396b0e5b-cca7-4255-9238-19b464e60b65",
							endsAt: new Date(3000, 0, 1),
							options: {rows: [{value: "Yes", voteCount: 1, selected: true}]}
						}
					})})
				)

				yield signaturesDb.create({
					initiative_uuid: UUID,
					user_uuid: this.user.id,
					hidden: true
				})

				var res = yield this.request("/initiatives/" + UUID)
				res.statusCode.must.equal(200)
				res.body.must.not.include(t("THANKS_FOR_SIGNING"))
				res.body.must.not.include("donate-form")
			})

			it("must render comment form", function*() {
				this.router.get(`/api/users/self/topics/${UUID}`, respond.bind(null, {
					data: DISCUSSION
				}))

				var res = yield this.request("/initiatives/" + UUID)
				res.statusCode.must.equal(200)

				var dom = parseDom(res.body)
				var form = dom.getElementById("comment-form")
				var check = form.querySelector("input[type=checkbox][name=subscribe]")
				check.checked.must.be.false()
			})

			it("must render subscribe checkbox if subscribed to initiative comments",
				function*() {
				yield subscriptionsDb.create(new ValidSubscription({
					initiative_uuid: UUID,
					email: this.user.email,
					confirmed_at: new Date,
					comment_interest: true
				}))
					
				this.router.get(`/api/users/self/topics/${UUID}`, respond.bind(null, {
					data: DISCUSSION
				}))

				var res = yield this.request("/initiatives/" + UUID)
				res.statusCode.must.equal(200)

				var dom = parseDom(res.body)
				var form = dom.getElementById("comment-form")
				var check = form.querySelector("input[type=checkbox][name=subscribe]")
				check.checked.must.be.true()
			})

			it("must render subscribe checkbox if subscribed to initiative, but not to comments",
				function*() {
				yield subscriptionsDb.create(new ValidSubscription({
					initiative_uuid: UUID,
					email: this.user.email,
					confirmed_at: new Date,
					comment_interest: false
				}))
					
				this.router.get(`/api/users/self/topics/${UUID}`, respond.bind(null, {
					data: DISCUSSION
				}))

				var res = yield this.request("/initiatives/" + UUID)
				res.statusCode.must.equal(200)

				var dom = parseDom(res.body)
				var form = dom.getElementById("comment-form")
				var check = form.querySelector("input[type=checkbox][name=subscribe]")
				check.checked.must.be.false()
			})

			it("must render subscribe checkbox if subscribed to initiatives' comments",
				function*() {
				yield subscriptionsDb.create(new ValidSubscription({
					email: this.user.email,
					confirmed_at: new Date,
					comment_interest: true
				}))
					
				this.router.get(`/api/users/self/topics/${UUID}`, respond.bind(null, {
					data: DISCUSSION
				}))

				var res = yield this.request("/initiatives/" + UUID)
				res.statusCode.must.equal(200)

				var dom = parseDom(res.body)
				var form = dom.getElementById("comment-form")
				var check = form.querySelector("input[type=checkbox][name=subscribe]")
				check.checked.must.be.false()
			})
		})
	})

	describe(`GET /:id with ${INITIATIVE_TYPE}`, function() {
		it("must respond with JSON", function*() {
			this.router.get(`/api/topics/${UUID}`, respond.bind(null, {
				data: INITIATIVE
			}))

			var res = yield this.request("/initiatives/" + UUID, {
				headers: {Accept: INITIATIVE_TYPE}
			})

			res.statusCode.must.equal(200)
			res.headers["content-type"].must.equal(INITIATIVE_TYPE)
			res.headers["access-control-allow-origin"].must.equal("*")

			res.body.must.eql({
				title: INITIATIVE.title,
				signatureCount: 0
			})
		})
	})

	describe(`GET /:id with ${ATOM_TYPE}`, function() {
		it("must respond with Atom feed", function*() {
			this.router.get(`/api/topics/${UUID}`, respond.bind(null, {
				data: INITIATIVE
			}))

			var events = yield eventsDb.create([{
				initiative_uuid: UUID,
				title: "We sent it.",
				text: "To somewhere.",
				created_at: new Date(2015, 5, 18),
				updated_at: new Date(2015, 5, 19),
				occurred_at: new Date(2015, 5, 20)
			}, {
				initiative_uuid: UUID,
				title: "They got it.",
				text: "From somewhere.",
				created_at: new Date(2015, 5, 21),
				updated_at: new Date(2015, 5, 22),
				occurred_at: new Date(2015, 5, 22)
			}])

			var path = `/initiatives/${UUID}.atom`
			var res = yield this.request(path)
			res.statusCode.must.equal(200)
			res.headers["content-type"].must.equal(ATOM_TYPE)

			var feed = Atom.parse(res.body).feed
			feed.id.$.must.equal(Config.url + path)
			feed.updated.$.must.equal(events[1].updated_at.toJSON())

			feed.title.$.must.equal(t("ATOM_INITIATIVE_FEED_TITLE", {
				title: INITIATIVE.title
			}))

			var links = _.indexBy(feed.link, (link) => link.rel)
			links.self.href.must.equal(Config.url + path)
			links.alternate.href.must.equal(Config.url)

			feed.author.name.$.must.equal(Config.title)
			feed.author.uri.$.must.equal(Config.url)

			feed.entry.forEach(function(entry, i) {
				var event = events[i]
				var url = `${Config.url}/initiatives/${UUID}/events/${event.id}`
				entry.id.$.must.equal(url)
				entry.updated.$.must.equal(event.updated_at.toJSON())
				entry.published.$.must.equal(event.occurred_at.toJSON())
				entry.title.$.must.equal(event.title)
				entry.content.type.must.equal("text")
				entry.content.$.must.equal(event.text)
			})
		})

		it("must use initiative updated time if no events", function*() {
			this.router.get(`/api/topics/${UUID}`, respond.bind(null, {
				data: INITIATIVE
			}))

			var res = yield this.request(`/initiatives/${UUID}.atom`)
			res.statusCode.must.equal(200)
			var feed = Atom.parse(res.body).feed
			feed.updated.$.must.equal(INITIATIVE.updatedAt.toJSON())
		})

		it("must include generated parliament events", function*() {
			this.router.get(`/api/topics/${UUID}`, respond.bind(null, {
				data: PROCESSED_SUCCESSFUL_INITIATIVE
			}))

			var sentAt = new Date(2015, 5, 17)
			var finishedAt = new Date(2015, 5, 21)

			yield initiativesDb.create({
				uuid: UUID,
				sent_to_parliament_at: sentAt,
				finished_in_parliament_at: finishedAt
			})

			var events = concat({
				id: "sent-to-parliament",
				title: t("FIRST_PROCEEDING_TITLE"),
				text: t("FIRST_PROCEEDING_BODY"),
				updated_at: sentAt,
				occurred_at: sentAt
			}, yield eventsDb.create({
				initiative_uuid: UUID,
				title: "We sent it.",
				text: "To somewhere.",
				created_at: new Date(2015, 5, 18),
				updated_at: new Date(2015, 5, 19),
				occurred_at: new Date(2015, 5, 20)
			}), {
				id: "finished-in-parliament",
				title: t("PROCEEDING_FINISHED_TITLE"),
				text: "",
				updated_at: finishedAt,
				occurred_at: finishedAt
			})

			var res = yield this.request(`/initiatives/${UUID}.atom`)
			res.statusCode.must.equal(200)
			var feed = Atom.parse(res.body).feed
			feed.updated.$.must.equal(finishedAt.toJSON())

			feed.entry.forEach(function(entry, i) {
				var event = events[i]
				var url = `${Config.url}/initiatives/${UUID}/events/${event.id}`
				entry.id.$.must.equal(url)
				entry.updated.$.must.equal(event.updated_at.toJSON())
				entry.published.$.must.equal(event.occurred_at.toJSON())
				entry.title.$.must.equal(event.title)
				;(entry.content.$ || "").must.equal(event.text)
			})
		})
	})

	describe("PUT /:id", function() {
		require("root/test/time")(Date.UTC(2015, 5, 18))

		describe("when logged in", function() {
			require("root/test/fixtures").user()

			describe("given visibility=public", function() {
				it("must render update visibility page", function*() {
					this.router.get(`/api/users/self/topics/${UUID}`,
						respond.bind(null, {data: PRIVATE_DISCUSSION}))

					var res = yield this.request("/initiatives/" + UUID, {
						method: "PUT",
						form: {_csrf_token: this.csrfToken, visibility: "public"}
					})

					res.statusCode.must.equal(200)
				})

				it("must update initiative", function*() {
					this.router.get(`/api/users/self/topics/${UUID}`,
						respond.bind(null, {data: PRIVATE_DISCUSSION}))

					var today = DateFns.startOfDay(new Date)
					var endsAt = DateFns.endOfDay(DateFns.addDays(today, 5))

					var updated = 0
					this.router.put(`/api/users/self/topics/${UUID}`, function(req, res) {
						++updated
						req.body.must.eql({visibility: "public", endsAt: endsAt.toJSON()})
						res.end()
					})

					var res = yield this.request(`/initiatives/${UUID}`, {
						method: "PUT",
						form: {
							_csrf_token: this.csrfToken,
							visibility: "public",
							endsAt: endsAt.toJSON().slice(0, 10)
						}
					})

					updated.must.equal(1)
					res.statusCode.must.equal(303)
					res.headers.location.must.equal(`/initiatives/${UUID}`)

					var flash = parseFlashFromCookies(res.headers["set-cookie"])
					flash.notice.must.equal(t("PUBLISHED_INITIATIVE"))
				})

				it("must clear end email when setting discussion end time",
					function*() {
					var dbInitiative = yield initiativesDb.create({
						uuid: UUID,
						discussion_end_email_sent_at: new Date
					})

					this.router.get(`/api/users/self/topics/${UUID}`,
						respond.bind(null, {data: EDITABLE_DISCUSSION}))

					this.router.put(`/api/users/self/topics/${UUID}`, endResponse)

					var res = yield this.request(`/initiatives/${UUID}`, {
						method: "PUT",
						form: {
							_csrf_token: this.csrfToken,
							visibility: "public",
							endsAt: new Date().toJSON().slice(0, 10)
						}
					})

					res.statusCode.must.equal(303)

					yield initiativesDb.search(sql`
						SELECT * FROM initiatives
					`).must.then.eql([
						_.defaults({discussion_end_email_sent_at: null}, dbInitiative)
					])
				})
			})

			describe("given status=voting", function() {
				it("must render update status for voting page", function*() {
					this.router.get(`/api/users/self/topics/${UUID}`,
						respond.bind(null, {data: EDITABLE_DISCUSSION}))

					var res = yield this.request("/initiatives/" + UUID, {
						method: "PUT",
						form: {_csrf_token: this.csrfToken, status: "voting"}
					})

					res.statusCode.must.equal(200)
					res.body.must.include(t("VOTE_DEADLINE_EXPLANATION"))
				})

				it("must update initiative", function*() {
					var initiative = yield initiativesDb.create({uuid: UUID})

					this.router.get(`/api/users/self/topics/${UUID}`,
						respond.bind(null, {data: EDITABLE_DISCUSSION}))

					var endsAt = DateFns.endOfDay(DateFns.addDays(new Date, 30))

					this.router.post(
						`/api/users/self/topics/${UUID}/votes`,
						function(req, res) {
							req.body.must.eql({
								endsAt: endsAt.toJSON(),
								authType: "hard",
								voteType: "regular",
								delegationIsAllowed: false,
								options: [{value: "Yes"}, {value: "No"}]
							})

							res.end()
						}
					)

					var res = yield this.request(`/initiatives/${UUID}`, {
						method: "PUT",
						form: {
							_csrf_token: this.csrfToken,
							status: "voting",
							endsAt: endsAt.toJSON().slice(0, 10)
						}
					})

					res.statusCode.must.equal(303)
					res.headers.location.must.equal(`/initiatives/${UUID}`)

					var flash = parseFlashFromCookies(res.headers["set-cookie"])
					flash.notice.must.equal(t("INITIATIVE_SIGN_PHASE_UPDATED"))

					yield initiativesDb.search(sql`
						SELECT * FROM initiatives
					`).must.then.eql([{
						__proto__: initiative,
						phase: "sign"
					}])
				})

				it("must clear end email when setting signing end time", function*() {
					var initiative = yield initiativesDb.create({
						uuid: UUID,
						phase: "sign",
						discussion_end_email_sent_at: new Date,
						signing_end_email_sent_at: new Date
					})

					this.router.get(`/api/users/self/topics/${UUID}`, respond.bind(null, {
						data: _.assign({}, INITIATIVE, {permission: {level: "admin"}})
					}))

					this.router.put(
						`/api/users/self/topics/${UUID}/votes/${VOTE_UUID}`,
						endResponse
					)

					var res = yield this.request(`/initiatives/${UUID}`, {
						method: "PUT",
						form: {
							_csrf_token: this.csrfToken,
							status: "voting",
							endsAt: new Date().toJSON().slice(0, 10)
						}
					})

					res.statusCode.must.equal(303)

					yield initiativesDb.search(sql`
						SELECT * FROM initiatives
					`).must.then.eql([{
						__proto__: initiative,
						signing_end_email_sent_at: null
					}])
				})

				it("must email subscribers", function*() {
					this.router.get(`/api/users/self/topics/${UUID}`, respond.bind(null, {
						data: _.assign({}, DISCUSSION, {permission: {level: "admin"}})
					}))

					this.router.post(`/api/users/self/topics/${UUID}/votes`, endResponse)

					var subscriptions = yield subscriptionsDb.create([
						new ValidSubscription({
							initiative_uuid: UUID,
							confirmed_at: new Date,
							official_interest: false
						}),

						new ValidSubscription({
							initiative_uuid: null,
							confirmed_at: new Date,
							official_interest: false
						}),

						new ValidSubscription({
							initiative_uuid: UUID,
							confirmed_at: new Date
						}),

						new ValidSubscription({
							initiative_uuid: null,
							confirmed_at: new Date
						})
					])

					var res = yield this.request(`/initiatives/${UUID}`, {
						method: "PUT",
						form: {
							_csrf_token: this.csrfToken,
							status: "voting",
							endsAt: new Date().toJSON().slice(0, 10)
						}
					})

					res.statusCode.must.equal(303)

					var messages = yield messagesDb.search(sql`
						SELECT * FROM initiative_messages
					`)

					var message = messages[0]
					var emails = subscriptions.slice(2).map((s) => s.email).sort()

					messages.must.eql([{
						id: message.id,
						initiative_uuid: UUID,
						created_at: new Date,
						updated_at: new Date,
						origin: "status",

						title: t("SENT_TO_SIGNING_MESSAGE_TITLE", {
							initiativeTitle: DISCUSSION.title
						}),

						text: renderEmail("SENT_TO_SIGNING_MESSAGE_BODY", {
							initiativeTitle: DISCUSSION.title,
							initiativeUrl: `${Config.url}/initiatives/${UUID}`,
						}),

						sent_at: new Date,
						sent_to: emails
					}])

					this.emails.length.must.equal(1)
					this.emails[0].envelope.to.must.eql(emails)
					var msg = String(this.emails[0].message)
					var subject = encodeMime(message.title).slice(0, 50)
					msg.match(/^Subject: .*/m)[0].must.include(subject)

					subscriptions.slice(2).forEach((s) => (
						msg.must.include(s.update_token)
					))
				})
			})

			describe("given status=followUp", function() {
				it("must render update status for parliament page", function*() {
					this.router.get(`/api/users/self/topics/${UUID}`, respond.bind(null, {
						data: _.merge({}, SUCCESSFUL_INITIATIVE, {
							permission: {level: "admin"}
						})
					}))

					var res = yield this.request("/initiatives/" + UUID, {
						method: "PUT",
						form: {_csrf_token: this.csrfToken, status: "followUp"}
					})

					res.statusCode.must.equal(200)
					res.body.must.include(t("SEND_TO_PARLIAMENT_HEADER"))
					res.body.must.include(t("SEND_TO_PARLIAMENT_TEXT"))
				})

				it("must render update status for parliament page if with paper signatures", function*() {
					yield initiativesDb.create({
						uuid: UUID,
						phase: "sign",
						has_paper_signatures: true
					})

					this.router.get(`/api/users/self/topics/${UUID}`, respond.bind(null, {
						data: _.merge({}, FAILED_INITIATIVE, {
							permission: {level: "admin"}
						})
					}))

					var res = yield this.request("/initiatives/" + UUID, {
						method: "PUT",
						form: {_csrf_token: this.csrfToken, status: "followUp"}
					})

					res.statusCode.must.equal(200)
				})

				it("must respond with 401 if initiative not successful", function*() {
					yield initiativesDb.create({uuid: UUID, phase: "sign"})

					this.router.get(`/api/users/self/topics/${UUID}`, respond.bind(null, {
						data: _.merge({}, FAILED_INITIATIVE, {
							permission: {level: "admin"}
						})
					}))

					var res = yield this.request("/initiatives/" + UUID, {
						method: "PUT",
						form: {_csrf_token: this.csrfToken, status: "followUp"}
					})

					res.statusCode.must.equal(401)
				})

				it("must update initiative", function*() {
					var initiative = yield initiativesDb.create({uuid: UUID})

					this.router.get(`/api/users/self/topics/${UUID}`, respond.bind(null, {
						data: _.merge({}, SUCCESSFUL_INITIATIVE, {
							permission: {level: "admin"}
						})
					}))

					var updated = 0
					this.router.put(`/api/users/self/topics/${UUID}`, function(req, res) {
						++updated
						req.body.must.eql({
							status: "followUp",
							contact: {name: "John", email: "john@example.com", phone: "42"}

						})
						res.end()
					})

					var res = yield this.request(`/initiatives/${UUID}`, {
						method: "PUT",
						form: {
							_csrf_token: this.csrfToken,
							status: "followUp",
							"contact[name]": "John",
							"contact[email]": "john@example.com",
							"contact[phone]": "42"
						}
					})

					updated.must.equal(1)
					res.statusCode.must.equal(303)
					res.headers.location.must.equal(`/initiatives/${UUID}`)

					var flash = parseFlashFromCookies(res.headers["set-cookie"])
					flash.notice.must.equal(t("SENT_TO_PARLIAMENT_CONTENT"))

					yield initiativesDb.search(sql`
						SELECT * FROM initiatives
					`).must.then.eql([{
						__proto__: initiative,
						phase: "parliament",
						sent_to_parliament_at: new Date
					}])
				})

				it("must email subscribers", function*() {
					this.router.get(`/api/users/self/topics/${UUID}`, respond.bind(null, {
						data: _.assign({}, SUCCESSFUL_INITIATIVE, {
							permission: {level: "admin"}
						})
					}))

					this.router.put(`/api/users/self/topics/${UUID}`, endResponse)

					var subscriptions = yield subscriptionsDb.create([
						new ValidSubscription({
							initiative_uuid: UUID,
							confirmed_at: new Date,
							official_interest: false
						}),

						new ValidSubscription({
							initiative_uuid: null,
							confirmed_at: new Date,
							official_interest: false
						}),

						new ValidSubscription({
							initiative_uuid: UUID,
							confirmed_at: new Date
						}),

						new ValidSubscription({
							initiative_uuid: null,
							confirmed_at: new Date
						})
					])

					var res = yield this.request(`/initiatives/${UUID}`, {
						method: "PUT",
						form: {
							_csrf_token: this.csrfToken,
							status: "followUp",
							"contact[name]": "John",
							"contact[email]": "john@example.com",
							"contact[phone]": "42"
						}
					})

					res.statusCode.must.equal(303)

					var messages = yield messagesDb.search(sql`
						SELECT * FROM initiative_messages
					`)

					var emails = subscriptions.slice(2).map((s) => s.email).sort()

					messages.must.eql([{
						id: messages[0].id,
						initiative_uuid: UUID,
						created_at: new Date,
						updated_at: new Date,
						origin: "status",

						title: t("SENT_TO_PARLIAMENT_MESSAGE_TITLE", {
							initiativeTitle: INITIATIVE.title
						}),

						text: renderEmail("SENT_TO_PARLIAMENT_MESSAGE_BODY", {
							authorName: "John",
							initiativeTitle: INITIATIVE.title,
							initiativeUrl: `${Config.url}/initiatives/${UUID}`,
							signatureCount: Config.votesRequired
						}),

						sent_at: new Date,
						sent_to: emails
					}])

					this.emails.length.must.equal(1)
					this.emails[0].envelope.to.must.eql(emails)
					var msg = String(this.emails[0].message)
					msg.match(/^Subject: .*/m)[0].must.include(INITIATIVE.title)

					subscriptions.slice(2).forEach((s) => (
						msg.must.include(s.update_token)
					))
				})
			})

			describe("given local info", function() {
				it("must update attributes", function*() {
					this.router.get(`/api/users/self/topics/${UUID}`,
						respond.bind(null, {data: PRIVATE_DISCUSSION}))

					var res = yield this.request(`/initiatives/${UUID}`, {
						method: "PUT",
						form: {
							_csrf_token: this.csrfToken,
							author_url: "http://example.com/author",
							community_url: "http://example.com/community",
							url: "http://example.com/initiative",

							"organizations[0][name]": "Org A",
							"organizations[0][url]": "http://example.com/org-a",
							"organizations[1][name]": "Org B",
							"organizations[1][url]": "http://example.com/org-b",
							"meetings[0][date]": "2015-06-18",
							"meetings[0][url]": "http://example.com/monday",
							"meetings[1][date]": "2015-06-19",
							"meetings[1][url]": "http://example.com/tuesday",
							"media_urls[0]": "http://example.com/article1",
							"media_urls[1]": "http://example.com/article2",
							"government_change_urls[0]": "http://example.com/gov-change1",
							"government_change_urls[1]": "http://example.com/gov-change2",
							"public_change_urls[0]": "http://example.com/change1",
							"public_change_urls[1]": "http://example.com/change2",
							notes: "Hello, world"
						}
					})

					res.statusCode.must.equal(303)
					res.headers.location.must.equal(`/initiatives/${UUID}`)

					yield initiativesDb.search(sql`
						SELECT * FROM initiatives
					`).must.then.eql([
						new ValidInitiative({
							uuid: UUID,
							author_url: "http://example.com/author",
							community_url: "http://example.com/community",
							url: "http://example.com/initiative",

							organizations: [
								{name: "Org A", url: "http://example.com/org-a"},
								{name: "Org B", url: "http://example.com/org-b"}
							],

							meetings: [
								{date: "2015-06-18", url: "http://example.com/monday"},
								{date: "2015-06-19", url: "http://example.com/tuesday"}
							],

							media_urls: [
								"http://example.com/article1",
								"http://example.com/article2"
							],

							government_change_urls: [
								"http://example.com/gov-change1",
								"http://example.com/gov-change2"
							],

							public_change_urls: [
								"http://example.com/change1",
								"http://example.com/change2"
							],

							notes: "Hello, world"
						})
					])
				})

				it("must not update other initiatives", function*() {
					this.router.get(`/api/users/self/topics/${UUID}`,
						respond.bind(null, {data: PRIVATE_DISCUSSION}))

					var other = yield initiativesDb.create({
						uuid: "a8166697-7f68-43e4-a729-97a7868b4d51"
					})

					var res = yield this.request(`/initiatives/${UUID}`, {
						method: "PUT",
						form: {_csrf_token: this.csrfToken, notes: "Hello, world"}
					})

					res.statusCode.must.equal(303)

					yield initiativesDb.search(sql`
						SELECT * FROM initiatives
					`).must.then.eql([
						other,
						new ValidInitiative({uuid: UUID, notes: "Hello, world"})
					])
				})

				it("must throw 401 when not permitted to edit", function*() {
					this.router.get(`/api/users/self/topics/${UUID}`,
						respond.bind(null, {data: DISCUSSION}))

					var res = yield this.request(`/initiatives/${UUID}`, {
						method: "PUT",
						form: {_csrf_token: this.csrfToken, notes: "Hello, world"}
					})

					res.statusCode.must.equal(401)

					yield initiativesDb.search(sql`
						SELECT * FROM initiatives
					`).must.then.eql([new ValidInitiative({uuid: UUID})])
				})
			})
		})
	})

	describe("DELETE /:id", function() {
		describe("when logged in", function() {
			require("root/test/fixtures").user()

			it("must delete initiative", function*() {
				this.router.get(`/api/users/self/topics/${UUID}`,
					respond.bind(null, {data: EDITABLE_DISCUSSION}))

				this.router.delete(`/api/users/self/topics/${UUID}`, endResponse)

				var res = yield this.request("/initiatives/" + UUID, {
					method: "POST",
					form: {_csrf_token: this.csrfToken, _method: "delete"}
				})

				res.statusCode.must.equal(302)
				res.headers.location.must.equal(`/initiatives`)

				var flash = parseFlashFromCookies(res.headers["set-cookie"])
				flash.notice.must.equal(t("INITIATIVE_DELETED"))
			})

			it("must respond with 405 given initiative in signing", function*() {
				this.router.get(`/api/users/self/topics/${UUID}`, respond.bind(null, {
					data: _.assign({}, INITIATIVE, {permission: {level: "admin"}})
				}))

				var res = yield this.request("/initiatives/" + UUID, {
					method: "POST",
					form: {_csrf_token: this.csrfToken, _method: "delete"}
				})

				res.statusCode.must.equal(405)
			})

			it("must respond with 405 given non-editable discussion", function*() {
				this.router.get(`/api/users/self/topics/${UUID}`, respond.bind(null, {
					data: DISCUSSION
				}))

				var res = yield this.request("/initiatives/" + UUID, {
					method: "POST",
					form: {_csrf_token: this.csrfToken, _method: "delete"}
				})

				res.statusCode.must.equal(405)
			})
		})
	})

	describe("GET /:id/signature", function() {
		require("root/test/time")(Date.UTC(2015, 5, 18))
		
		beforeEach(function*() {
			this.user = yield createUser(newUser({id: USER_ID}))
			this.partner = yield createPartner(newPartner({id: Config.apiPartnerId}))

			this.topic = yield createTopic(newTopic({
				id: UUID,
				creatorId: this.user.id,
				sourcePartnerId: this.partner.id,
				status: "voting"
			}))

			this.vote = yield createVote(this.topic, newVote({id: VOTE_UUID}))
			this.yesAndNo = yield createOptions(this.vote)
		})

		describe("when signing via Mobile-Id", function() {
			it("must redirect to initiative page", function*() {
				this.router.get(`/api/topics/${UUID}`,
					respond.bind(null, {data: INITIATIVE}))

				var self = this
				var signature

				this.router.get(
					`/api/topics/${UUID}/votes/${VOTE_UUID}/status`,
					next(function*(req, res) {
					var query = Url.parse(req.url, true).query
					query.token.must.equal(SIGN_TOKEN)
					respond({status: {code: 20000}, data: {bdocUri: BDOC_URL}}, req, res)

					signature = yield createSignature(newSignature({
						userId: self.user.id,
						voteId: self.vote.id,
						optionId: self.yesAndNo[0]
					}))
				}))

				var res = yield this.request(
					`/initiatives/${UUID}/signature?token=${SIGN_TOKEN}`
				)

				res.statusCode.must.equal(303)
				res.headers.location.must.equal(`/initiatives/${UUID}`)

				var flash = parseFlashFromCookies(res.headers["set-cookie"])
				flash.signatureId.must.equal(signature.id)
			})

			it("must unhide signature", function*() {
				this.router.get(`/api/topics/${UUID}`,
					respond.bind(null, {data: INITIATIVE}))

				var self = this

				this.router.get(
					`/api/topics/${UUID}/votes/${VOTE_UUID}/status`,
					next(function*(req, res) {
					respond({status: {code: 20000}, data: {bdocUri: BDOC_URL}}, req, res)

					yield createSignature(newSignature({
						userId: self.user.id,
						voteId: self.vote.id,
						optionId: self.yesAndNo[0]
					}))
				}))

				var signature = yield signaturesDb.create({
					initiative_uuid: this.topic.id,
					user_uuid: this.user.id,
					hidden: true
				})

				var res = yield this.request(
					`/initiatives/${UUID}/signature?token=${SIGN_TOKEN}`
				)

				res.statusCode.must.equal(303)

				yield signaturesDb.search(sql`
					SELECT * FROM initiative_signatures
				`).must.then.eql([{
					__proto__: signature,
					hidden: false,
					updated_at: new Date
				}])
			})

			it("must not unhide other initiative's signature", function*() {
				this.router.get(`/api/topics/${UUID}`,
					respond.bind(null, {data: INITIATIVE}))

				var self = this

				this.router.get(
					`/api/topics/${UUID}/votes/${VOTE_UUID}/status`,
					next(function*(req, res) {
					respond({status: {code: 20000}, data: {bdocUri: BDOC_URL}}, req, res)

					yield createSignature(newSignature({
						userId: self.user.id,
						voteId: self.vote.id,
						optionId: self.yesAndNo[0]
					}))
				}))

				var signature = yield signaturesDb.create({
					initiative_uuid: this.topic.id,
					user_uuid: "93a13041-c015-431e-b8dd-302e9e4b3d5d",
					hidden: true
				})

				var res = yield this.request(
					`/initiatives/${UUID}/signature?token=${SIGN_TOKEN}`
				)

				res.statusCode.must.equal(303)

				yield signaturesDb.search(sql`
					SELECT * FROM initiative_signatures
				`).must.then.eql([signature])
			})

			it("must not unhide other user's signature", function*() {
				this.router.get(`/api/topics/${UUID}`,
					respond.bind(null, {data: INITIATIVE}))

				var self = this

				this.router.get(
					`/api/topics/${UUID}/votes/${VOTE_UUID}/status`,
					next(function*(req, res) {
					respond({status: {code: 20000}, data: {bdocUri: BDOC_URL}}, req, res)

					yield createSignature(newSignature({
						userId: self.user.id,
						voteId: self.vote.id,
						optionId: self.yesAndNo[0]
					}))
				}))

				var signature = yield signaturesDb.create({
					initiative_uuid: "5a1f604a-fedc-496c-9e21-ef0b9e971861",
					user_uuid: this.user.id,
					hidden: true
				})

				var res = yield this.request(
					`/initiatives/${UUID}/signature?token=${SIGN_TOKEN}`
				)

				res.statusCode.must.equal(303)

				yield signaturesDb.search(sql`
					SELECT * FROM initiative_signatures
				`).must.then.eql([signature])
			})
		})
	})

	describe("POST /:id/signature", function() {
		require("root/test/time")(Date.UTC(2015, 5, 18))

		beforeEach(function*() {
			this.user = yield createUser(newUser({id: USER_ID}))
			this.partner = yield createPartner(newPartner({id: Config.apiPartnerId}))

			this.topic = yield createTopic(newTopic({
				id: UUID,
				creatorId: this.user.id,
				sourcePartnerId: this.partner.id,
				status: "voting"
			}))

			this.vote = yield createVote(this.topic, newVote({id: VOTE_UUID}))
			this.yesAndNo = yield createOptions(this.vote)
		})

		describe("when signing via Id-Card", function() {
			it("must send signature to CitizenOS", function*() {
				this.router.get(`/api/topics/${UUID}`,
					respond.bind(null, {data: INITIATIVE}))

				var self = this
				var created = 0
				var signature

				this.router.post(`/api/topics/${UUID}/votes/${this.vote.id}/sign`,
					next(function*(req, res) {
					++created
					req.body.must.eql({token: AUTH_TOKEN, signatureValue: SIGN_TOKEN})
					respond({data: {bdocUri: BDOC_URL}}, req, res)

					signature = yield createSignature(newSignature({
						userId: self.user.id,
						voteId: self.vote.id,
						optionId: self.yesAndNo[0]
					}))
				}))

				var res = yield this.request(`/initiatives/${UUID}/signature`, {
					method: "POST",
					form: {
						_csrf_token: this.csrfToken,
						method: "id-card",
						token: AUTH_TOKEN,
						signature: SIGN_TOKEN
					}
				})

				created.must.equal(1)
				res.statusCode.must.equal(303)
				res.headers.location.must.equal(`/initiatives/${UUID}`)

				var flash = parseFlashFromCookies(res.headers["set-cookie"])
				flash.signatureId.must.equal(signature.id)
			})

			it("must send signature deletion to CitizenOS", function*() {
				this.router.get(`/api/topics/${UUID}`,
					respond.bind(null, {data: INITIATIVE}))

				yield createSignature(newSignature({
					userId: this.user.id,
					voteId: this.vote.id,
					optionId: this.yesAndNo[0],
					createdAt: DateFns.addMinutes(new Date, -1)
				}))

				var self = this
				var signature

				this.router.post(`/api/topics/${UUID}/votes/${this.vote.id}/sign`,
					next(function*(req, res) {
					req.body.must.eql({token: AUTH_TOKEN, signatureValue: SIGN_TOKEN})
					respond({data: {bdocUri: BDOC_URL}}, req, res)

					signature = yield createSignature(newSignature({
						userId: self.user.id,
						voteId: self.vote.id,
						optionId: self.yesAndNo[1]
					}))
				}))

				var res = yield this.request(`/initiatives/${UUID}/signature`, {
					method: "POST",
					form: {
						_csrf_token: this.csrfToken,
						method: "id-card",
						token: AUTH_TOKEN,
						signature: SIGN_TOKEN
					}
				})

				res.statusCode.must.equal(303)
				res.headers.location.must.equal(`/initiatives/${UUID}`)

				var flash = parseFlashFromCookies(res.headers["set-cookie"])
				flash.signatureId.must.equal(signature.id)
			})

			it("must unhide signature", function*() {
				this.router.get(`/api/topics/${UUID}`,
					respond.bind(null, {data: INITIATIVE}))

				var self = this

				this.router.post(`/api/topics/${UUID}/votes/${VOTE_UUID}/sign`,
					next(function*(req, res) {
					respond({data: {bdocUri: BDOC_URL}}, req, res)

					yield createSignature(newSignature({
						userId: self.user.id,
						voteId: self.vote.id,
						optionId: self.yesAndNo[0]
					}))
				}))

				var signature = yield signaturesDb.create({
					initiative_uuid: this.topic.id,
					user_uuid: this.user.id,
					hidden: true
				})

				var res = yield this.request(`/initiatives/${UUID}/signature`, {
					method: "POST",
					form: {
						_csrf_token: this.csrfToken,
						method: "id-card",
						token: AUTH_TOKEN,
						signature: SIGN_TOKEN
					}
				})

				res.statusCode.must.equal(303)

				yield signaturesDb.search(sql`
					SELECT * FROM initiative_signatures
				`).must.then.eql([{
					__proto__: signature,
					hidden: false,
					updated_at: new Date
				}])
			})

			it("must not unhide other initiative's signature", function*() {
				this.router.get(`/api/topics/${UUID}`,
					respond.bind(null, {data: INITIATIVE}))

				var self = this

				this.router.post(`/api/topics/${UUID}/votes/${VOTE_UUID}/sign`,
					next(function*(req, res) {
					respond({data: {bdocUri: BDOC_URL}}, req, res)

					yield createSignature(newSignature({
						userId: self.user.id,
						voteId: self.vote.id,
						optionId: self.yesAndNo[0]
					}))
				}))

				var signature = yield signaturesDb.create({
					initiative_uuid: "5a1f604a-fedc-496c-9e21-ef0b9e971861",
					user_uuid: this.user.id,
					hidden: true
				})

				var res = yield this.request(`/initiatives/${UUID}/signature`, {
					method: "POST",
					form: {
						_csrf_token: this.csrfToken,
						method: "id-card",
						token: AUTH_TOKEN,
						signature: SIGN_TOKEN
					}
				})

				res.statusCode.must.equal(303)

				yield signaturesDb.search(sql`
					SELECT * FROM initiative_signatures
				`).must.then.eql([signature])
			})

			it("must not unhide other user's signature", function*() {
				this.router.get(`/api/topics/${UUID}`,
					respond.bind(null, {data: INITIATIVE}))

				var self = this

				this.router.post(`/api/topics/${UUID}/votes/${VOTE_UUID}/sign`,
					next(function*(req, res) {
					respond({data: {bdocUri: BDOC_URL}}, req, res)

					yield createSignature(newSignature({
						userId: self.user.id,
						voteId: self.vote.id,
						optionId: self.yesAndNo[0]
					}))
				}))

				var signature = yield signaturesDb.create({
					initiative_uuid: this.topic.id,
					user_uuid: "93a13041-c015-431e-b8dd-302e9e4b3d5d",
					hidden: true
				})

				var res = yield this.request(`/initiatives/${UUID}/signature`, {
					method: "POST",
					form: {
						_csrf_token: this.csrfToken,
						method: "id-card",
						token: AUTH_TOKEN,
						signature: SIGN_TOKEN
					}
				})

				res.statusCode.must.equal(303)

				yield signaturesDb.search(sql`
					SELECT * FROM initiative_signatures
				`).must.then.eql([signature])
			})
		})

		describe("when signing via Mobile-Id", function() {
			it("must send mobile-id signature to CitizenOS", function*() {
				this.router.get(`/api/topics/${UUID}`,
					respond.bind(null, {data: INITIATIVE}))

				var created = 0
				this.router.post(`/api/topics/${UUID}/votes/${VOTE_UUID}`,
					function(req, res) {
					++created
					req.body.must.eql({
						options: [{optionId: "0bf34d36-59cd-438f-afd1-9a3a779b78b0"}],
						pid: "11412090004",
						phoneNumber: "+37200000766",
					})

					respond({data: {challengeID: "1337", token: "abcdef"}}, req, res)
				})

				var res = yield this.request(`/initiatives/${UUID}/signature`, {
					method: "POST",
					form: {
						_csrf_token: this.csrfToken,
						method: "mobile-id",
						optionId: "0bf34d36-59cd-438f-afd1-9a3a779b78b0",
						pid: "11412090004",
						phoneNumber: "+37200000766"
					}
				})

				created.must.equal(1)
				res.statusCode.must.equal(200)
			})

			O.each({
				"00000766": "+37200000766",
				"37000000766": "37000000766",
				"37200000766": "37200000766",
				"37100000766": "37100000766",
				"+37000000766": "+37000000766",
				"+37200000766": "+37200000766"
			}, function(long, short) {
				it(`must transform mobile-id number ${short} to ${long}`, function*() {
					this.router.get(`/api/topics/${UUID}`,
						respond.bind(null, {data: INITIATIVE}))

					var created = 0
					this.router.post(`/api/topics/${UUID}/votes/${VOTE_UUID}`,
						function(req, res) {
						++created
						req.body.must.eql({
							options: [{optionId: "0bf34d36-59cd-438f-afd1-9a3a779b78b0"}],
							pid: "11412090004",
							phoneNumber: long,
						})

						respond({data: {challengeID: "1337", token: "abcdef"}}, req, res)
					})

					var res = yield this.request(`/initiatives/${UUID}/signature`, {
						method: "POST",
						form: {
							_csrf_token: this.csrfToken,
							method: "mobile-id",
							optionId: "0bf34d36-59cd-438f-afd1-9a3a779b78b0",
							pid: "11412090004",
							phoneNumber: short
						}
					})

					created.must.equal(1)
					res.statusCode.must.equal(200)
				})
			})
		})
	})

	describe("PUT /:id/signature", function() {
		describe("when not logged in", function() {
			it("must respond with 401 if not logged in", function*() {
				this.router.get(`/api/topics/${UUID}`,
					respond.bind(null, {data: INITIATIVE}))

				var res = yield this.request(`/initiatives/${UUID}/signature`, {
					method: "PUT",
					form: {_csrf_token: this.csrfToken, hidden: true}
				})

				res.statusCode.must.equal(401)
			})
		})

		describe("when logged in", function() {
			require("root/test/fixtures").user()
			require("root/test/time")(Date.UTC(2015, 5, 18))

			it("must respond with 303 if hiding a non-existent signature",
				function*() {
				this.router.get(`/api/users/self/topics/${UUID}`,
					respond.bind(null, {data: INITIATIVE}))

				var res = yield this.request(`/initiatives/${UUID}/signature`, {
					method: "PUT",
					form: {_csrf_token: this.csrfToken, hidden: true}
				})

				yield signaturesDb.search(sql`
					SELECT * FROM initiative_signatures
				`).must.then.be.empty()

				res.statusCode.must.equal(303)
				res.headers.location.must.equal(`/initiatives/${UUID}`)
			})

			it("must hide signature", function*() {
				this.router.get(`/api/users/self/topics/${UUID}`,
					respond.bind(null, {data: SIGNED_INITIATIVE}))

				var user = this.user

				var res = yield this.request(`/initiatives/${UUID}/signature`, {
					method: "PUT",
					form: {_csrf_token: this.csrfToken, hidden: true}
				})

				yield signaturesDb.search(sql`
					SELECT * FROM initiative_signatures
				`).must.then.eql([{
					initiative_uuid: UUID,
					user_uuid: user.id,
					hidden: true,
					updated_at: new Date
				}])

				res.statusCode.must.equal(303)
				res.headers.location.must.equal(`/initiatives/${UUID}`)
			})

			it("must hide signature that was previously made visible", function*() {
				this.router.get(`/api/users/self/topics/${UUID}`,
					respond.bind(null, {data: SIGNED_INITIATIVE}))

				var user = this.user

				var signature = yield signaturesDb.create({
					initiative_uuid: UUID,
					user_uuid: user.id,
					hidden: false
				})

				var res = yield this.request(`/initiatives/${UUID}/signature`, {
					method: "PUT",
					form: {_csrf_token: this.csrfToken, hidden: true}
				})

				yield signaturesDb.search(sql`
					SELECT * FROM initiative_signatures
				`).must.then.eql([{
					__proto__: signature,
					hidden: true,
					updated_at: new Date
				}])

				res.statusCode.must.equal(303)
				res.headers.location.must.equal(`/initiatives/${UUID}`)
			})

			it("must hide an already hidden signature", function*() {
				this.router.get(`/api/users/self/topics/${UUID}`,
					respond.bind(null, {data: SIGNED_INITIATIVE}))

				var user = this.user

				yield signaturesDb.create({
					initiative_uuid: UUID,
					user_uuid: user.id,
					hidden: true
				})

				var res = yield this.request(`/initiatives/${UUID}/signature`, {
					method: "PUT",
					form: {_csrf_token: this.csrfToken, hidden: true}
				})

				res.statusCode.must.equal(303)
				res.headers.location.must.equal(`/initiatives/${UUID}`)

				var signature = yield signaturesDb.read(sql`
					SELECT * FROM initiative_signatures
					WHERE (initiative_uuid, user_uuid) = (${INITIATIVE.id}, ${user.id})
				`)

				signature.hidden.must.be.true()
			})
		})
	})
})

function fakeJwt(obj) {
	var header = encodeBase64(JSON.stringify({typ: "JWT", alg: "RS256"}))
	var body = encodeBase64(JSON.stringify(obj))
	return header + "." + body + ".fakesignature"
}

function parseFlashFromCookies(cookies) {
	return parseFlash(parseCookies(cookies).flash.value)
}

function queryPhases(html) {
	var phases = html.querySelectorAll("#initiative-phases li")
	var phasesById = _.indexBy(phases, (phase) => phase.id.match(/^\w+/)[0])

	return _.mapValues(phasesById, (phase) => ({
		current: phase.classList.contains("current"),
		past: phase.classList.contains("past"),
		text: (phase.querySelector(".progress") || Object).textContent
	}))
}

function endResponse(_req, res) { res.end() }
