var _ = require("root/lib/underscore")
var O = require("oolong")
var Url = require("url")
var Atom = require("root/lib/atom")
var DateFns = require("date-fns")
var Config = require("root/config")
var Initiative = require("root/lib/initiative")
var ValidInitiative = require("root/test/valid_db_initiative")
var ValidSubscription = require("root/test/valid_subscription")
var ValidComment = require("root/test/valid_comment")
var ValidEvent = require("root/test/valid_db_initiative_event")
var Http = require("root/lib/http")
var I18n = require("root/lib/i18n")
var formatIsoDate = require("root/lib/i18n").formatDate.bind(null, "iso")
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
var newPermission = require("root/test/citizenos_fixtures").newPermission
var createPartner = require("root/test/citizenos_fixtures").createPartner
var createUser = require("root/test/citizenos_fixtures").createUser
var createTopic = require("root/test/citizenos_fixtures").createTopic
var createVote = require("root/test/citizenos_fixtures").createVote
var createSignature = require("root/test/citizenos_fixtures").createSignature
var createSignatures = require("root/test/citizenos_fixtures").createSignatures
var createOptions = require("root/test/citizenos_fixtures").createOptions
var createPermission = require("root/test/citizenos_fixtures").createPermission
var encodeBase64 = require("root/lib/crypto").encodeBase64
var pseudoDateTime = require("root/lib/crypto").pseudoDateTime
var parseCookies = Http.parseCookies
var parseFlash = Http.parseFlash.bind(null, Config.cookieSecret)
var serializeFlash = Http.serializeFlash.bind(null, Config.cookieSecret)
var readVoteOptions = require("root/lib/citizenos_db").readVoteOptions
var initiativesDb = require("root/db/initiatives_db")
var subscriptionsDb = require("root/db/initiative_subscriptions_db")
var imagesDb = require("root/db/initiative_images_db")
var eventsDb = require("root/db/initiative_events_db")
var messagesDb = require("root/db/initiative_messages_db")
var signaturesDb = require("root/db/initiative_signatures_db")
var commentsDb = require("root/db/comments_db")
var encodeMime = require("nodemailer/lib/mime-funcs").encodeWord
var parseDom = require("root/lib/dom").parse
var next = require("co-next")
var outdent = require("root/lib/outdent")
var INITIATIVE_TYPE = "application/vnd.rahvaalgatus.initiative+json; v=1"
var ATOM_TYPE = "application/atom+xml"
var AUTH_TOKEN = "deadbeef"
var SIGN_TOKEN = "feedfed"
var NEW_SIG_TRESHOLD = 15
var EVENTABLE_PHASES = _.without(Initiative.PHASES, "edit")
var PARLIAMENT_DECISIONS = Initiative.PARLIAMENT_DECISIONS
var COMMITTEE_MEETING_DECISIONS = Initiative.COMMITTEE_MEETING_DECISIONS
var PNG = new Buffer("89504e470d0a1a0a1337", "hex")
var PNG_PREVIEW = new Buffer("89504e470d0a1a0a4269", "hex")

describe("InitiativesController", function() {
	require("root/test/web")()
	require("root/test/mitm")()
	require("root/test/db")()
	require("root/test/email")()
	require("root/test/fixtures").csrf()
	beforeEach(require("root/test/mitm").router)

	describe("GET /", function() {
		beforeEach(function*() {
			this.partner = yield createPartner(newPartner({id: Config.apiPartnerId}))
		})

		it("must show initiatives in edit phase", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				phase: "edit",
				created_at: pseudoDateTime()
			}))

			yield createTopic(newTopic({
				id: initiative.uuid,
				creatorId: (yield createUser(newUser())).id,
				sourcePartnerId: this.partner.id,
				visibility: "public",
				endsAt: DateFns.addSeconds(new Date, 1)
			}))

			var res = yield this.request("/initiatives")
			res.statusCode.must.equal(200)
			res.body.must.include(initiative.uuid)

			var dom = parseDom(res.body)
			dom.querySelector(".initiative time").textContent.must.equal(
				I18n.formatDate("numeric", initiative.created_at)
			)
		})

		it("must show initiatives in edit phase that have ended", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				phase: "edit"
			}))

			yield createTopic(newTopic({
				id: initiative.uuid,
				creatorId: (yield createUser(newUser())).id,
				sourcePartnerId: this.partner.id,
				visibility: "public",
				endsAt: new Date
			}))

			var res = yield this.request("/initiatives")
			res.statusCode.must.equal(200)
			res.body.must.include(initiative.uuid)
		})

		it("must show archived initiatives in edit phase", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				phase: "edit",
				archived_at: new Date
			}))

			yield createTopic(newTopic({
				id: initiative.uuid,
				creatorId: (yield createUser(newUser())).id,
				sourcePartnerId: this.partner.id,
				visibility: "public",
				endsAt: DateFns.addSeconds(new Date, 1)
			}))

			var res = yield this.request("/initiatives")
			res.statusCode.must.equal(200)
			res.body.must.include(initiative.uuid)
		})

		it("must show initiatives in sign phase", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				phase: "sign"
			}))

			var topic = yield createTopic(newTopic({
				id: initiative.uuid,
				creatorId: (yield createUser(newUser())).id,
				sourcePartnerId: this.partner.id,
				status: "voting"
			}))

			var vote = yield createVote(topic, newVote({createdAt: pseudoDateTime()}))
			yield createSignatures(vote, Config.votesRequired / 2)

			var res = yield this.request("/initiatives")
			res.statusCode.must.equal(200)
			res.body.must.include(initiative.uuid)

			var dom = parseDom(res.body)
			dom.querySelector(".initiative time").textContent.must.equal(
				I18n.formatDate("numeric", vote.createdAt)
			)
		})

		it("must show initiatives in sign phase that failed", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				phase: "sign"
			}))

			var topic = yield createTopic(newTopic({
				id: initiative.uuid,
				creatorId: (yield createUser(newUser())).id,
				sourcePartnerId: this.partner.id,
				status: "voting"
			}))

			yield createVote(topic, newVote({endsAt: new Date}))

			var res = yield this.request("/initiatives")
			res.statusCode.must.equal(200)
			res.body.must.include(initiative.uuid)
		})

		it("must show initiatives in sign phase that succeeded", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				phase: "sign"
			}))

			var topic = yield createTopic(newTopic({
				id: initiative.uuid,
				creatorId: (yield createUser(newUser())).id,
				sourcePartnerId: this.partner.id,
				status: "voting"
			}))

			var vote = yield createVote(topic, newVote({endsAt: new Date}))
			yield createSignatures(vote, Config.votesRequired)

			var res = yield this.request("/initiatives")
			res.statusCode.must.equal(200)
			res.body.must.include(initiative.uuid)
		})

		it("must show initiatives in parliament", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				phase: "parliament",
				sent_to_parliament_at: pseudoDateTime()
			}))

			var topic = yield createTopic(newTopic({
				id: initiative.uuid,
				creatorId: (yield createUser(newUser())).id,
				sourcePartnerId: this.partner.id,
				status: "followUp"
			}))

			yield createVote(topic, newVote())

			var res = yield this.request("/initiatives")
			res.statusCode.must.equal(200)
			res.body.must.include(initiative.uuid)

			var dom = parseDom(res.body)
			dom.querySelector(".initiative time").textContent.must.equal(
				I18n.formatDate("numeric", initiative.sent_to_parliament_at)
			)
		})

		it("must show initiatives in parliament received by parliament",
			function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				phase: "parliament",
				sent_to_parliament_at: pseudoDateTime(),
				received_by_parliament_at: pseudoDateTime()
			}))

			var topic = yield createTopic(newTopic({
				id: initiative.uuid,
				creatorId: (yield createUser(newUser())).id,
				sourcePartnerId: this.partner.id,
				status: "followUp"
			}))

			yield createVote(topic, newVote())

			var res = yield this.request("/initiatives")
			res.statusCode.must.equal(200)
			res.body.must.include(initiative.uuid)

			var dom = parseDom(res.body)
			dom.querySelector(".initiative time").textContent.must.equal(
				I18n.formatDate("numeric", initiative.received_by_parliament_at)
			)
		})

		it("must show external initiatives in parliament", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				phase: "parliament",
				received_by_parliament_at: pseudoDateTime(),
				external: true
			}))

			var res = yield this.request("/initiatives")
			res.statusCode.must.equal(200)
			res.body.must.include(initiative.uuid)

			var dom = parseDom(res.body)
			dom.querySelector(".initiative time").textContent.must.equal(
				I18n.formatDate("numeric", initiative.received_by_parliament_at)
			)
		})

		it("must show initiatives in government", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				phase: "government",
				sent_to_government_at: pseudoDateTime()
			}))

			var topic = yield createTopic(newTopic({
				id: initiative.uuid,
				creatorId: (yield createUser(newUser())).id,
				sourcePartnerId: this.partner.id,
				status: "followUp"
			}))

			yield createVote(topic, newVote())

			var res = yield this.request("/initiatives")
			res.statusCode.must.equal(200)
			res.body.must.include(initiative.uuid)

			var dom = parseDom(res.body)
			dom.querySelector(".initiative time").textContent.must.equal(
				I18n.formatDate("numeric", initiative.sent_to_government_at)
			)
		})

		it("must show external initiatives in government", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				phase: "government",
				external: true
			}))

			var res = yield this.request("/initiatives")
			res.statusCode.must.equal(200)
			res.body.must.include(initiative.uuid)
		})

		it("must show initiatives in done phase", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				phase: "done",
				finished_in_parliament_at: pseudoDateTime(),
				finished_in_government_at: pseudoDateTime()
			}))

			var topic = yield createTopic(newTopic({
				id: initiative.uuid,
				creatorId: (yield createUser(newUser())).id,
				sourcePartnerId: this.partner.id,
				status: "followUp"
			}))

			yield createVote(topic, newVote())

			var res = yield this.request("/initiatives")
			res.statusCode.must.equal(200)
			res.body.must.include(initiative.uuid)

			var dom = parseDom(res.body)
			dom.querySelector(".initiative time").textContent.must.equal(
				I18n.formatDate("numeric", initiative.finished_in_government_at)
			)
		})

		it("must show initiatives in done phase that never went to government",
			function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				phase: "done",
				finished_in_parliament_at: pseudoDateTime()
			}))

			var topic = yield createTopic(newTopic({
				id: initiative.uuid,
				creatorId: (yield createUser(newUser())).id,
				sourcePartnerId: this.partner.id,
				status: "followUp"
			}))

			yield createVote(topic, newVote())

			var res = yield this.request("/initiatives")
			res.statusCode.must.equal(200)
			res.body.must.include(initiative.uuid)

			var dom = parseDom(res.body)
			dom.querySelector(".initiative time").textContent.must.equal(
				I18n.formatDate("numeric", initiative.finished_in_parliament_at)
			)
		})

		it("must show external initiatives in done phase", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				phase: "done",
				external: true
			}))

			var res = yield this.request("/initiatives")
			res.statusCode.must.equal(200)
			res.body.must.include(initiative.uuid)
		})

		it("must show archived external initiatives in done phase", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				phase: "done",
				external: true,
				archived_at: new Date
			}))

			var res = yield this.request("/initiatives")
			res.statusCode.must.equal(200)
			res.body.must.include(initiative.uuid)
		})

		_.each(Config.partners, function(partner, id) {
			if (id == Config.apiPartnerId) return

			describe("given " + partner.name, function() {
				it("must show initiatives", function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative)
					var partner = yield createPartner(newPartner({id: id}))

					yield createTopic(newTopic({
						id: initiative.uuid,
						creatorId: (yield createUser(newUser())).id,
						sourcePartnerId: partner.id,
						visibility: "public"
					}))

					var res = yield this.request("/initiatives")
					res.statusCode.must.equal(200)
					res.body.must.include(initiative.uuid)
				})

				it("must not show archived initiatives in edit phase", function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative({
						archived_at: new Date
					}))

					var partner = yield createPartner(newPartner({id: id}))

					yield createTopic(newTopic({
						id: initiative.uuid,
						creatorId: (yield createUser(newUser())).id,
						sourcePartnerId: partner.id,
						visibility: "public"
					}))

					var res = yield this.request("/initiatives")
					res.statusCode.must.equal(200)
					res.body.must.not.include(initiative.uuid)
				})

				it("must show archived initiatives in sign phase", function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative({
						phase: "sign",
						archived_at: new Date
					}))

					var partner = yield createPartner(newPartner({id: id}))

					var topic = yield createTopic(newTopic({
						id: initiative.uuid,
						creatorId: (yield createUser(newUser())).id,
						sourcePartnerId: partner.id,
						visibility: "public"
					}))

					yield createVote(topic, newVote())

					var res = yield this.request("/initiatives")
					res.statusCode.must.equal(200)
					res.body.must.include(initiative.uuid)
				})
			})
		})

		it("must not show initiatives from other partners", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative)
			var partner = yield createPartner(newPartner())

			var topic = yield createTopic(newTopic({
				id: initiative.uuid,
				creatorId: (yield createUser(newUser())).id,
				sourcePartnerId: partner.id,
				visibility: "public"
			}))

			var res = yield this.request("/initiatives")
			res.statusCode.must.equal(200)
			res.body.must.not.include(topic.id)
		})

		it("must not show private initiatives", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative)

			var topic = yield createTopic(newTopic({
				id: initiative.uuid,
				creatorId: (yield createUser(newUser())).id,
				sourcePartnerId: this.partner.id,
				visibility: "private"
			}))

			var res = yield this.request("/initiatives")
			res.statusCode.must.equal(200)
			res.body.must.not.include(topic.id)
		})

		it("must not show deleted initiatives", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative)

			var topic = yield createTopic(newTopic({
				id: initiative.uuid,
				creatorId: (yield createUser(newUser())).id,
				sourcePartnerId: this.partner.id,
				visibility: "public",
				deletedAt: new Date
			}))

			var res = yield this.request("/initiatives")
			res.statusCode.must.equal(200)
			res.body.must.not.include(topic.id)
		})

		it("must show initiatives by category if given", function*() {
			var initiativeA = yield initiativesDb.create(new ValidInitiative)
			var initiativeB = yield initiativesDb.create(new ValidInitiative)

			yield createTopic(newTopic({
				id: initiativeA.uuid,
				creatorId: (yield createUser(newUser())).id,
				sourcePartnerId: this.partner.id,
				visibility: "public",
				categories: ["uuseakus"]
			}))

			yield createTopic(newTopic({
				id: initiativeB.uuid,
				creatorId: (yield createUser(newUser())).id,
				sourcePartnerId: this.partner.id,
				visibility: "public"
			}))

			var res = yield this.request("/initiatives?category=uuseakus")
			res.statusCode.must.equal(200)
			res.body.must.include(initiativeA.uuid)
			res.body.must.not.include(initiativeB.uuid)
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
			require("root/test/time")()

			it("must create initiative", function*() {
				var created = 0
				var uuid = "5f9a82a5-e815-440b-abe9-d17311b0b366"
				this.router.post("/api/users/self/topics", function(req, res) {
					++created
					req.headers.authorization.must.exist()

					req.body.visibility.must.equal("private")

					req.body.description.must.equal(t("INITIATIVE_DEFAULT_HTML", {
						title: "Hello!"
					}))

					respond({data: {id: uuid}}, req, res)
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
				res.headers.location.must.equal("/initiatives/" + uuid + "/edit")
				created.must.equal(1)

				yield initiativesDb.search(sql`
					SELECT * FROM initiatives
				`).must.then.eql([new ValidInitiative({uuid: uuid})])
			})

			it("must escape title", function*() {
				var uuid = "5f9a82a5-e815-440b-abe9-d17311b0b366"

				this.router.post("/api/users/self/topics", function(req, res) {
					req.headers.authorization.must.exist(0)

					req.body.description.must.equal(t("INITIATIVE_DEFAULT_HTML", {
						title: "Hello &lt;mike&gt;!"
					}))

					respond({data: {id: uuid}}, req, res)
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
		beforeEach(function*() {
			this.partner = yield createPartner(newPartner({id: Config.apiPartnerId}))
		})

		describe("when not logged in", function() {
			it("must respond with 403 for a private initiative", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative)

				yield createTopic(newTopic({
					id: initiative.uuid,
					creatorId: (yield createUser(newUser())).id,
					sourcePartnerId: this.partner.id,
					visibility: "private"
				}))

				var res = yield this.request("/initiatives/" + initiative.uuid)
				res.statusCode.must.equal(403)
				res.statusMessage.must.match(/public/i)
			})

			it("must respond with 404 for a deleted initiative", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative)

				yield createTopic(newTopic({
					id: initiative.uuid,
					creatorId: (yield createUser(newUser())).id,
					sourcePartnerId: this.partner.id,
					visibility: "public",
					deletedAt: new Date
				}))

				var res = yield this.request("/initiatives/" + initiative.uuid)
				res.statusCode.must.equal(404)
			})

			it("must include Open Graph tags", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative)

				var topic = yield createTopic(newTopic({
					id: initiative.uuid,
					creatorId: (yield createUser(newUser())).id,
					sourcePartnerId: this.partner.id,
					visibility: "public"
				}))

				yield imagesDb.create({
					initiative_uuid: initiative.uuid,
					data: PNG,
					type: "image/png",
					preview: PNG_PREVIEW
				})

				var res = yield this.request("/initiatives/" + initiative.uuid)
				res.statusCode.must.equal(200)

				var dom = parseDom(res.body)
				var metas = dom.head.querySelectorAll("meta")
				var props = _.indexBy(metas, (el) => el.getAttribute("property"))

				var url = `${Config.url}/initiatives/${initiative.uuid}`
				props["og:title"].content.must.equal(topic.title)
				props["og:url"].content.must.equal(url)
				props["og:image"].content.must.equal(url + ".png")
			})

			it("must show done phase by default", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative)

				yield createTopic(newTopic({
					id: initiative.uuid,
					creatorId: (yield createUser(newUser())).id,
					sourcePartnerId: this.partner.id,
					visibility: "public",
					endsAt: DateFns.addDays(new Date, 5)
				}))

				var res = yield this.request("/initiatives/" + initiative.uuid)
				res.statusCode.must.equal(200)

				var dom = parseDom(res.body)
				var phases = queryPhases(dom)
				phases.must.have.property("done")
				phases.must.not.have.property("archived")
			})

			it("must render initiative in edit phase", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative)

				yield createTopic(newTopic({
					id: initiative.uuid,
					creatorId: (yield createUser(newUser())).id,
					sourcePartnerId: this.partner.id,
					visibility: "public",
					endsAt: DateFns.addDays(new Date, 5)
				}))

				var res = yield this.request("/initiatives/" + initiative.uuid)
				res.statusCode.must.equal(200)

				res.body.must.include(tHtml("INITIATIVE_IN_DISCUSSION"))
				res.body.must.include(t("DISCUSSION_DEADLINE"))

				var dom = parseDom(res.body)
				var phases = queryPhases(dom)

				_.sum(_.map(phases, "past")).must.equal(0)
				_.sum(_.map(phases, "current")).must.equal(1)
				phases.edit.current.must.be.true()
				phases.must.not.have.property("government")

				phases.edit.text.must.equal(
					t("TXT_DEADLINE_CALENDAR_DAYS_LEFT", {numberOfDaysLeft: 6})
				)
			})

			it("must render archived initiative in edit phase", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					phase: "edit",
					archived_at: new Date
				}))

				yield createTopic(newTopic({
					id: initiative.uuid,
					creatorId: (yield createUser(newUser())).id,
					sourcePartnerId: this.partner.id,
					visibility: "public"
				}))

				var res = yield this.request("/initiatives/" + initiative.uuid)
				res.statusCode.must.equal(200)
				res.body.must.not.include(tHtml("INITIATIVE_IN_DISCUSSION"))
			})

			// This was a bug on Dec 13, 2018 where the code checking to display vote
			// results assumed a closed initiative had been voted on.
			//
			// This test should soon be unnecessary as the topic's status will be
			// entirely ignored.
			it("must render archived initiative in edit phase whose topic is closed",
				function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					phase: "edit",
					archived_at: new Date
				}))

				yield createTopic(newTopic({
					id: initiative.uuid,
					creatorId: (yield createUser(newUser())).id,
					sourcePartnerId: this.partner.id,
					status: "closed"
				}))

				var res = yield this.request("/initiatives/" + initiative.uuid)
				res.statusCode.must.equal(200)
				res.body.must.not.include(tHtml("INITIATIVE_IN_DISCUSSION"))
			})

			it("must render initiative in edit phase that have ended", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative)

				yield createTopic(newTopic({
					id: initiative.uuid,
					creatorId: (yield createUser(newUser())).id,
					sourcePartnerId: this.partner.id,
					visibility: "public",
					endsAt: new Date
				}))

				var res = yield this.request("/initiatives/" + initiative.uuid)
				res.statusCode.must.equal(200)

				var dom = parseDom(res.body)
				var phases = queryPhases(dom)
				phases.edit.current.must.be.true()
				phases.edit.text.must.equal(t("DISCUSSION_FINISHED"))
			})

			it("must render initiative in sign phase", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					phase: "sign"
				}))

				var topic = yield createTopic(newTopic({
					id: initiative.uuid,
					creatorId: (yield createUser(newUser())).id,
					sourcePartnerId: this.partner.id,
					createdAt: DateFns.addDays(new Date, -3),
					status: "voting"
				}))

				var vote = yield createVote(topic, newVote({
					createdAt: DateFns.addDays(new Date, -1),
					endsAt: DateFns.addDays(new Date, 1)
				}))

				yield createSignatures(vote, Config.votesRequired / 2)

				var res = yield this.request("/initiatives/" + initiative.uuid)
				res.statusCode.must.equal(200)
				res.body.must.not.include(tHtml("INITIATIVE_IN_DISCUSSION"))
				res.body.must.not.include(tHtml("VOTING_SUCCEEDED"))
				res.body.must.not.include(tHtml("VOTING_FAILED"))

				var options = yield readVoteOptions(vote.id)
				res.body.must.include(options.Yes)
				res.body.must.not.include(options.No)

				var dom = parseDom(res.body)
				var phases = queryPhases(dom)

				_.sum(_.map(phases, "past")).must.equal(1)
				_.sum(_.map(phases, "current")).must.equal(1)
				phases.edit.past.must.be.true()
				phases.sign.current.must.be.true()
				phases.must.not.have.property("government")

				phases.edit.text.must.equal(I18n.formatDateSpan(
					"numeric",
					topic.createdAt,
					vote.createdAt
				))

				phases.sign.text.must.equal(t("N_SIGNATURES", {
					votes: Config.votesRequired / 2
				}))
			})

			it("must render initiative in sign phase with signature milestones",
				function*() {
				var milestones = [1, Config.votesRequired / 2, Config.votesRequired]

				var initiative = yield initiativesDb.create(new ValidInitiative({
					phase: "sign",
					signature_milestones: {
						[milestones[0]]: DateFns.addDays(new Date, -5),
						[milestones[1]]: DateFns.addDays(new Date, -3),
						[milestones[2]]: DateFns.addDays(new Date, -1)
					}
				}))

				var topic = yield createTopic(newTopic({
					id: initiative.uuid,
					creatorId: (yield createUser(newUser())).id,
					sourcePartnerId: this.partner.id,
					status: "voting"
				}))

				var vote = yield createVote(topic, newVote())
				yield createSignatures(vote, Config.votesRequired)

				var res = yield this.request("/initiatives/" + initiative.uuid)
				res.statusCode.must.equal(200)

				var events = queryEvents(parseDom(res.body))
				events.length.must.equal(3)

				milestones.forEach(function(count, i) {
					events[i].id.must.equal(`milestone-${count}`)
					events[i].phase.must.equal("sign")
					events[i].at.must.eql(initiative.signature_milestones[count])
					events[i].title.must.equal(
						t("SIGNATURE_MILESTONE_EVENT_TITLE", {milestone: count})
					)
				})
			})

			it("must render initiative in sign phase that failed", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					phase: "sign"
				}))

				var topic = yield createTopic(newTopic({
					id: initiative.uuid,
					creatorId: (yield createUser(newUser())).id,
					sourcePartnerId: this.partner.id,
					status: "voting"
				}))

				var vote = yield createVote(topic, newVote({endsAt: new Date}))
				var signatureCount = Config.votesRequired - 1
				yield createSignatures(vote, signatureCount)

				var res = yield this.request("/initiatives/" + initiative.uuid)
				res.statusCode.must.equal(200)
				res.body.must.include(tHtml("VOTING_FAILED"))
				res.body.must.include(t("N_SIGNATURES_FAILED", {votes: signatureCount}))

				var dom = parseDom(res.body)
				var phases = queryPhases(dom)

				_.sum(_.map(phases, "past")).must.equal(1)
				_.sum(_.map(phases, "current")).must.equal(1)
				phases.edit.past.must.be.true()
				phases.sign.current.must.be.true()
				phases.sign.text.must.equal(t("N_SIGNATURES", {votes: signatureCount}))
			})

			it("must render archived initiative in sign phase that failed",
				function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					phase: "sign",
					archived_at: new Date
				}))

				var topic = yield createTopic(newTopic({
					id: initiative.uuid,
					creatorId: (yield createUser(newUser())).id,
					sourcePartnerId: this.partner.id,
					status: "voting"
				}))

				var vote = yield createVote(topic, newVote({endsAt: new Date}))
				var signatureCount = Config.votesRequired - 1
				yield createSignatures(vote, signatureCount)

				var res = yield this.request("/initiatives/" + initiative.uuid)
				res.statusCode.must.equal(200)
				res.body.must.include(tHtml("VOTING_FAILED"))
				res.body.must.include(t("N_SIGNATURES_FAILED", {votes: signatureCount}))

				var dom = parseDom(res.body)
				var phases = queryPhases(dom)

				_.sum(_.map(phases, "past")).must.equal(1)
				_.sum(_.map(phases, "current")).must.equal(1)
				phases.edit.past.must.be.true()
				phases.sign.current.must.be.true()
				phases.sign.text.must.equal(t("N_SIGNATURES", {votes: signatureCount}))
			})

			// This test should soon be unnecessary as the topic's status will be
			// entirely ignored.
			it("must render archived initiative in sign phase that failed whose topic is closed", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					phase: "sign",
					archived_at: new Date
				}))

				var topic = yield createTopic(newTopic({
					id: initiative.uuid,
					creatorId: (yield createUser(newUser())).id,
					sourcePartnerId: this.partner.id,
					status: "closed"
				}))

				var vote = yield createVote(topic, newVote({endsAt: new Date}))
				var signatureCount = Config.votesRequired - 1
				yield createSignatures(vote, signatureCount)

				var res = yield this.request("/initiatives/" + initiative.uuid)
				res.statusCode.must.equal(200)
				res.body.must.include(tHtml("VOTING_FAILED"))
				res.body.must.include(t("N_SIGNATURES_FAILED", {votes: signatureCount}))

				var dom = parseDom(res.body)
				var phases = queryPhases(dom)

				_.sum(_.map(phases, "past")).must.equal(1)
				_.sum(_.map(phases, "current")).must.equal(1)
				phases.edit.past.must.be.true()
				phases.sign.current.must.be.true()
				phases.sign.text.must.equal(t("N_SIGNATURES", {votes: signatureCount}))
			})

			it("must render initiative in sign phase that succeeded", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					phase: "sign"
				}))

				var topic = yield createTopic(newTopic({
					id: initiative.uuid,
					creatorId: (yield createUser(newUser())).id,
					sourcePartnerId: this.partner.id,
					status: "voting"
				}))

				var vote = yield createVote(topic, newVote({endsAt: new Date}))
				yield createSignatures(vote, Config.votesRequired)

				var res = yield this.request("/initiatives/" + initiative.uuid)
				res.statusCode.must.equal(200)
				res.body.must.include(tHtml("VOTING_SUCCEEDED"))

				var dom = parseDom(res.body)
				var phases = queryPhases(dom)

				_.sum(_.map(phases, "past")).must.equal(1)
				_.sum(_.map(phases, "current")).must.equal(1)
				phases.edit.past.must.be.true()
				phases.sign.current.must.be.true()

				phases.sign.text.must.equal(t("N_SIGNATURES", {
					votes: Config.votesRequired
				}))

				phases.must.not.have.property("government")
			})

			it("must render initiative in sign phase with paper signatures",
				function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					phase: "sign",
					has_paper_signatures: true
				}))

				var topic = yield createTopic(newTopic({
					id: initiative.uuid,
					creatorId: (yield createUser(newUser())).id,
					sourcePartnerId: this.partner.id,
					status: "voting"
				}))

				var vote = yield createVote(topic, newVote({
					endsAt: DateFns.addDays(new Date, 1)
				}))

				yield createSignatures(vote, 1)

				var res = yield this.request("/initiatives/" + initiative.uuid)
				res.statusCode.must.equal(200)

				var dom = parseDom(res.body)
				var phases = queryPhases(dom)

				_.sum(_.map(phases, "past")).must.equal(1)
				_.sum(_.map(phases, "current")).must.equal(1)
				phases.edit.past.must.be.true()
				phases.sign.current.must.be.true()
				phases.sign.text.must.equal(t("N_SIGNATURES_WITH_PAPER", {votes: 1}))
				phases.must.not.have.property("government")
			})

			it("must render initiative in parliament and not received", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					phase: "parliament",
					sent_to_parliament_at: DateFns.addDays(new Date, -5)
				}))

				var topic = yield createTopic(newTopic({
					id: initiative.uuid,
					creatorId: (yield createUser(newUser())).id,
					sourcePartnerId: this.partner.id,
					status: "followUp"
				}))

				var vote = yield createVote(topic, newVote())
				yield createSignatures(vote, Config.votesRequired)

				var res = yield this.request("/initiatives/" + initiative.uuid)
				res.statusCode.must.equal(200)
				res.body.must.include(tHtml("INITIATIVE_IN_PARLIAMENT"))

				var dom = parseDom(res.body)
				var phases = queryPhases(dom)

				_.sum(_.map(phases, "past")).must.equal(2)
				_.sum(_.map(phases, "current")).must.equal(1)
				phases.edit.past.must.be.true()
				phases.sign.past.must.be.true()
				phases.parliament.current.must.be.true()
				phases.must.not.have.property("government")

				phases.sign.text.must.equal(t("N_SIGNATURES", {
					votes: Config.votesRequired
				}))

				phases.parliament.text.must.equal(
					t("PARLIAMENT_PHASE_ACCEPTANCE_N_DAYS_LEFT", {days: 25})
				)

				var events = queryEvents(dom)
				events.length.must.equal(1)
				events[0].id.must.equal("sent-to-parliament")
				events[0].phase.must.equal("parliament")
				events[0].at.must.eql(initiative.sent_to_parliament_at)
				events[0].title.must.equal(t("INITIATIVE_SENT_TO_PARLIAMENT_TITLE"))
			})

			it("must render initiative in parliament and received", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					phase: "parliament",
					sent_to_parliament_at: DateFns.addDays(new Date, -6),
					received_by_parliament_at: DateFns.addDays(new Date, -5),
					parliament_committee: "Keskkonnakomisjon"
				}))

				var topic = yield createTopic(newTopic({
					id: initiative.uuid,
					creatorId: (yield createUser(newUser())).id,
					sourcePartnerId: this.partner.id,
					status: "followUp"
				}))

				var vote = yield createVote(topic, newVote())
				yield createSignatures(vote, Config.votesRequired)

				var res = yield this.request("/initiatives/" + initiative.uuid)
				res.statusCode.must.equal(200)
				res.body.must.include(tHtml("INITIATIVE_IN_PARLIAMENT"))

				var dom = parseDom(res.body)
				var phases = queryPhases(dom)

				_.sum(_.map(phases, "past")).must.equal(2)
				_.sum(_.map(phases, "current")).must.equal(1)
				phases.edit.past.must.be.true()
				phases.sign.past.must.be.true()
				phases.parliament.current.must.be.true()
				phases.must.not.have.property("government")

				phases.sign.text.must.equal(t("N_SIGNATURES", {
					votes: Config.votesRequired
				}))

				phases.parliament.text.must.equal(
					"Keskkonnakomisjon" +
					t("PARLIAMENT_PHASE_ACCEPTANCE_N_DAYS_LEFT", {days: 25})
				)
			})

			it("must render initiative in parliament and received event",
				function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					phase: "parliament",
					external: true
				}))

				var event = yield eventsDb.create(new ValidEvent({
					initiative_uuid: initiative.uuid,
					created_at: pseudoDateTime(),
					updated_at: pseudoDateTime(),
					occurred_at: pseudoDateTime(),
					type: "parliament-received",
					origin: "parliament"
				}))

				var res = yield this.request("/initiatives/" + initiative.uuid)
				res.statusCode.must.equal(200)

				var events = queryEvents(parseDom(res.body))
				events.length.must.equal(1)

				events[0].id.must.equal(String(event.id))
				events[0].phase.must.equal("parliament")
				events[0].at.must.eql(event.occurred_at)
				events[0].title.must.equal(t("PARLIAMENT_RECEIVED"))
				events[0].content.length.must.equal(0)
			})

			it("must render initiative in parliament and accepted event",
				function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					phase: "parliament",
					external: true
				}))

				var event = yield eventsDb.create(new ValidEvent({
					initiative_uuid: initiative.uuid,
					created_at: pseudoDateTime(),
					updated_at: pseudoDateTime(),
					occurred_at: pseudoDateTime(),
					type: "parliament-accepted",
					content: {committee: "Keskkonnakomisjon"},
					origin: "parliament"
				}))

				var res = yield this.request("/initiatives/" + initiative.uuid)
				res.statusCode.must.equal(200)

				var events = queryEvents(parseDom(res.body))
				events.length.must.equal(1)

				events[0].id.must.equal(String(event.id))
				events[0].phase.must.equal("parliament")
				events[0].at.must.eql(event.occurred_at)
				events[0].title.must.equal(t("PARLIAMENT_ACCEPTED"))

				events[0].content[0].textContent.must.equal(
					t("PARLIAMENT_ACCEPTED_SENT_TO_COMMITTEE", {
						committee: "Keskkonnakomisjon"
					})
				)
			})

			it("must render initiative in parliament and board meeting event",
				function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					phase: "parliament",
					external: true
				}))

				var event = yield eventsDb.create(new ValidEvent({
					initiative_uuid: initiative.uuid,
					created_at: pseudoDateTime(),
					updated_at: pseudoDateTime(),
					occurred_at: pseudoDateTime(),
					type: "parliament-board-meeting",
					content: {},
					origin: "parliament"
				}))

				var res = yield this.request("/initiatives/" + initiative.uuid)
				res.statusCode.must.equal(200)

				var events = queryEvents(parseDom(res.body))
				events.length.must.equal(1)

				events[0].id.must.equal(String(event.id))
				events[0].phase.must.equal("parliament")
				events[0].at.must.eql(event.occurred_at)
				events[0].title.must.equal(t("PARLIAMENT_BOARD_MEETING"))
				events[0].content.length.must.equal(0)
			})

			it("must render initiative in parliament and committee meeting event", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					phase: "parliament",
					external: true
				}))

				var event = yield eventsDb.create(new ValidEvent({
					initiative_uuid: initiative.uuid,
					created_at: pseudoDateTime(),
					updated_at: pseudoDateTime(),
					occurred_at: pseudoDateTime(),
					type: "parliament-committee-meeting",
					content: {committee: "Keskkonnakomisjon"},
					origin: "parliament"
				}))

				var res = yield this.request("/initiatives/" + initiative.uuid)
				res.statusCode.must.equal(200)

				var events = queryEvents(parseDom(res.body))
				events.length.must.equal(1)

				events[0].id.must.equal(String(event.id))
				events[0].phase.must.equal("parliament")
				events[0].at.must.eql(event.occurred_at)

				events[0].title.must.equal(t("PARLIAMENT_COMMITTEE_MEETING_BY", {
					committee: "Keskkonnakomisjon"
				}))

				events[0].content.length.must.equal(0)
			})

			COMMITTEE_MEETING_DECISIONS.forEach(function(decision) {
				it(`must render initiative in parliament and committee meeting event with ${decision} decision`, function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative({
						phase: "parliament",
						external: true
					}))

					var event = yield eventsDb.create(new ValidEvent({
						initiative_uuid: initiative.uuid,
						created_at: pseudoDateTime(),
						updated_at: pseudoDateTime(),
						occurred_at: pseudoDateTime(),
						type: "parliament-committee-meeting",
						content: {committee: "Keskkonnakomisjon", decision: decision},
						origin: "parliament"
					}))

					var res = yield this.request("/initiatives/" + initiative.uuid)
					res.statusCode.must.equal(200)

					var events = queryEvents(parseDom(res.body))
					events.length.must.equal(1)

					events[0].id.must.equal(String(event.id))
					events[0].phase.must.equal("parliament")
					events[0].at.must.eql(event.occurred_at)

					events[0].title.must.equal(t("PARLIAMENT_COMMITTEE_MEETING_BY", {
						committee: "Keskkonnakomisjon"
					}))

					events[0].content[0].textContent.must.equal(
						decision == "continue"
						? t("PARLIAMENT_MEETING_DECISION_CONTINUE")
						: decision == "reject"
						? t("PARLIAMENT_MEETING_DECISION_REJECT")
						: decision == "forward"
						? t("PARLIAMENT_MEETING_DECISION_FORWARD")
						: decision == "solve-differently"
						? t("PARLIAMENT_MEETING_DECISION_SOLVE_DIFFERENTLY")
						: null
					)
				})
			})

			it("must render initiative in parliament and committee meeting event with summary", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					phase: "parliament",
					external: true
				}))

				var event = yield eventsDb.create(new ValidEvent({
					initiative_uuid: initiative.uuid,
					created_at: pseudoDateTime(),
					updated_at: pseudoDateTime(),
					occurred_at: pseudoDateTime(),
					type: "parliament-committee-meeting",
					content: {committee: "Keskkonnakomisjon", summary: "Talks happened."},
					origin: "parliament"
				}))

				var res = yield this.request("/initiatives/" + initiative.uuid)
				res.statusCode.must.equal(200)

				var events = queryEvents(parseDom(res.body))
				events.length.must.equal(1)

				events[0].id.must.equal(String(event.id))
				events[0].phase.must.equal("parliament")
				events[0].at.must.eql(event.occurred_at)

				events[0].title.must.equal(t("PARLIAMENT_COMMITTEE_MEETING_BY", {
					committee: "Keskkonnakomisjon"
				}))

				events[0].content[0].textContent.must.equal("Talks happened.")
			})

			it("must render initiative in parliament and decision event",
				function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					phase: "parliament",
					external: true
				}))

				var event = yield eventsDb.create(new ValidEvent({
					initiative_uuid: initiative.uuid,
					created_at: pseudoDateTime(),
					updated_at: pseudoDateTime(),
					occurred_at: pseudoDateTime(),
					type: "parliament-decision",
					content: {},
					origin: "parliament"
				}))

				var res = yield this.request("/initiatives/" + initiative.uuid)
				res.statusCode.must.equal(200)

				var events = queryEvents(parseDom(res.body))
				events.length.must.equal(1)

				events[0].id.must.equal(String(event.id))
				events[0].phase.must.equal("parliament")
				events[0].at.must.eql(event.occurred_at)
				events[0].title.must.equal(t("PARLIAMENT_DECISION"))
				events[0].content.length.must.equal(0)
			})

			it("must render initiative in parliament and decision event with summary", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					phase: "parliament",
					external: true
				}))

				var event = yield eventsDb.create(new ValidEvent({
					initiative_uuid: initiative.uuid,
					created_at: pseudoDateTime(),
					updated_at: pseudoDateTime(),
					occurred_at: pseudoDateTime(),
					type: "parliament-decision",
					content: {summary: "Talks happened."},
					origin: "parliament"
				}))

				var res = yield this.request("/initiatives/" + initiative.uuid)
				res.statusCode.must.equal(200)

				var events = queryEvents(parseDom(res.body))
				events.length.must.equal(1)

				events[0].id.must.equal(String(event.id))
				events[0].phase.must.equal("parliament")
				events[0].at.must.eql(event.occurred_at)
				events[0].title.must.equal(t("PARLIAMENT_DECISION"))
				events[0].content[0].textContent.must.equal("Talks happened.")
			})

			it("must render initiative in parliament and letter event", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					phase: "parliament",
					external: true
				}))

				var event = yield eventsDb.create(new ValidEvent({
					initiative_uuid: initiative.uuid,
					created_at: pseudoDateTime(),
					updated_at: pseudoDateTime(),
					occurred_at: pseudoDateTime(),
					origin: "parliament",
					type: "parliament-letter",

					content: {
						medium: "email",
						from: "John Wick",
						direction: "incoming",
						title: "Important Question",
						summary: "What to do next?"
					}
				}))

				var res = yield this.request("/initiatives/" + initiative.uuid)
				res.statusCode.must.equal(200)

				var events = queryEvents(parseDom(res.body))
				events.length.must.equal(1)

				events[0].id.must.equal(String(event.id))
				events[0].phase.must.equal("parliament")
				events[0].at.must.eql(event.occurred_at)
				events[0].title.must.equal(t("PARLIAMENT_LETTER_INCOMING"))
				events[0].content[0].textContent.must.include("Important Question")
				events[0].content[1].textContent.must.include("What to do next?")
			})

			it("must render initiative in parliament and interpellation event",
				function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					phase: "parliament",
					external: true
				}))

				var event = yield eventsDb.create(new ValidEvent({
					initiative_uuid: initiative.uuid,
					created_at: pseudoDateTime(),
					updated_at: pseudoDateTime(),
					occurred_at: pseudoDateTime(),
					origin: "parliament",
					type: "parliament-interpellation",
					content: {to: "John Wick", deadline: "2015-07-10"}
				}))

				var res = yield this.request("/initiatives/" + initiative.uuid)
				res.statusCode.must.equal(200)

				var events = queryEvents(parseDom(res.body))
				events.length.must.equal(1)

				events[0].id.must.equal(String(event.id))
				events[0].phase.must.equal("parliament")
				events[0].at.must.eql(event.occurred_at)
				events[0].title.must.equal(t("PARLIAMENT_INTERPELLATION"))
				events[0].content[0].textContent.must.include("John Wick")
				events[0].content[0].textContent.must.include("10.07.2015")
			})

			it("must render initiative in parliament and national matter event",
				function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					phase: "parliament",
					external: true
				}))

				var event = yield eventsDb.create(new ValidEvent({
					initiative_uuid: initiative.uuid,
					created_at: pseudoDateTime(),
					updated_at: pseudoDateTime(),
					occurred_at: pseudoDateTime(),
					origin: "parliament",
					type: "parliament-national-matter",
					content: {}
				}))

				var res = yield this.request("/initiatives/" + initiative.uuid)
				res.statusCode.must.equal(200)

				var events = queryEvents(parseDom(res.body))
				events.length.must.equal(1)

				events[0].id.must.equal(String(event.id))
				events[0].phase.must.equal("parliament")
				events[0].at.must.eql(event.occurred_at)
				events[0].title.must.equal(t("PARLIAMENT_NATIONAL_MATTER"))
				events[0].content.length.must.equal(0)
			})

			it("must render initiative in parliament with acceptance deadline today", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					phase: "parliament",
					sent_to_parliament_at: DateFns.addDays(new Date, -30)
				}))

				var topic = yield createTopic(newTopic({
					id: initiative.uuid,
					creatorId: (yield createUser(newUser())).id,
					sourcePartnerId: this.partner.id,
					status: "followUp"
				}))

				var vote = yield createVote(topic, newVote())
				yield createSignatures(vote, Config.votesRequired)

				var res = yield this.request("/initiatives/" + initiative.uuid)
				res.statusCode.must.equal(200)

				var dom = parseDom(res.body)
				var phases = queryPhases(dom)

				phases.parliament.text.must.equal(
					t("PARLIAMENT_PHASE_ACCEPTANCE_0_DAYS_LEFT")
				)
			})

			it("must render initiative in parliament with acceptance deadline past", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					phase: "parliament",
					sent_to_parliament_at: DateFns.addDays(new Date, -35)
				}))

				var topic = yield createTopic(newTopic({
					id: initiative.uuid,
					creatorId: (yield createUser(newUser())).id,
					sourcePartnerId: this.partner.id,
					status: "followUp"
				}))

				var vote = yield createVote(topic, newVote())
				yield createSignatures(vote, Config.votesRequired)

				var res = yield this.request("/initiatives/" + initiative.uuid)
				res.statusCode.must.equal(200)

				var dom = parseDom(res.body)
				var phases = queryPhases(dom)

				phases.parliament.text.must.equal(
					t("PARLIAMENT_PHASE_ACCEPTANCE_N_DAYS_OVER", {days: 5})
				)
			})

			it("must render initiative in parliament with proceedings deadline in the future", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					phase: "parliament",
					sent_to_parliament_at: DateFns.addDays(new Date, -35),
					accepted_by_parliament_at: DateFns.addDays(new Date, -5)
				}))

				var topic = yield createTopic(newTopic({
					id: initiative.uuid,
					creatorId: (yield createUser(newUser())).id,
					sourcePartnerId: this.partner.id,
					status: "followUp"
				}))

				var vote = yield createVote(topic, newVote())
				yield createSignatures(vote, Config.votesRequired)

				var res = yield this.request("/initiatives/" + initiative.uuid)
				res.statusCode.must.equal(200)

				var dom = parseDom(res.body)
				var phases = queryPhases(dom)

				var deadline = DateFns.addMonths(DateFns.addDays(new Date, -5), 6)
				var days = DateFns.differenceInDays(deadline, new Date)

				phases.parliament.text.must.equal(t("PARLIAMENT_PHASE_N_DAYS_LEFT", {
					days: days
				}))
			})

			it("must render initiative in parliament with proceedings deadline today", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					phase: "parliament",
					sent_to_parliament_at: DateFns.addMonths(new Date, -7),
					accepted_by_parliament_at: DateFns.addMonths(new Date, -6)
				}))

				yield createTopic(newTopic({
					id: initiative.uuid,
					creatorId: (yield createUser(newUser())).id,
					sourcePartnerId: this.partner.id,
					status: "followUp"
				}))

				var res = yield this.request("/initiatives/" + initiative.uuid)
				res.statusCode.must.equal(200)

				var dom = parseDom(res.body)
				var phases = queryPhases(dom)
				phases.parliament.text.must.equal(t("PARLIAMENT_PHASE_0_DAYS_LEFT"))
			})

			it("must render initiative in parliament with proceedings deadline past", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					phase: "parliament",
					sent_to_parliament_at: DateFns.addMonths(new Date, -7),
					accepted_by_parliament_at:
						DateFns.addMonths(DateFns.addDays(new Date, -5), -6)
				}))

				yield createTopic(newTopic({
					id: initiative.uuid,
					creatorId: (yield createUser(newUser())).id,
					sourcePartnerId: this.partner.id,
					status: "followUp"
				}))

				var res = yield this.request("/initiatives/" + initiative.uuid)
				res.statusCode.must.equal(200)

				var dom = parseDom(res.body)
				var phases = queryPhases(dom)
				phases.parliament.text.must.equal(t("PARLIAMENT_PHASE_N_DAYS_OVER", {
					days: 5
				}))
			})

			it("must render initiative in parliament that's finished", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					phase: "parliament",
					sent_to_parliament_at: DateFns.addDays(new Date, -30),
					received_by_parliament_at: DateFns.addDays(new Date, -25),
					finished_in_parliament_at: DateFns.addDays(new Date, -5)
				}))

				yield createTopic(newTopic({
					id: initiative.uuid,
					creatorId: (yield createUser(newUser())).id,
					sourcePartnerId: this.partner.id,
					status: "followUp"
				}))

				var res = yield this.request("/initiatives/" + initiative.uuid)
				res.statusCode.must.equal(200)
				res.body.must.include(tHtml("INITIATIVE_IN_PARLIAMENT"))

				var dom = parseDom(res.body)
				var phases = queryPhases(dom)

				_.sum(_.map(phases, "past")).must.equal(2)
				_.sum(_.map(phases, "current")).must.equal(1)
				phases.edit.past.must.be.true()
				phases.sign.past.must.be.true()
				phases.parliament.current.must.be.true()
				phases.must.not.have.property("government")

				phases.parliament.text.must.equal(I18n.formatDateSpan(
					"numeric",
					initiative.received_by_parliament_at,
					initiative.finished_in_parliament_at
				))
			})

			PARLIAMENT_DECISIONS.forEach(function(decision) {
				it(`must render initiative in parliament and finished with ${decision} decision`, function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative({
						phase: "parliament",
						sent_to_parliament_at: DateFns.addDays(new Date, -30),
						parliament_decision: decision,
						finished_in_parliament_at: DateFns.addDays(new Date, -5)
					}))

					yield createTopic(newTopic({
						id: initiative.uuid,
						creatorId: (yield createUser(newUser())).id,
						sourcePartnerId: this.partner.id,
						status: "followUp"
					}))

					var res = yield this.request("/initiatives/" + initiative.uuid)
					res.statusCode.must.equal(200)
					res.body.must.include(tHtml("INITIATIVE_IN_PARLIAMENT"))

					var dom = parseDom(res.body)
					var events = queryEvents(dom)
					events.length.must.equal(2)
					events[0].id.must.equal("sent-to-parliament")
					events[1].id.must.equal("parliament-finished")
					events[1].phase.must.equal("parliament")
					events[1].at.must.eql(initiative.finished_in_parliament_at)
					events[1].title.must.equal(t("PARLIAMENT_FINISHED"))

					events[1].content[0].textContent.must.equal(
						decision == "reject"
						? t("PARLIAMENT_DECISION_REJECT")
						: decision == "forward"
						? t("PARLIAMENT_DECISION_FORWARD")
						: decision == "solve-differently"
						? t("PARLIAMENT_DECISION_SOLVE_DIFFERENTLY")
						: null
					)
				})

				it(`must render initiative in parliament and finished event with ${decision} decision`, function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative({
						phase: "parliament",
						sent_to_parliament_at: DateFns.addDays(new Date, -30),
						parliament_decision: decision,
						finished_in_parliament_at: DateFns.addDays(new Date, -5)
					}))

					yield createTopic(newTopic({
						id: initiative.uuid,
						creatorId: (yield createUser(newUser())).id,
						sourcePartnerId: this.partner.id,
						status: "followUp"
					}))

					var event = yield eventsDb.create(new ValidEvent({
						initiative_uuid: initiative.uuid,
						occurred_at: DateFns.addDays(new Date, -3),
						type: "parliament-finished",
						content: null,
						origin: "parliament"
					}))

					var res = yield this.request("/initiatives/" + initiative.uuid)
					res.statusCode.must.equal(200)
					res.body.must.include(tHtml("INITIATIVE_IN_PARLIAMENT"))

					var dom = parseDom(res.body)
					var events = queryEvents(dom)
					events.length.must.equal(2)
					events[0].id.must.equal("sent-to-parliament")
					events[1].id.must.equal(String(event.id))
					events[1].phase.must.equal("parliament")
					events[1].at.must.eql(event.occurred_at)
					events[1].title.must.equal(t("PARLIAMENT_FINISHED"))

					events[1].content[0].textContent.must.equal(
						decision == "reject"
						? t("PARLIAMENT_DECISION_REJECT")
						: decision == "forward"
						? t("PARLIAMENT_DECISION_FORWARD")
						: decision == "solve-differently"
						? t("PARLIAMENT_DECISION_SOLVE_DIFFERENTLY")
						: null
					)
				})
			})

			it("must render external initiative in parliament", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					external: true,
					phase: "parliament",
					received_by_parliament_at: new Date
				}))

				var res = yield this.request("/initiatives/" + initiative.uuid)
				res.statusCode.must.equal(200)
				res.body.must.include(tHtml("INITIATIVE_IN_PARLIAMENT"))
			})

			it("must render initiative in government", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					phase: "government",
					sent_to_parliament_at: DateFns.addDays(new Date, -30),
					received_by_parliament_at: DateFns.addDays(new Date, -25),
					finished_in_parliament_at: DateFns.addDays(new Date, -5),
					sent_to_government_at: new Date,
					government_agency: "Sidususministeerium"
				}))

				var topic = yield createTopic(newTopic({
					id: initiative.uuid,
					creatorId: (yield createUser(newUser())).id,
					sourcePartnerId: this.partner.id,
					status: "followUp"
				}))

				var vote = yield createVote(topic, newVote())
				yield createSignatures(vote, Config.votesRequired)

				var res = yield this.request("/initiatives/" + initiative.uuid)
				res.statusCode.must.equal(200)
				res.body.must.include(tHtml("INITIATIVE_IN_GOVERNMENT"))

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

				phases.parliament.text.must.equal(I18n.formatDateSpan(
					"numeric",
					initiative.received_by_parliament_at,
					initiative.finished_in_parliament_at
				))

				phases.government.text.must.equal(
					"Sidususministeerium" +
					I18n.formatDate("numeric", initiative.sent_to_government_at)
				)

				var events = queryEvents(dom)
				events.length.must.equal(3)
				events[0].id.must.equal("sent-to-parliament")
				events[1].id.must.equal("parliament-finished")
				events[2].id.must.equal("sent-to-government")
				events[2].phase.must.equal("government")
				events[2].at.must.eql(initiative.sent_to_government_at)

				events[2].title.must.equal(
					t("EVENT_SENT_TO_GOVERNMENT_TITLE_WITH_AGENCY", {
						agency: "Sidususministeerium"
					})
				)
			})

			it("must render initiative in government that's finished", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					phase: "government",
					sent_to_parliament_at: DateFns.addDays(new Date, -30),
					received_by_parliament_at: DateFns.addDays(new Date, -25),
					finished_in_parliament_at: DateFns.addDays(new Date, -20),
					sent_to_government_at: DateFns.addDays(new Date, -10),
					government_agency: "Sidususministeerium",
					finished_in_government_at: DateFns.addDays(new Date, -5),
					government_decision: "Anda alla."
				}))

				yield createTopic(newTopic({
					id: initiative.uuid,
					creatorId: (yield createUser(newUser())).id,
					sourcePartnerId: this.partner.id,
					status: "followUp"
				}))

				var res = yield this.request("/initiatives/" + initiative.uuid)
				res.statusCode.must.equal(200)
				res.body.must.include(tHtml("INITIATIVE_IN_GOVERNMENT"))

				var dom = parseDom(res.body)
				var phases = queryPhases(dom)

				_.sum(_.map(phases, "past")).must.equal(3)
				_.sum(_.map(phases, "current")).must.equal(1)
				phases.edit.past.must.be.true()
				phases.sign.past.must.be.true()
				phases.parliament.past.must.be.true()
				phases.government.current.must.be.true()

				phases.government.text.must.equal(
					"Sidususministeerium" + I18n.formatDateSpan(
						"numeric",
						initiative.sent_to_government_at,
						initiative.finished_in_government_at
					)
				)

				var events = queryEvents(dom)
				events.length.must.equal(4)
				events[0].id.must.equal("sent-to-parliament")
				events[1].id.must.equal("parliament-finished")
				events[2].id.must.equal("sent-to-government")
				events[3].id.must.equal("finished-in-government")
				events[3].phase.must.equal("government")
				events[3].at.must.eql(initiative.finished_in_government_at)

				events[3].title.must.equal(
					t("EVENT_FINISHED_IN_GOVERNMENT_TITLE_WITH_AGENCY", {
						agency: "Sidususministeerium"
					})
				)

				events[3].content[0].textContent.must.equal(
					t("EVENT_FINISHED_IN_GOVERNMENT_CONTENT", {decision: "Anda alla."})
				)
			})

			it("must render initiative in government with no sent time", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					phase: "government",
					sent_to_parliament_at: DateFns.addDays(new Date, -30),
					received_by_parliament_at: DateFns.addDays(new Date, -25),
					finished_in_parliament_at: DateFns.addDays(new Date, -5)
				}))

				yield createTopic(newTopic({
					id: initiative.uuid,
					creatorId: (yield createUser(newUser())).id,
					sourcePartnerId: this.partner.id,
					status: "followUp"
				}))

				var res = yield this.request("/initiatives/" + initiative.uuid)
				res.statusCode.must.equal(200)
				res.body.must.include(tHtml("INITIATIVE_IN_GOVERNMENT"))

				var dom = parseDom(res.body)
				var phases = queryPhases(dom)

				_.sum(_.map(phases, "past")).must.equal(3)
				_.sum(_.map(phases, "current")).must.equal(1)
				phases.edit.past.must.be.true()
				phases.sign.past.must.be.true()
				phases.parliament.past.must.be.true()
				phases.government.current.must.be.true()
			})

			it("must render initiative in done phase", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					phase: "done",
					sent_to_parliament_at: new Date
				}))

				yield createTopic(newTopic({
					id: initiative.uuid,
					creatorId: (yield createUser(newUser())).id,
					sourcePartnerId: this.partner.id,
					status: "followUp"
				}))

				var res = yield this.request("/initiatives/" + initiative.uuid)
				res.statusCode.must.equal(200)
				res.body.must.include(tHtml("INITIATIVE_PROCESSED"))

				var dom = parseDom(res.body)
				var phases = queryPhases(dom)

				_.sum(_.map(phases, "past")).must.equal(3)
				_.sum(_.map(phases, "current")).must.equal(1)
				phases.edit.past.must.be.true()
				phases.sign.past.must.be.true()
				phases.parliament.past.must.be.true()
				phases.must.not.have.property("government")
				phases.done.current.must.be.true()
				phases.must.not.have.property("archived")
			})

			it("must render initiative in done phase that went to government",
				function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					phase: "done",
					sent_to_parliament_at: new Date,
					sent_to_government_at: new Date,
					finished_in_government_at: new Date
				}))

				yield createTopic(newTopic({
					id: initiative.uuid,
					creatorId: (yield createUser(newUser())).id,
					sourcePartnerId: this.partner.id,
					status: "followUp"
				}))

				var res = yield this.request("/initiatives/" + initiative.uuid)
				res.statusCode.must.equal(200)
				res.body.must.include(tHtml("INITIATIVE_PROCESSED"))

				var dom = parseDom(res.body)
				var phases = queryPhases(dom)

				_.sum(_.map(phases, "past")).must.equal(4)
				_.sum(_.map(phases, "current")).must.equal(1)
				phases.edit.past.must.be.true()
				phases.sign.past.must.be.true()
				phases.parliament.past.must.be.true()
				phases.government.past.must.be.true()
				phases.done.current.must.be.true()
				phases.must.not.have.property("archived")
			})

			it("must render archived initiative in done phase that was sent to the parliament", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					phase: "done",
					sent_to_parliament_at: new Date,
					archived_at: new Date
				}))

				yield createTopic(newTopic({
					id: initiative.uuid,
					creatorId: (yield createUser(newUser())).id,
					sourcePartnerId: this.partner.id,
					status: "followUp"
				}))

				var res = yield this.request("/initiatives/" + initiative.uuid)
				res.statusCode.must.equal(200)
				res.body.must.include(tHtml("INITIATIVE_PROCESSED"))
				res.body.must.not.include(tHtml("VOTING_SUCCEEDED"))
				res.body.must.not.include(tHtml("VOTING_FAILED"))
				res.body.must.not.include(tHtml("VOTING_DEADLINE"))

				var dom = parseDom(res.body)
				var phases = queryPhases(dom)

				_.sum(_.map(phases, "past")).must.equal(3)
				_.sum(_.map(phases, "current")).must.equal(1)
				phases.edit.past.must.be.true()
				phases.sign.past.must.be.true()
				phases.parliament.past.must.be.true()
				phases.must.not.have.property("government")
				phases.must.not.have.property("done")
				phases.archived.current.must.be.true()
			})

			it("must render archived initiative in done phase that went to government", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					phase: "done",
					sent_to_parliament_at: new Date,
					sent_to_government_at: new Date,
					archived_at: new Date
				}))

				yield createTopic(newTopic({
					id: initiative.uuid,
					creatorId: (yield createUser(newUser())).id,
					sourcePartnerId: this.partner.id,
					status: "followUp"
				}))

				var res = yield this.request("/initiatives/" + initiative.uuid)
				res.statusCode.must.equal(200)
				res.body.must.include(tHtml("INITIATIVE_PROCESSED"))

				var dom = parseDom(res.body)
				var phases = queryPhases(dom)

				_.sum(_.map(phases, "past")).must.equal(4)
				_.sum(_.map(phases, "current")).must.equal(1)
				phases.edit.past.must.be.true()
				phases.sign.past.must.be.true()
				phases.parliament.past.must.be.true()
				phases.government.past.must.be.true()
				phases.must.not.have.property("done")
				phases.archived.current.must.be.true()
			})

			it("must render initiative with text event", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					phase: "parliament",
					external: true
				}))

				var author = yield createUser(newUser({name: "Johnny Lang"}))

				var event = yield eventsDb.create(new ValidEvent({
					initiative_uuid: initiative.uuid,
					created_by: author.id,
					title: "This just in.",
					content: "Everything is fine!",
					created_at: pseudoDateTime(),
					occurred_at: pseudoDateTime()
				}))

				var res = yield this.request("/initiatives/" + initiative.uuid)
				res.statusCode.must.equal(200)

				var events = queryEvents(parseDom(res.body))
				events.length.must.equal(1)

				events[0].id.must.equal(String(event.id))
				events[0].must.have.property("phase", null)
				events[0].author.must.equal(author.name)
				events[0].at.must.eql(event.occurred_at)
				events[0].title.must.equal("This just in.")
				events[0].content[0].textContent.must.equal("Everything is fine!")
			})

			it("must render initiative events in logical order", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					phase: "government",
					external: true,
					sent_to_parliament_at: new Date(2015, 5, 18, 13, 37),
					received_by_parliament_at: new Date(2015, 5, 18),
					finished_in_parliament_at: new Date(2015, 5, 16),
					sent_to_government_at: new Date(2015, 5, 15),
					finished_in_government_at: new Date(2015, 5, 14),
				}))

				var events = yield eventsDb.create([
					new ValidEvent({
						initiative_uuid: initiative.uuid,
						occurred_at: new Date(2015, 5, 18),
						type: "parliament-received",
						origin: "parliament"
					}),

					new ValidEvent({
						initiative_uuid: initiative.uuid,
						occurred_at: new Date(2015, 5, 17),
						type: "parliament-accepted",
						origin: "parliament"
					}),

					new ValidEvent({
						initiative_uuid: initiative.uuid,
						occurred_at: new Date(2015, 5, 16),
						type: "parliament-finished",
						origin: "parliament"
					})
				])

				var res = yield this.request("/initiatives/" + initiative.uuid)
				res.statusCode.must.equal(200)

				queryEvents(parseDom(res.body)).map((ev) => ev.id).must.eql([
					"sent-to-parliament",
					String(events[0].id),
					String(events[1].id),
					String(events[2].id),
					"sent-to-government",
					"finished-in-government"
				])
			})

			it("must render initiative comments", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative)

				yield createTopic(newTopic({
					id: initiative.uuid,
					creatorId: (yield createUser(newUser())).id,
					sourcePartnerId: this.partner.id,
					visibility: "public"
				}))

				var author = yield createUser(newUser({name: "Johnny Lang"}))
				var replier = yield createUser(newUser({name: "Kenny Loggins"}))

				var comment = yield commentsDb.create(new ValidComment({
					initiative_uuid: initiative.uuid,
					user_uuid: author.id
				}))

				var reply = yield commentsDb.create(new ValidComment({
					initiative_uuid: initiative.uuid,
					user_uuid: replier.id,
					parent_id: comment.id
				}))

				var res = yield this.request("/initiatives/" + initiative.uuid)
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
				var initiative = yield initiativesDb.create(new ValidInitiative)

				yield createTopic(newTopic({
					id: initiative.uuid,
					creatorId: (yield createUser(newUser())).id,
					sourcePartnerId: this.partner.id,
					visibility: "public"
				}))

				var other = yield initiativesDb.create(new ValidInitiative)

				var comment = yield commentsDb.create(new ValidComment({
					initiative_uuid: other.uuid
				}))

				var res = yield this.request("/initiatives/" + initiative.uuid)
				res.statusCode.must.equal(200)

				var dom = parseDom(res.body)
				var commentsEl = dom.getElementById("initiative-comments")
				commentsEl.textContent.must.not.include(comment.text)
			})

			// This was a bug noticed on Mar 24, 2017 where the UI translation strings
			// were not rendered on the page. They were used only for ID-card errors.
			it("must render UI strings when voting", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					phase: "sign"
				}))

				var topic = yield createTopic(newTopic({
					id: initiative.uuid,
					creatorId: (yield createUser(newUser())).id,
					sourcePartnerId: this.partner.id,
					status: "voting"
				}))

				yield createVote(topic, newVote({endsAt: DateFns.addDays(new Date, 1)}))

				var res = yield this.request("/initiatives/" + initiative.uuid)
				res.statusCode.must.equal(200)
				res.body.must.include("MSG_ERROR_HWCRYPTO_NO_CERTIFICATES")
			})

			describe("after signing", function() {
				beforeEach(function*() {
					this.initiative = yield initiativesDb.create(new ValidInitiative({
						phase: "sign"
					}))

					this.topic = yield createTopic(newTopic({
						id: this.initiative.uuid,
						creatorId: (yield createUser(newUser())).id,
						sourcePartnerId: this.partner.id,
						status: "voting"
					}))

					this.vote = yield createVote(this.topic, newVote({
						endsAt: DateFns.addDays(new Date, 1)
					}))

					this.yesAndNo = yield createOptions(this.vote)
				})

				it("must not show thanks if not signed", function*() {
					var res = yield this.request("/initiatives/" + this.initiative.uuid)
					res.statusCode.must.equal(200)
					res.body.must.not.include(t("THANKS_FOR_SIGNING"))
					res.body.must.not.include(t("THANKS_FOR_SIGNING_AGAIN"))
					res.body.must.not.include("donate-form")
				})

				it("must show thanks, donate form and revoke button", function*() {
					var signature = yield createSignature(newSignature({
						userId: (yield createUser(newUser())).id,
						voteId: this.vote.id,
						optionId: this.yesAndNo[0]
					}))

					var res = yield this.request("/initiatives/" + this.initiative.uuid, {
						cookies: {flash: serializeFlash({signatureId: signature.id})}
					})

					res.statusCode.must.equal(200)
					res.body.must.include(t("THANKS_FOR_SIGNING"))
					res.body.must.not.include(t("THANKS_FOR_SIGNING_AGAIN"))
					res.body.must.include("donate-form")
					res.body.must.not.include(this.yesAndNo[0])
					res.body.must.include(this.yesAndNo[1])
				})

				it("must confirm signature deletion", function*() {
					var signature = yield createSignature(newSignature({
						userId: (yield createUser(newUser())).id,
						voteId: this.vote.id,
						optionId: this.yesAndNo[1]
					}))

					var res = yield this.request("/initiatives/" + this.initiative.uuid, {
						cookies: {flash: serializeFlash({signatureId: signature.id})}
					})

					res.statusCode.must.equal(200)
					res.body.must.include(t("SIGNATURE_REVOKED"))
					res.body.must.not.include(t("THANKS_FOR_SIGNING"))
					res.body.must.not.include("donate-form")
					res.body.must.include(this.yesAndNo[0])
					res.body.must.not.include(this.yesAndNo[1])
				})

				it("must show thanks even after duplicate votes", function*() {
					var user = yield createUser(newUser())
					var signatures = yield createSignature([
						newSignature({
							userId: user.id,
							voteId: this.vote.id,
							optionId: this.yesAndNo[0],
							createdAt: DateFns.addSeconds(new Date, -NEW_SIG_TRESHOLD + 1)
						}),

						newSignature({
							userId: user.id,
							voteId: this.vote.id,
							optionId: this.yesAndNo[0],
							createdAt: new Date
						}),
					])

					var res = yield this.request("/initiatives/" + this.initiative.uuid, {
						cookies: {flash: serializeFlash({signatureId: signatures[1].id})}
					})

					res.statusCode.must.equal(200)
					res.body.must.include(t("THANKS_FOR_SIGNING"))
					res.body.must.not.include(t("THANKS_FOR_SIGNING_AGAIN"))
					res.body.must.include("donate-form")
					res.body.must.not.include(this.yesAndNo[0])
					res.body.must.include(this.yesAndNo[1])
				})

				it("must show thanks when signing twice", function*() {
					var user = yield createUser(newUser())
					var signatures = yield createSignature([
						newSignature({
							userId: user.id,
							voteId: this.vote.id,
							optionId: this.yesAndNo[0],
							createdAt: DateFns.addMinutes(new Date, -2)
						}),

						newSignature({
							userId: user.id,
							voteId: this.vote.id,
							optionId: this.yesAndNo[0],
							createdAt: DateFns.addMinutes(new Date, -1)
						}),
					])

					var res = yield this.request("/initiatives/" + this.initiative.uuid, {
						cookies: {flash: serializeFlash({signatureId: signatures[1].id})}
					})

					res.statusCode.must.equal(200)
					res.body.must.include(t("THANKS_FOR_SIGNING_AGAIN"))
					res.body.must.include("donate-form")
					res.body.must.not.include(this.yesAndNo[0])
					res.body.must.include(this.yesAndNo[1])
				})

				it("must show thanks when signing twice with duplicate votes",
					function*() {
					var user = yield createUser(newUser())
					var signatures = yield createSignature([
						newSignature({
							userId: user.id,
							voteId: this.vote.id,
							optionId: this.yesAndNo[0],
							createdAt: DateFns.addSeconds(new Date, -NEW_SIG_TRESHOLD)
						}),

						newSignature({
							userId: user.id,
							voteId: this.vote.id,
							optionId: this.yesAndNo[0],
							createdAt: DateFns.addSeconds(new Date, -NEW_SIG_TRESHOLD + 1)
						}),

						newSignature({
							userId: user.id,
							voteId: this.vote.id,
							optionId: this.yesAndNo[0],
							createdAt: new Date
						})
					])

					var res = yield this.request("/initiatives/" + this.initiative.uuid, {
						cookies: {flash: serializeFlash({signatureId: signatures[2].id})}
					})

					res.statusCode.must.equal(200)
					res.body.must.include(t("THANKS_FOR_SIGNING_AGAIN"))
					res.body.must.include("donate-form")
					res.body.must.not.include(this.yesAndNo[0])
					res.body.must.include(this.yesAndNo[1])
				})

				it("must show thanks when signing after revoking", function*() {
					var user = yield createUser(newUser())

					var signatures = yield createSignature([
						newSignature({
							userId: user.id,
							voteId: this.vote.id,
							optionId: this.yesAndNo[0],
							createdAt: DateFns.addSeconds(new Date, -NEW_SIG_TRESHOLD * 2)
						}),

						newSignature({
							userId: user.id,
							voteId: this.vote.id,
							optionId: this.yesAndNo[1],
							createdAt: DateFns.addSeconds(new Date, -NEW_SIG_TRESHOLD)
						}),

						newSignature({
							userId: user.id,
							voteId: this.vote.id,
							optionId: this.yesAndNo[0],
							createdAt: new Date
						}),
					])

					var res = yield this.request("/initiatives/" + this.initiative.uuid, {
						cookies: {flash: serializeFlash({signatureId: signatures[2].id})}
					})

					res.statusCode.must.equal(200)
					res.body.must.include(t("THANKS_FOR_SIGNING"))
					res.body.must.not.include(t("THANKS_FOR_SIGNING_AGAIN"))
					res.body.must.include("donate-form")
					res.body.must.not.include(this.yesAndNo[0])
					res.body.must.include(this.yesAndNo[1])
				})

				it("must show thanks when signing after revoking with duplicate votes",
					function*() {
					var user = yield createUser(newUser())

					var signatures = yield createSignature([
						newSignature({
							userId: user.id,
							voteId: this.vote.id,
							optionId: this.yesAndNo[0],
							createdAt: DateFns.addSeconds(new Date, -NEW_SIG_TRESHOLD * 2)
						}),

						newSignature({
							userId: user.id,
							voteId: this.vote.id,
							optionId: this.yesAndNo[1],
							createdAt: DateFns.addSeconds(new Date, -NEW_SIG_TRESHOLD)
						}),

						newSignature({
							userId: user.id,
							voteId: this.vote.id,
							optionId: this.yesAndNo[0],
							createdAt: DateFns.addSeconds(new Date, -NEW_SIG_TRESHOLD + 1)
						}),

						newSignature({
							userId: user.id,
							voteId: this.vote.id,
							optionId: this.yesAndNo[0],
							createdAt: new Date
						}),
					])

					var res = yield this.request("/initiatives/" + this.initiative.uuid, {
						cookies: {flash: serializeFlash({signatureId: signatures[3].id})}
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
					var initiative = yield initiativesDb.create(new ValidInitiative({
						phase: "sign"
					}))

					var topic = yield createTopic(newTopic({
						id: initiative.uuid,
						creatorId: (yield createUser(newUser())).id,
						sourcePartnerId: this.partner.id,
						status: "voting"
					}))

					var vote = yield createVote(topic, newVote())

					var user = yield createUser(newUser())

					var signatures = yield createSignature([
						newSignature({
							userId: user.id,
							voteId: vote.id,
							optionId: this.yesAndNo[0],
							createdAt: DateFns.addSeconds(new Date, -NEW_SIG_TRESHOLD)
						}),

						newSignature({
							userId: user.id,
							voteId: this.vote.id,
							optionId: this.yesAndNo[0],
							createdAt: new Date
						})
					])

					var res = yield this.request("/initiatives/" + this.initiative.uuid, {
						cookies: {flash: serializeFlash({signatureId: signatures[1].id})}
					})

					res.statusCode.must.equal(200)
					res.body.must.not.include(t("THANKS_FOR_SIGNING_AGAIN"))
				})

				it("must show thanks when signing after another user signed",
					function*() {
					var signatures = yield createSignature([
						newSignature({
							userId: (yield createUser(newUser())).id,
							voteId: this.vote.id,
							optionId: this.yesAndNo[0],
							createdAt: DateFns.addSeconds(new Date, -NEW_SIG_TRESHOLD)
						}),

						newSignature({
							userId: (yield createUser(newUser())).id,
							voteId: this.vote.id,
							optionId: this.yesAndNo[0],
							createdAt: new Date
						}),
					])

					var res = yield this.request("/initiatives/" + this.initiative.uuid, {
						cookies: {flash: serializeFlash({signatureId: signatures[1].id})}
					})

					res.statusCode.must.equal(200)
					res.body.must.not.include(t("THANKS_FOR_SIGNING_AGAIN"))
				})
			})
		})

		describe("when logged in", function() {
			require("root/test/fixtures").user()

			it("must render private initiative if creator", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative)

				yield createTopic(newTopic({
					id: initiative.uuid,
					creatorId: this.user.id,
					sourcePartnerId: this.partner.id,
					visibility: "private"
				}))

				var res = yield this.request("/initiatives/" + initiative.uuid)
				res.statusCode.must.equal(200)
			})

			;["admin", "edit"].forEach(function(perm) {
				it("must render private initiative if admin permission", function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative)

					yield createTopic(newTopic({
						id: initiative.uuid,
						creatorId: (yield createUser(newUser())).id,
						sourcePartnerId: this.partner.id,
						visibility: "private"
					}))

					yield createPermission(newPermission({
						userId: this.user.id,
						topicId: initiative.uuid,
						level: perm
					}))

					var res = yield this.request("/initiatives/" + initiative.uuid)
					res.statusCode.must.equal(200)
				})
			})

			it("must respond with 403 for private discussion of other user",
				function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative)

				yield createTopic(newTopic({
					id: initiative.uuid,
					creatorId: (yield createUser(newUser())).id,
					sourcePartnerId: this.partner.id,
					visibility: "private"
				}))

				var res = yield this.request("/initiatives/" + initiative.uuid)
				res.statusCode.must.equal(403)
				res.statusMessage.must.match(/public/i)
			})

			it("must render initiative in edit phase", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative)

				yield createTopic(newTopic({
					id: initiative.uuid,
					creatorId: (yield createUser(newUser())).id,
					sourcePartnerId: this.partner.id,
					visibility: "public",
					endsAt: DateFns.addDays(new Date, 5)
				}))

				var res = yield this.request("/initiatives/" + initiative.uuid)
				res.statusCode.must.equal(200)

				res.body.must.include(tHtml("INITIATIVE_IN_DISCUSSION"))
				res.body.must.include(t("DISCUSSION_DEADLINE"))

				var dom = parseDom(res.body)
				var phases = queryPhases(dom)

				_.sum(_.map(phases, "past")).must.equal(0)
				_.sum(_.map(phases, "current")).must.equal(1)
				phases.edit.current.must.be.true()
				phases.must.not.have.property("government")

				phases.edit.text.must.equal(
					t("TXT_DEADLINE_CALENDAR_DAYS_LEFT", {numberOfDaysLeft: 6})
				)
			})

			it("must render comment form", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative)

				yield createTopic(newTopic({
					id: initiative.uuid,
					creatorId: (yield createUser(newUser())).id,
					sourcePartnerId: this.partner.id,
					visibility: "public"
				}))

				var res = yield this.request("/initiatives/" + initiative.uuid)
				res.statusCode.must.equal(200)

				var dom = parseDom(res.body)
				var form = dom.getElementById("comment-form")
				var check = form.querySelector("input[type=checkbox][name=subscribe]")
				check.checked.must.be.false()
			})

			it("must render subscribe checkbox if subscribed to initiative comments",
				function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative)

				yield createTopic(newTopic({
					id: initiative.uuid,
					creatorId: (yield createUser(newUser())).id,
					sourcePartnerId: this.partner.id,
					visibility: "public"
				}))

				yield subscriptionsDb.create(new ValidSubscription({
					initiative_uuid: initiative.uuid,
					email: this.user.email,
					confirmed_at: new Date,
					comment_interest: true
				}))
					
				var res = yield this.request("/initiatives/" + initiative.uuid)
				res.statusCode.must.equal(200)

				var dom = parseDom(res.body)
				var form = dom.getElementById("comment-form")
				var check = form.querySelector("input[type=checkbox][name=subscribe]")
				check.checked.must.be.true()
			})

			// This was an unreleased bug in a query that still depended on the
			// CitizenOS topic existing.
			it("must render subscribe checkbox if subscribed to initiative comments given an external initiative", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					external: true,
					phase: "parliament"
				}))

				yield subscriptionsDb.create(new ValidSubscription({
					initiative_uuid: initiative.uuid,
					email: this.user.email,
					confirmed_at: new Date,
					comment_interest: true
				}))
					
				var res = yield this.request("/initiatives/" + initiative.uuid)
				res.statusCode.must.equal(200)

				var dom = parseDom(res.body)
				var form = dom.getElementById("comment-form")
				var check = form.querySelector("input[type=checkbox][name=subscribe]")
				check.checked.must.be.true()
			})

			it("must render subscribe checkbox if subscribed to initiative, but not to comments", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative)

				yield createTopic(newTopic({
					id: initiative.uuid,
					creatorId: (yield createUser(newUser())).id,
					sourcePartnerId: this.partner.id,
					visibility: "public"
				}))

				yield subscriptionsDb.create(new ValidSubscription({
					initiative_uuid: initiative.uuid,
					email: this.user.email,
					confirmed_at: new Date,
					comment_interest: false
				}))
					
				var res = yield this.request("/initiatives/" + initiative.uuid)
				res.statusCode.must.equal(200)

				var dom = parseDom(res.body)
				var form = dom.getElementById("comment-form")
				var check = form.querySelector("input[type=checkbox][name=subscribe]")
				check.checked.must.be.false()
			})

			it("must render subscribe checkbox if subscribed to initiatives' comments", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative)

				yield createTopic(newTopic({
					id: initiative.uuid,
					creatorId: (yield createUser(newUser())).id,
					sourcePartnerId: this.partner.id,
					visibility: "public"
				}))

				yield subscriptionsDb.create(new ValidSubscription({
					email: this.user.email,
					confirmed_at: new Date,
					comment_interest: true
				}))

				var res = yield this.request("/initiatives/" + initiative.uuid)
				res.statusCode.must.equal(200)

				var dom = parseDom(res.body)
				var form = dom.getElementById("comment-form")
				var check = form.querySelector("input[type=checkbox][name=subscribe]")
				check.checked.must.be.false()
			})

			it("must not render send to parliament button if not enough signatures",
				function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					phase: "sign"
				}))

				var topic = yield createTopic(newTopic({
					id: initiative.uuid,
					creatorId: this.user.id,
					sourcePartnerId: this.partner.id,
					status: "voting"
				}))

				var vote = yield createVote(topic, newVote())
				yield createSignatures(vote, Config.votesRequired - 1)

				var res = yield this.request("/initiatives/" + initiative.uuid)
				res.statusCode.must.equal(200)
				res.body.must.not.include(t("SEND_TO_PARLIAMENT"))
			})

			it("must render send to parliament button if enough signatures",
				function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					phase: "sign"
				}))

				var topic = yield createTopic(newTopic({
					id: initiative.uuid,
					creatorId: this.user.id,
					sourcePartnerId: this.partner.id,
					status: "voting"
				}))

				var vote = yield createVote(topic, newVote())
				yield createSignatures(vote, Config.votesRequired)

				var res = yield this.request("/initiatives/" + initiative.uuid)
				res.statusCode.must.equal(200)
				res.body.must.include(t("SEND_TO_PARLIAMENT"))
			})

			it("must render send to parliament button if has paper signatures",
				function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					phase: "sign",
					has_paper_signatures: true
				}))

				var topic = yield createTopic(newTopic({
					id: initiative.uuid,
					creatorId: this.user.id,
					sourcePartnerId: this.partner.id,
					status: "voting"
				}))

				var vote = yield createVote(topic, newVote())
				yield createSignatures(vote, 1)

				var res = yield this.request("/initiatives/" + initiative.uuid)
				res.statusCode.must.equal(200)
				res.body.must.include(t("SEND_TO_PARLIAMENT"))
			})

			it("must not render send to parliament button if only has paper signatures", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					phase: "sign",
					has_paper_signatures: true
				}))

				var topic = yield createTopic(newTopic({
					id: initiative.uuid,
					creatorId: this.user.id,
					sourcePartnerId: this.partner.id,
					status: "voting"
				}))

				yield createVote(topic, newVote())

				var res = yield this.request("/initiatives/" + initiative.uuid)
				res.statusCode.must.equal(200)
				res.body.must.not.include(t("SEND_TO_PARLIAMENT"))
			})

			it("must not show event creation button if in edit phase", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					phase: "edit"
				}))

				yield createTopic(newTopic({
					id: initiative.uuid,
					creatorId: this.user.id,
					sourcePartnerId: this.partner.id,
					visibility: "public"
				}))

				var res = yield this.request("/initiatives/" + initiative.uuid)
				res.statusCode.must.equal(200)
				res.body.must.not.include(t("CREATE_INITIATIVE_EVENT_BUTTON"))
			})

			EVENTABLE_PHASES.forEach(function(phase) {
				it(`must show event creation button if in ${phase} phase`, function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative({
						phase: phase
					}))

					var topic = yield createTopic(newTopic({
						id: initiative.uuid,
						creatorId: this.user.id,
						sourcePartnerId: this.partner.id,
						status: "voting"
					}))

					yield createVote(topic, newVote())

					var res = yield this.request("/initiatives/" + initiative.uuid)
					res.statusCode.must.equal(200)
					res.body.must.include(t("CREATE_INITIATIVE_EVENT_BUTTON"))
				})
			})

			it("must not show event creation button if lacking permission",
				function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					phase: "sign"
				}))

				var topic = yield createTopic(newTopic({
					id: initiative.uuid,
					creatorId: (yield createUser(newUser())).id,
					sourcePartnerId: this.partner.id,
					status: "voting"
				}))

				yield createVote(topic, newVote())

				var res = yield this.request("/initiatives/" + initiative.uuid)
				res.statusCode.must.equal(200)
				res.body.must.not.include(t("CREATE_INITIATIVE_EVENT_BUTTON"))
			})

			describe("when signed", function() {
				beforeEach(function*() {
					this.initiative = yield initiativesDb.create(new ValidInitiative({
						phase: "sign"
					}))

					this.topic = yield createTopic(newTopic({
						id: this.initiative.uuid,
						creatorId: (yield createUser(newUser())).id,
						sourcePartnerId: this.partner.id,
						status: "voting"
					}))

					this.vote = yield createVote(this.topic, newVote({
						endsAt: DateFns.addDays(new Date, 1)
					}))

					this.yesAndNo = yield createOptions(this.vote)
				})

				it("must not show thanks if not signed", function*() {
					var res = yield this.request("/initiatives/" + this.initiative.uuid)
					res.statusCode.must.equal(200)
					res.body.must.not.include(t("THANKS_FOR_SIGNING"))
					res.body.must.not.include(t("THANKS_FOR_SIGNING_AGAIN"))
				})

				it("must show thanks without donate form", function*() {
					yield createSignature(newSignature({
						userId: this.user.id,
						voteId: this.vote.id,
						optionId: this.yesAndNo[0]
					}))

					var res = yield this.request("/initiatives/" + this.initiative.uuid)
					res.statusCode.must.equal(200)
					res.body.must.include(t("THANKS_FOR_SIGNING"))
					res.body.must.not.include("donate-form")
				})

				it("must not show thanks if signed another initiative", function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative({
						phase: "sign"
					}))

					var topic = yield createTopic(newTopic({
						id: initiative.uuid,
						creatorId: this.topic.creatorId,
						sourcePartnerId: this.partner.id,
						status: "voting"
					}))

					var vote = yield createVote(topic, newVote({
						endsAt: DateFns.addDays(new Date, 1)
					}))

					var yesAndNo = yield createOptions(this.vote)

					yield createSignature(newSignature({
						userId: this.user.id,
						voteId: vote.id,
						optionId: yesAndNo[0]
					}))

					var res = yield this.request("/initiatives/" + this.initiative.uuid)
					res.statusCode.must.equal(200)
					res.body.must.not.include(t("THANKS_FOR_SIGNING"))
					res.body.must.not.include(t("THANKS_FOR_SIGNING_AGAIN"))
				})

				it("must not show thanks if another user signed", function*() {
					yield createSignature(newSignature({
						userId: (yield createUser(newUser())).id,
						voteId: this.vote.id,
						optionId: this.yesAndNo[0]
					}))

					var res = yield this.request("/initiatives/" + this.initiative.uuid)
					res.statusCode.must.equal(200)
					res.body.must.not.include(t("THANKS_FOR_SIGNING"))
					res.body.must.not.include(t("THANKS_FOR_SIGNING_AGAIN"))
				})

				it("must not show thanks if hidden", function*() {
					yield createSignature(newSignature({
						userId: this.user.id,
						voteId: this.vote.id,
						optionId: this.yesAndNo[0]
					}))

					yield signaturesDb.create({
						initiative_uuid: this.initiative.uuid,
						user_uuid: this.user.id,
						hidden: true
					})

					var res = yield this.request("/initiatives/" + this.initiative.uuid)
					res.statusCode.must.equal(200)
					res.body.must.not.include(t("THANKS_FOR_SIGNING"))
					res.body.must.not.include(t("THANKS_FOR_SIGNING_AGAIN"))
				})

				it("must not show thanks if signed and then revoked", function*() {
					yield createSignature(newSignature({
						userId: this.user.id,
						voteId: this.vote.id,
						optionId: this.yesAndNo[0],
						createdAt: DateFns.addMinutes(new Date, -1)
					}))

					yield createSignature(newSignature({
						userId: this.user.id,
						voteId: this.vote.id,
						optionId: this.yesAndNo[1],
						createdAt: new Date
					}))

					var res = yield this.request("/initiatives/" + this.initiative.uuid)
					res.statusCode.must.equal(200)
					res.body.must.not.include(t("THANKS_FOR_SIGNING"))
					res.body.must.not.include(t("THANKS_FOR_SIGNING_AGAIN"))
				})
			})
		})
	})

	describe(`GET /:id with image/*`, function() {
		beforeEach(function*() {
			this.user = yield createUser(newUser())
			this.partner = yield createPartner(newPartner({id: Config.apiPartnerId}))

			this.initiative = yield initiativesDb.create(new ValidInitiative)

			yield createTopic(newTopic({
				id: this.initiative.uuid,
				creatorId: (yield createUser(newUser())).id,
				sourcePartnerId: this.partner.id,
				visibility: "public"
			}))
		})

		it("must respond with image if Accept is image/*", function*() {
			yield imagesDb.create({
				initiative_uuid: this.initiative.uuid,
				data: PNG,
				type: "image/png",
				preview: PNG_PREVIEW
			})

			var res = yield this.request("/initiatives/" + this.initiative.uuid, {
				headers: {Accept: "image/*"}
			})

			res.statusCode.must.equal(200)
			res.headers["content-type"].must.equal("image/png")
			res.headers["content-length"].must.equal(String(PNG.length))
			new Buffer(res.body).equals(PNG_PREVIEW).must.be.true()
		})

		it("must respond with image if Accept matches", function*() {
			yield imagesDb.create({
				initiative_uuid: this.initiative.uuid,
				data: PNG,
				type: "image/png",
				preview: PNG_PREVIEW
			})

			var res = yield this.request("/initiatives/" + this.initiative.uuid, {
				headers: {Accept: "image/png"}
			})

			res.statusCode.must.equal(200)
			res.headers["content-type"].must.equal("image/png")
			res.headers["content-length"].must.equal(String(PNG.length))
			new Buffer(res.body).equals(PNG_PREVIEW).must.be.true()
		})

		it("must respond with image if extension matches type", function*() {
			yield imagesDb.create({
				initiative_uuid: this.initiative.uuid,
				data: PNG,
				type: "image/png",
				preview: PNG_PREVIEW
			})

			var res = yield this.request(`/initiatives/${this.initiative.uuid}.png`)
			res.statusCode.must.equal(200)
			res.headers["content-type"].must.equal("image/png")
			res.headers["content-length"].must.equal(String(PNG.length))
			new Buffer(res.body).equals(PNG_PREVIEW).must.be.true()
		})

		it("must respond with 406 if no image", function*() {
			var res = yield this.request("/initiatives/" + this.initiative.uuid, {
				headers: {Accept: "image/*"}
			})

			res.statusCode.must.equal(406)
		})

		it("must respond with 406 if type doesn't match", function*() {
			yield imagesDb.create({
				initiative_uuid: this.initiative.uuid,
				data: PNG,
				type: "image/png",
				preview: PNG_PREVIEW
			})

			var res = yield this.request("/initiatives/" + this.initiative.uuid, {
				headers: {Accept: "image/jpeg"}
			})

			res.statusCode.must.equal(406)
		})

		it("must respond 406 if extension doesn't match type", function*() {
			yield imagesDb.create({
				initiative_uuid: this.initiative.uuid,
				data: PNG,
				type: "image/png",
				preview: PNG_PREVIEW
			})

			var res = yield this.request(`/initiatives/${this.initiative.uuid}.jpeg`)
			res.statusCode.must.equal(406)
		})
	})

	describe(`GET /:id with ${INITIATIVE_TYPE}`, function() {
		beforeEach(function*() {
			this.user = yield createUser(newUser())
			this.partner = yield createPartner(newPartner({id: Config.apiPartnerId}))
		})

		it("must respond with 403 for a private initiative", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative)

			yield createTopic(newTopic({
				id: initiative.uuid,
				creatorId: this.user.id,
				sourcePartnerId: this.partner.id,
				visibility: "private"
			}))

			var res = yield this.request("/initiatives/" + initiative.uuid, {
				headers: {Accept: INITIATIVE_TYPE}
			})

			res.statusCode.must.equal(403)
			res.statusMessage.must.match(/public/i)
		})

		it("must respond with 404 for a deleted initiative", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative)

			yield createTopic(newTopic({
				id: initiative.uuid,
				creatorId: this.user.id,
				sourcePartnerId: this.partner.id,
				visibility: "public",
				deletedAt: new Date
			}))

			var res = yield this.request("/initiatives/" + initiative.uuid, {
				headers: {Accept: INITIATIVE_TYPE}
			})

			res.statusCode.must.equal(404)
		})

		it("must respond with JSON", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative)

			yield createTopic(newTopic({
				id: initiative.uuid,
				title: "Better life for everyone.",
				creatorId: (yield createUser(newUser())).id,
				sourcePartnerId: this.partner.id,
				visibility: "public"
			}))

			var res = yield this.request("/initiatives/" + initiative.uuid, {
				headers: {Accept: INITIATIVE_TYPE}
			})

			res.statusCode.must.equal(200)
			res.headers["content-type"].must.equal(INITIATIVE_TYPE)
			res.headers["access-control-allow-origin"].must.equal("*")

			res.body.must.eql({
				title: "Better life for everyone.",
				signatureCount: 0
			})
		})

		it("must respond with JSON for external initiative", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				title: "Better life for everyone.",
				external: true
			}))

			var res = yield this.request("/initiatives/" + initiative.uuid, {
				headers: {Accept: INITIATIVE_TYPE}
			})

			res.statusCode.must.equal(200)

			res.body.must.eql({
				title: "Better life for everyone.",
				signatureCount: 0
			})
		})

		it("must respond with signature count", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				phase: "sign"
			}))

			var topic = yield createTopic(newTopic({
				id: initiative.uuid,
				title: "Better life for everyone.",
				creatorId: this.user.id,
				sourcePartnerId: this.partner.id,
				status: "voting"
			}))

			var vote = yield createVote(topic, newVote({endsAt: new Date}))
			yield createSignatures(vote, 5)

			var res = yield this.request("/initiatives/" + initiative.uuid, {
				headers: {Accept: INITIATIVE_TYPE}
			})

			res.statusCode.must.equal(200)

			res.body.must.eql({
				title: "Better life for everyone.",
				signatureCount: 5
			})
		})
	})

	describe(`GET /:id with ${ATOM_TYPE}`, function() {
		beforeEach(function*() {
			this.user = yield createUser(newUser())
			this.partner = yield createPartner(newPartner({id: Config.apiPartnerId}))
		})

		it("must respond with Atom feed", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative)

			var topic = yield createTopic(newTopic({
				id: initiative.uuid,
				title: "Better life for everyone.",
				creatorId: this.user.id,
				sourcePartnerId: this.partner.id,
				visibility: "public"
			}))

			var path = `/initiatives/${initiative.uuid}.atom`
			var res = yield this.request(path)
			res.statusCode.must.equal(200)
			res.headers["content-type"].must.equal(ATOM_TYPE)

			var feed = Atom.parse(res.body).feed
			feed.id.$.must.equal(Config.url + path)
			feed.updated.$.must.equal(topic.updatedAt.toJSON())

			feed.title.$.must.equal(t("ATOM_INITIATIVE_FEED_TITLE", {
				title: "Better life for everyone.",
			}))

			var links = _.indexBy(feed.link, (link) => link.rel)
			links.self.href.must.equal(Config.url + path)
			links.alternate.href.must.equal(Config.url)

			feed.author.name.$.must.equal(Config.title)
			feed.author.uri.$.must.equal(Config.url)
		})

		it("must respond given an external initiative", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				external: true,
				title: "Better life for everyone."
			}))

			var path = `/initiatives/${initiative.uuid}.atom`
			var res = yield this.request(path)
			res.statusCode.must.equal(200)
			res.headers["content-type"].must.equal(ATOM_TYPE)

			var feed = Atom.parse(res.body).feed
			feed.updated.$.must.equal(initiative.created_at.toJSON())

			feed.title.$.must.equal(t("ATOM_INITIATIVE_FEED_TITLE", {
				title: "Better life for everyone."
			}))
		})

		it("must use last event's time for feed update", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative)

			yield createTopic(newTopic({
				id: initiative.uuid,
				title: "Better life for everyone.",
				creatorId: this.user.id,
				sourcePartnerId: this.partner.id,
				visibility: "public"
			}))

			var author = yield createUser(newUser({name: "Johnny Lang"}))

			var events = yield eventsDb.create([new ValidEvent({
				initiative_uuid: initiative.uuid,
				created_by: author.id,
				title: "We sent xit.",
				content: "To somewhere.",
				created_at: new Date(2015, 5, 18),
				updated_at: new Date(2015, 5, 19),
				occurred_at: new Date(2015, 5, 20)
			}), new ValidEvent({
				initiative_uuid: initiative.uuid,
				created_by: author.id,
				title: "They got xit.",
				content: "From somewhere.",
				created_at: new Date(2015, 5, 21),
				updated_at: new Date(2015, 5, 22),
				occurred_at: new Date(2015, 5, 22)
			})])

			var path = `/initiatives/${initiative.uuid}.atom`
			var res = yield this.request(path)
			res.statusCode.must.equal(200)

			var feed = Atom.parse(res.body).feed
			feed.updated.$.must.equal(events[1].updated_at.toJSON())
		})

		it("must use initiative updated time if no events", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative)

			var topic = yield createTopic(newTopic({
				id: initiative.uuid,
				title: "Better life for everyone.",
				creatorId: this.user.id,
				sourcePartnerId: this.partner.id,
				visibility: "public"
			}))

			var res = yield this.request(`/initiatives/${initiative.uuid}.atom`)
			res.statusCode.must.equal(200)
			var feed = Atom.parse(res.body).feed
			feed.updated.$.must.equal(topic.updatedAt.toJSON())
		})

		it("must render initiative in sign phase with signature milestones",
			function*() {
			var milestones = [1, Config.votesRequired / 2, Config.votesRequired]

			var initiative = yield initiativesDb.create(new ValidInitiative({
				phase: "sign",
				signature_milestones: {
					[milestones[0]]: DateFns.addDays(new Date, -5),
					[milestones[1]]: DateFns.addDays(new Date, -3),
					[milestones[2]]: DateFns.addDays(new Date, -1)
				}
			}))

			var topic = yield createTopic(newTopic({
				id: initiative.uuid,
				creatorId: (yield createUser(newUser())).id,
				sourcePartnerId: this.partner.id,
				status: "voting"
			}))

			var vote = yield createVote(topic, newVote())
			yield createSignatures(vote, Config.votesRequired)

			var res = yield this.request(`/initiatives/${initiative.uuid}.atom`)
			res.statusCode.must.equal(200)

			var events = milestones.map((count) => ({
				id: "milestone-" + count,
				occurred_at: initiative.signature_milestones[count],
				title: t("SIGNATURE_MILESTONE_EVENT_TITLE", {milestone: count})
			}))

			Atom.parse(res.body).feed.entry.forEach(function(entry, i) {
				var event = events[i]
				var id = `${Config.url}/initiatives`
				id += `/${initiative.uuid}/events/${event.id}`

				entry.must.eql({
					id: {$: id},
					updated: {$: event.occurred_at.toJSON()},
					published: {$: event.occurred_at.toJSON()},
					title: {$: event.title}
				})
			})
		})

		it("must render initiative in parliament", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				phase: "parliament",
				external: true,
				sent_to_parliament_at: new Date(2015, 5, 1)
			}))

			var res = yield this.request(`/initiatives/${initiative.uuid}.atom`)
			res.statusCode.must.equal(200)

			var entry = Atom.parse(res.body).feed.entry
			var id = `${Config.url}/initiatives`
			id += `/${initiative.uuid}/events/sent-to-parliament`

			entry.must.eql({
				id: {$: id},
				updated: {$: initiative.sent_to_parliament_at.toJSON()},
				published: {$: initiative.sent_to_parliament_at.toJSON()},
				title: {$: t("INITIATIVE_SENT_TO_PARLIAMENT_TITLE")},
				content: {type: "text", $: t("INITIATIVE_SENT_TO_PARLIAMENT_BODY")}
			})
		})

		it("must render initiative in parliament and received event", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				phase: "parliament",
				external: true
			}))

			var event = yield eventsDb.create(new ValidEvent({
				initiative_uuid: initiative.uuid,
				created_at: pseudoDateTime(),
				updated_at: pseudoDateTime(),
				occurred_at: pseudoDateTime(),
				type: "parliament-received",
				origin: "parliament"
			}))

			var res = yield this.request(`/initiatives/${initiative.uuid}.atom`)
			res.statusCode.must.equal(200)

			var entry = Atom.parse(res.body).feed.entry
			var id = `${Config.url}/initiatives`
			id += `/${initiative.uuid}/events/${event.id}`

			entry.must.eql({
				id: {$: id},
				updated: {$: event.updated_at.toJSON()},
				published: {$: event.occurred_at.toJSON()},
				title: {$: t("PARLIAMENT_RECEIVED")}
			})
		})

		it("must render initiative in parliament and accepted event", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				phase: "parliament",
				external: true
			}))

			var event = yield eventsDb.create(new ValidEvent({
				initiative_uuid: initiative.uuid,
				created_at: pseudoDateTime(),
				updated_at: pseudoDateTime(),
				occurred_at: pseudoDateTime(),
				type: "parliament-accepted",
				content: {committee: "Keskkonnakomisjon"},
				origin: "parliament"
			}))

			var res = yield this.request(`/initiatives/${initiative.uuid}.atom`)
			res.statusCode.must.equal(200)

			var entry = Atom.parse(res.body).feed.entry
			var id = `${Config.url}/initiatives`
			id += `/${initiative.uuid}/events/${event.id}`

			entry.must.eql({
				id: {$: id},
				updated: {$: event.updated_at.toJSON()},
				published: {$: event.occurred_at.toJSON()},
				title: {$: t("PARLIAMENT_ACCEPTED")},
				content: {
					type: "text",
					$: t("PARLIAMENT_ACCEPTED_SENT_TO_COMMITTEE", {
						committee: "Keskkonnakomisjon"
					})
				}
			})
		})

		it("must render initiative in parliament and board meeting event",
			function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				phase: "parliament",
				external: true
			}))

			var event = yield eventsDb.create(new ValidEvent({
				initiative_uuid: initiative.uuid,
				created_at: pseudoDateTime(),
				updated_at: pseudoDateTime(),
				occurred_at: pseudoDateTime(),
				type: "parliament-board-meeting",
				content: {},
				origin: "parliament"
			}))

			var res = yield this.request(`/initiatives/${initiative.uuid}.atom`)
			res.statusCode.must.equal(200)

			var entry = Atom.parse(res.body).feed.entry
			var id = `${Config.url}/initiatives`
			id += `/${initiative.uuid}/events/${event.id}`

			entry.must.eql({
				id: {$: id},
				updated: {$: event.updated_at.toJSON()},
				published: {$: event.occurred_at.toJSON()},
				title: {$: t("PARLIAMENT_BOARD_MEETING")}
			})
		})

		it("must render initiative in parliament and committee meeting event",
			function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				phase: "parliament",
				external: true
			}))

			var event = yield eventsDb.create(new ValidEvent({
				initiative_uuid: initiative.uuid,
				created_at: pseudoDateTime(),
				updated_at: pseudoDateTime(),
				occurred_at: pseudoDateTime(),
				type: "parliament-committee-meeting",
				content: {committee: "Keskkonnakomisjon"},
				origin: "parliament"
			}))

			var res = yield this.request(`/initiatives/${initiative.uuid}.atom`)
			res.statusCode.must.equal(200)

			var entry = Atom.parse(res.body).feed.entry
			var id = `${Config.url}/initiatives`
			id += `/${initiative.uuid}/events/${event.id}`

			entry.must.eql({
				id: {$: id},
				updated: {$: event.updated_at.toJSON()},
				published: {$: event.occurred_at.toJSON()},

				title: {$: t("PARLIAMENT_COMMITTEE_MEETING_BY", {
					committee: "Keskkonnakomisjon"
				})}
			})
		})

		COMMITTEE_MEETING_DECISIONS.forEach(function(decision) {
			it(`must render initiative in parliament and committee meeting event with ${decision} decision`, function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					phase: "parliament",
					external: true
				}))

				var event = yield eventsDb.create(new ValidEvent({
					initiative_uuid: initiative.uuid,
					created_at: pseudoDateTime(),
					updated_at: pseudoDateTime(),
					occurred_at: pseudoDateTime(),
					type: "parliament-committee-meeting",
					content: {committee: "Keskkonnakomisjon", decision: decision},
					origin: "parliament"
				}))

				var res = yield this.request(`/initiatives/${initiative.uuid}.atom`)
				res.statusCode.must.equal(200)

				var entry = Atom.parse(res.body).feed.entry
				var id = `${Config.url}/initiatives`
				id += `/${initiative.uuid}/events/${event.id}`

				entry.must.eql({
					id: {$: id},
					updated: {$: event.updated_at.toJSON()},
					published: {$: event.occurred_at.toJSON()},

					title: {$: t("PARLIAMENT_COMMITTEE_MEETING_BY", {
						committee: "Keskkonnakomisjon"
					})},

					content: {type: "text", $:
						decision == "continue"
						? t("PARLIAMENT_MEETING_DECISION_CONTINUE")
						: decision == "reject"
						? t("PARLIAMENT_MEETING_DECISION_REJECT")
						: decision == "forward"
						? t("PARLIAMENT_MEETING_DECISION_FORWARD")
						: decision == "solve-differently"
						? t("PARLIAMENT_MEETING_DECISION_SOLVE_DIFFERENTLY")
						: null
					}
				})
			})
		})

		it("must render initiative in parliament and committee meeting event with summary", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				phase: "parliament",
				external: true
			}))

			var event = yield eventsDb.create(new ValidEvent({
				initiative_uuid: initiative.uuid,
				created_at: pseudoDateTime(),
				updated_at: pseudoDateTime(),
				occurred_at: pseudoDateTime(),
				type: "parliament-committee-meeting",
				content: {committee: "Keskkonnakomisjon", summary: "Talking happened."},
				origin: "parliament"
			}))

			var res = yield this.request(`/initiatives/${initiative.uuid}.atom`)
			res.statusCode.must.equal(200)

			var entry = Atom.parse(res.body).feed.entry
			var id = `${Config.url}/initiatives`
			id += `/${initiative.uuid}/events/${event.id}`

			entry.must.eql({
				id: {$: id},
				updated: {$: event.updated_at.toJSON()},
				published: {$: event.occurred_at.toJSON()},

				title: {$: t("PARLIAMENT_COMMITTEE_MEETING_BY", {
					committee: "Keskkonnakomisjon"
				})},

				content: {type: "text", $: "Talking happened."}
			})
		})

		it("must render initiative in parliament and decision event", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				phase: "parliament",
				external: true
			}))

			var event = yield eventsDb.create(new ValidEvent({
				initiative_uuid: initiative.uuid,
				created_at: pseudoDateTime(),
				updated_at: pseudoDateTime(),
				occurred_at: pseudoDateTime(),
				type: "parliament-decision",
				content: {},
				origin: "parliament"
			}))

			var res = yield this.request(`/initiatives/${initiative.uuid}.atom`)
			res.statusCode.must.equal(200)

			var entry = Atom.parse(res.body).feed.entry
			var id = `${Config.url}/initiatives`
			id += `/${initiative.uuid}/events/${event.id}`

			entry.must.eql({
				id: {$: id},
				updated: {$: event.updated_at.toJSON()},
				published: {$: event.occurred_at.toJSON()},
				title: {$: t("PARLIAMENT_DECISION")}
			})
		})

		it("must render initiative in parliament and decision event with summary", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				phase: "parliament",
				external: true
			}))

			var event = yield eventsDb.create(new ValidEvent({
				initiative_uuid: initiative.uuid,
				created_at: pseudoDateTime(),
				updated_at: pseudoDateTime(),
				occurred_at: pseudoDateTime(),
				type: "parliament-decision",
				content: {summary: "Talking happened."},
				origin: "parliament"
			}))

			var res = yield this.request(`/initiatives/${initiative.uuid}.atom`)
			res.statusCode.must.equal(200)

			var entry = Atom.parse(res.body).feed.entry
			var id = `${Config.url}/initiatives`
			id += `/${initiative.uuid}/events/${event.id}`

			entry.must.eql({
				id: {$: id},
				updated: {$: event.updated_at.toJSON()},
				published: {$: event.occurred_at.toJSON()},
				title: {$: t("PARLIAMENT_DECISION")},
				content: {type: "text", $: "Talking happened."}
			})
		})

		it("must render initiative in parliament and letter event", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				phase: "parliament",
				external: true
			}))

			var event = yield eventsDb.create(new ValidEvent({
				initiative_uuid: initiative.uuid,
				created_at: pseudoDateTime(),
				updated_at: pseudoDateTime(),
				occurred_at: pseudoDateTime(),
				origin: "parliament",
				type: "parliament-letter",

				content: {
					medium: "email",
					from: "John Wick",
					direction: "incoming",
					title: "Important Question",
					summary: "What to do next?"
				}
			}))

			var res = yield this.request(`/initiatives/${initiative.uuid}.atom`)
			res.statusCode.must.equal(200)

			var entry = Atom.parse(res.body).feed.entry
			var id = `${Config.url}/initiatives`
			id += `/${initiative.uuid}/events/${event.id}`

			entry.must.eql({
				id: {$: id},
				updated: {$: event.updated_at.toJSON()},
				published: {$: event.occurred_at.toJSON()},
				title: {$: t("PARLIAMENT_LETTER_INCOMING")},

				content: {type: "text", $: outdent`
					${t("PARLIAMENT_LETTER_TITLE")}: Important Question
					${t("PARLIAMENT_LETTER_FROM")}: John Wick

					What to do next?
				`}
			})
		})

		it("must render initiative in parliament and interpellation event",
			function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				phase: "parliament",
				external: true
			}))

			var event = yield eventsDb.create(new ValidEvent({
				initiative_uuid: initiative.uuid,
				created_at: pseudoDateTime(),
				updated_at: pseudoDateTime(),
				occurred_at: pseudoDateTime(),
				origin: "parliament",
				type: "parliament-interpellation",
				content: {to: "John Wick", deadline: "2015-07-10"}
			}))

			var res = yield this.request(`/initiatives/${initiative.uuid}.atom`)
			res.statusCode.must.equal(200)

			var entry = Atom.parse(res.body).feed.entry
			var id = `${Config.url}/initiatives`
			id += `/${initiative.uuid}/events/${event.id}`

			entry.must.eql({
				id: {$: id},
				updated: {$: event.updated_at.toJSON()},
				published: {$: event.occurred_at.toJSON()},
				title: {$: t("PARLIAMENT_INTERPELLATION")},

				content: {type: "text", $: outdent`
					${t("PARLIAMENT_INTERPELLATION_TO")}: John Wick
					${t("PARLIAMENT_INTERPELLATION_DEADLINE")}: 2015-07-10
				`}
			})
		})

		it("must render initiative in parliament and national matter event",
			function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				phase: "parliament",
				external: true
			}))

			var event = yield eventsDb.create(new ValidEvent({
				initiative_uuid: initiative.uuid,
				created_at: pseudoDateTime(),
				updated_at: pseudoDateTime(),
				occurred_at: pseudoDateTime(),
				origin: "parliament",
				type: "parliament-national-matter",
				content: {}
			}))

			var res = yield this.request(`/initiatives/${initiative.uuid}.atom`)
			res.statusCode.must.equal(200)

			var entry = Atom.parse(res.body).feed.entry
			var id = `${Config.url}/initiatives`
			id += `/${initiative.uuid}/events/${event.id}`

			entry.must.eql({
				id: {$: id},
				updated: {$: event.updated_at.toJSON()},
				published: {$: event.occurred_at.toJSON()},
				title: {$: t("PARLIAMENT_NATIONAL_MATTER")}
			})
		})

		PARLIAMENT_DECISIONS.forEach(function(decision) {
			it(`must respond if initiative in parliament and finished with ${decision} decision`, function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					phase: "parliament",
					sent_to_parliament_at: DateFns.addDays(new Date, -30),
					parliament_decision: decision,
					finished_in_parliament_at: DateFns.addDays(new Date, -5)
				}))

				yield createTopic(newTopic({
					id: initiative.uuid,
					title: "Better life for everyone.",
					creatorId: this.user.id,
					sourcePartnerId: this.partner.id,
					status: "followUp"
				}))

				var res = yield this.request(`/initiatives/${initiative.uuid}.atom`)
				res.statusCode.must.equal(200)

				var entries = Atom.parse(res.body).feed.entry
				entries.length.must.equal(2)
				entries[0].id.$.must.match(/\/sent-to-parliament$/)

				var id = `${Config.url}/initiatives`
				id += `/${initiative.uuid}/events/parliament-finished`

				entries[1].must.eql({
					id: {$: id},
					updated: {$: initiative.finished_in_parliament_at.toJSON()},
					published: {$: initiative.finished_in_parliament_at.toJSON()},
					title: {$: t("PARLIAMENT_FINISHED")},

					content: {type: "text", $:
						decision == "reject"
						? t("PARLIAMENT_DECISION_REJECT")
						: decision == "forward"
						? t("PARLIAMENT_DECISION_FORWARD")
						: decision == "solve-differently"
						? t("PARLIAMENT_DECISION_SOLVE_DIFFERENTLY")
						: null
					}
				})
			})

			it(`must respond if initiative in parliament and finished event with ${decision} decision`, function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					phase: "parliament",
					sent_to_parliament_at: DateFns.addDays(new Date, -30),
					parliament_decision: decision,
					finished_in_parliament_at: DateFns.addDays(new Date, -5)
				}))

				yield createTopic(newTopic({
					id: initiative.uuid,
					title: "Better life for everyone.",
					creatorId: this.user.id,
					sourcePartnerId: this.partner.id,
					status: "followUp"
				}))

				var event = yield eventsDb.create(new ValidEvent({
					initiative_uuid: initiative.uuid,
					occurred_at: DateFns.addDays(new Date, -3),
					type: "parliament-finished",
					content: null,
					origin: "parliament"
				}))

				var res = yield this.request(`/initiatives/${initiative.uuid}.atom`)
				res.statusCode.must.equal(200)

				var entries = Atom.parse(res.body).feed.entry
				entries.length.must.equal(2)
				entries[0].id.$.must.match(/\/sent-to-parliament$/)

				var id = `${Config.url}/initiatives`
				id += `/${initiative.uuid}/events/${event.id}`

				entries[1].must.eql({
					id: {$: id},
					updated: {$: event.updated_at.toJSON()},
					published: {$: event.occurred_at.toJSON()},
					title: {$: t("PARLIAMENT_FINISHED")},

					content: {type: "text", $:
						decision == "reject"
						? t("PARLIAMENT_DECISION_REJECT")
						: decision == "forward"
						? t("PARLIAMENT_DECISION_FORWARD")
						: decision == "solve-differently"
						? t("PARLIAMENT_DECISION_SOLVE_DIFFERENTLY")
						: null
					}
				})
			})
		})

		it("must render initiative in government", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				phase: "parliament",
				external: true,
				sent_to_government_at: new Date(2015, 5, 1),
				government_agency: "Sidususministeerium"
			}))

			var res = yield this.request(`/initiatives/${initiative.uuid}.atom`)
			res.statusCode.must.equal(200)

			var entry = Atom.parse(res.body).feed.entry
			var id = `${Config.url}/initiatives`
			id += `/${initiative.uuid}/events/sent-to-government`

			entry.must.eql({
				id: {$: id},
				updated: {$: initiative.sent_to_government_at.toJSON()},
				published: {$: initiative.sent_to_government_at.toJSON()},

				title: {$: t("EVENT_SENT_TO_GOVERNMENT_TITLE_WITH_AGENCY", {
					agency: initiative.government_agency
				})}
			})
		})

		it("must render initiative in government that's finished", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				phase: "parliament",
				external: true,
				sent_to_government_at: new Date(2015, 5, 1),
				government_agency: "Sidususministeerium",
				finished_in_government_at: new Date(2015, 5, 5),
				government_decision: "Anda alla."
			}))

			var res = yield this.request(`/initiatives/${initiative.uuid}.atom`)
			res.statusCode.must.equal(200)

			var entries = Atom.parse(res.body).feed.entry
			entries.length.must.equal(2)
			entries[0].id.$.must.match(/\/sent-to-government$/)

			var id = `${Config.url}/initiatives`
			id += `/${initiative.uuid}/events/finished-in-government`

			entries[1].must.eql({
				id: {$: id},
				updated: {$: initiative.finished_in_government_at.toJSON()},
				published: {$: initiative.finished_in_government_at.toJSON()},

				title: {$: t("EVENT_FINISHED_IN_GOVERNMENT_TITLE_WITH_AGENCY", {
					agency: initiative.government_agency
				})},

				content: {type: "text", $: t("EVENT_FINISHED_IN_GOVERNMENT_CONTENT", {
					decision: initiative.government_decision
				})}
			})
		})

		it("must render initiative with text event", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				phase: "parliament",
				external: true
			}))

			var author = yield createUser(newUser({name: "Johnny Lang"}))

			var event = yield eventsDb.create(new ValidEvent({
				initiative_uuid: initiative.uuid,
				created_by: author.id,
				title: "This just in.",
				content: "Everything is fine!",
				created_at: pseudoDateTime(),
				occurred_at: pseudoDateTime()
			}))

			var res = yield this.request(`/initiatives/${initiative.uuid}.atom`)
			res.statusCode.must.equal(200)

			var id = `${Config.url}/initiatives`
			id += `/${initiative.uuid}/events/${event.id}`

			Atom.parse(res.body).feed.entry.must.eql({
				id: {$: id},
				category: {term: "initiator"},
				updated: {$: event.updated_at.toJSON()},
				published: {$: event.occurred_at.toJSON()},
				title: {$: event.title},
				content: {type: "text", $: event.content},
				author: {name: {$: author.name}}
			})
		})
	})

	describe("PUT /:id", function() {
		require("root/test/time")(+new Date(2015, 5, 18))

		beforeEach(function*() {
			this.partner = yield createPartner(newPartner({id: Config.apiPartnerId}))
		})

		describe("when logged in", function() {
			require("root/test/fixtures").user()

			describe("given visibility=public", function() {
				it("must render update visibility page", function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative)

					yield createTopic(newTopic({
						id: initiative.uuid,
						creatorId: this.user.id,
						sourcePartnerId: this.partner.id,
						visibility: "private"
					}))

					var res = yield this.request("/initiatives/" + initiative.uuid, {
						method: "PUT",
						form: {_csrf_token: this.csrfToken, visibility: "public"}
					})

					res.statusCode.must.equal(200)
					res.body.must.include(t("DEADLINE_EXPLANATION"))
					res.body.must.include(t("PUBLISH_TOPIC"))
				})

				it("must update initiative", function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative)

					var topic = yield createTopic(newTopic({
						id: initiative.uuid,
						creatorId: this.user.id,
						sourcePartnerId: this.partner.id,
						visibility: "private"
					}))

					var today = DateFns.startOfDay(new Date)
					var endsAt = DateFns.endOfDay(DateFns.addDays(today, 5))

					var updated = 0
					this.router.put(`/api/users/self/topics/${topic.id}`,
						function(req, res) {
						++updated
						req.body.must.eql({visibility: "public", endsAt: endsAt.toJSON()})
						res.end()
					})

					var res = yield this.request(`/initiatives/${initiative.uuid}`, {
						method: "PUT",
						form: {
							_csrf_token: this.csrfToken,
							visibility: "public",
							endsAt: formatIsoDate(endsAt)
						}
					})

					updated.must.equal(1)
					res.statusCode.must.equal(303)
					res.headers.location.must.equal(`/initiatives/${initiative.uuid}`)

					var flash = parseFlashFromCookies(res.headers["set-cookie"])
					flash.notice.must.equal(t("PUBLISHED_INITIATIVE"))
				})

				it("must clear end email when setting discussion end time",
					function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative({
						discussion_end_email_sent_at: new Date
					}))

					var topic = yield createTopic(newTopic({
						id: initiative.uuid,
						creatorId: this.user.id,
						sourcePartnerId: this.partner.id,
						visibility: "public"
					}))

					this.router.put(`/api/users/self/topics/${topic.id}`, endResponse)

					var res = yield this.request(`/initiatives/${initiative.uuid}`, {
						method: "PUT",
						form: {
							_csrf_token: this.csrfToken,
							visibility: "public",
							endsAt: formatIsoDate(
								DateFns.addDays(new Date, Config.minDeadlineDays)
							)
						}
					})

					res.statusCode.must.equal(303)

					yield initiativesDb.read(initiative).must.then.eql({
						__proto__: initiative,
						discussion_end_email_sent_at: null
					})
				})

				it("must respond with 422 if setting a short deadline", function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative({
						discussion_end_email_sent_at: new Date
					}))

					yield createTopic(newTopic({
						id: initiative.uuid,
						creatorId: this.user.id,
						sourcePartnerId: this.partner.id,
						visibility: "public"
					}))

					var res = yield this.request(`/initiatives/${initiative.uuid}`, {
						method: "PUT",
						form: {
							_csrf_token: this.csrfToken,
							visibility: "public",
							endsAt: formatIsoDate(
								DateFns.addDays(new Date, Config.minDeadlineDays - 1)
							)
						}
					})

					res.statusCode.must.equal(422)
					res.statusMessage.must.match(/deadline/i)
					yield initiativesDb.read(initiative).must.then.eql(initiative)
				})
			})

			describe("given status=voting", function() {
				it("must render update status for voting page", function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative)

					yield createTopic(newTopic({
						id: initiative.uuid,
						creatorId: this.user.id,
						sourcePartnerId: this.partner.id,
						createdAt: DateFns.addDays(new Date, -Config.minDeadlineDays),
						visibility: "public"
					}))

					var res = yield this.request("/initiatives/" + initiative.uuid, {
						method: "PUT",
						form: {_csrf_token: this.csrfToken, status: "voting"}
					})

					res.statusCode.must.equal(200)
					res.body.must.include(t("VOTE_DEADLINE_EXPLANATION"))
				})

				it("must update initiative", function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative)

					var topic = yield createTopic(newTopic({
						id: initiative.uuid,
						creatorId: this.user.id,
						sourcePartnerId: this.partner.id,
						createdAt: DateFns.addDays(new Date, -Config.minDeadlineDays),
						visibility: "public"
					}))

					var endsAt = DateFns.endOfDay(DateFns.addDays(new Date, 30))

					this.router.post(`/api/users/self/topics/${topic.id}/votes`,
						function(req, res) {
						req.body.must.eql({
							endsAt: endsAt.toJSON(),
							authType: "hard",
							voteType: "regular",
							delegationIsAllowed: false,
							options: [{value: "Yes"}, {value: "No"}]
						})

						res.end()
					})

					var res = yield this.request(`/initiatives/${initiative.uuid}`, {
						method: "PUT",
						form: {
							_csrf_token: this.csrfToken,
							status: "voting",
							endsAt: formatIsoDate(endsAt)
						}
					})

					res.statusCode.must.equal(303)
					res.headers.location.must.equal(`/initiatives/${initiative.uuid}`)

					var flash = parseFlashFromCookies(res.headers["set-cookie"])
					flash.notice.must.equal(t("INITIATIVE_SIGN_PHASE_UPDATED"))

					yield initiativesDb.search(sql`
						SELECT * FROM initiatives
					`).must.then.eql([{
						__proto__: initiative,
						phase: "sign"
					}])
				})

				it("must respond with 403 if less than 3 days passed", function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative)

					yield createTopic(newTopic({
						id: initiative.uuid,
						creatorId: this.user.id,
						sourcePartnerId: this.partner.id,
						createdAt: DateFns.addDays(new Date, -Config.minDeadlineDays + 1),
						visibility: "public"
					}))

					var res = yield this.request(`/initiatives/${initiative.uuid}`, {
						method: "PUT",
						form: {
							_csrf_token: this.csrfToken,
							status: "voting",
							endsAt: formatIsoDate(DateFns.addDays(new Date, 30))
						}
					})

					res.statusCode.must.equal(403)
					res.statusMessage.must.match(/sign phase/i)
					yield initiativesDb.read(initiative).must.then.eql(initiative)
				})

				it("must update initiative if on fast-track", function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative)

					var topic = yield createTopic(newTopic({
						id: initiative.uuid,
						creatorId: this.user.id,
						sourcePartnerId: this.partner.id,
						createdAt: DateFns.addDays(new Date, -Config.minDeadlineDays + 1),
						visibility: "public",
						categories: ["fast-track"]
					}))

					this.router.post(`/api/users/self/topics/${topic.id}/votes`,
						endResponse)

					var res = yield this.request(`/initiatives/${initiative.uuid}`, {
						method: "PUT",
						form: {
							_csrf_token: this.csrfToken,
							status: "voting",
							endsAt: formatIsoDate(DateFns.addDays(new Date, 30))
						}
					})

					res.statusCode.must.equal(303)
					res.headers.location.must.equal(`/initiatives/${initiative.uuid}`)

					yield initiativesDb.search(sql`
						SELECT * FROM initiatives
					`).must.then.eql([{
						__proto__: initiative,
						phase: "sign"
					}])
				})

				it("must respond with 422 if setting a short deadline", function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative)

					yield createTopic(newTopic({
						id: initiative.uuid,
						creatorId: this.user.id,
						sourcePartnerId: this.partner.id,
						createdAt: DateFns.addDays(new Date, -Config.minDeadlineDays),
						visibility: "public"
					}))

					var res = yield this.request(`/initiatives/${initiative.uuid}`, {
						method: "PUT",
						form: {
							_csrf_token: this.csrfToken,
							status: "voting",
							endsAt: formatIsoDate(
								DateFns.addDays(new Date, Config.minDeadlineDays - 1)
							)
						}
					})

					res.statusCode.must.equal(422)
					res.statusMessage.must.match(/deadline/i)
					yield initiativesDb.read(initiative).must.then.eql(initiative)
				})

				it("must clear end email when setting signing end time", function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative({
						phase: "sign",
						discussion_end_email_sent_at: new Date,
						signing_end_email_sent_at: new Date
					}))

					var topic = yield createTopic(newTopic({
						id: initiative.uuid,
						creatorId: this.user.id,
						sourcePartnerId: this.partner.id,
						status: "voting"
					}))

					var vote = yield createVote(topic, newVote())

					this.router.put(
						`/api/users/self/topics/${topic.id}/votes/${vote.id}`,
						endResponse
					)

					var res = yield this.request(`/initiatives/${initiative.uuid}`, {
						method: "PUT",
						form: {
							_csrf_token: this.csrfToken,
							status: "voting",
							endsAt: formatIsoDate(
								DateFns.addDays(new Date, Config.minDeadlineDays)
							)
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
					var initiative = yield initiativesDb.create(new ValidInitiative)

					var topic = yield createTopic(newTopic({
						id: initiative.uuid,
						title: "Better life.",
						creatorId: this.user.id,
						sourcePartnerId: this.partner.id,
						createdAt: DateFns.addDays(new Date, -Config.minDeadlineDays),
						visibility: "public"
					}))

					this.router.post(
						`/api/users/self/topics/${topic.id}/votes`,
						endResponse
					)

					var subscriptions = yield subscriptionsDb.create([
						new ValidSubscription({
							initiative_uuid: initiative.uuid,
							confirmed_at: new Date,
							official_interest: false
						}),

						new ValidSubscription({
							initiative_uuid: null,
							confirmed_at: new Date,
							official_interest: false
						}),

						new ValidSubscription({
							initiative_uuid: initiative.uuid,
							confirmed_at: new Date
						}),

						new ValidSubscription({
							initiative_uuid: null,
							confirmed_at: new Date
						})
					])

					var res = yield this.request(`/initiatives/${initiative.uuid}`, {
						method: "PUT",
						form: {
							_csrf_token: this.csrfToken,
							status: "voting",
							endsAt: formatIsoDate(
								DateFns.addDays(new Date, Config.minDeadlineDays)
							)
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
						initiative_uuid: initiative.uuid,
						created_at: new Date,
						updated_at: new Date,
						origin: "status",

						title: t("SENT_TO_SIGNING_MESSAGE_TITLE", {
							initiativeTitle: topic.title
						}),

						text: renderEmail("SENT_TO_SIGNING_MESSAGE_BODY", {
							initiativeTitle: topic.title,
							initiativeUrl: `${Config.url}/initiatives/${initiative.uuid}`,
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
					var initiative = yield initiativesDb.create(new ValidInitiative({
						phase: "sign"
					}))

					var topic = yield createTopic(newTopic({
						id: initiative.uuid,
						creatorId: this.user.id,
						sourcePartnerId: this.partner.id,
						status: "voting"
					}))

					var vote = yield createVote(topic, newVote())
					yield createSignatures(vote, Config.votesRequired)

					var res = yield this.request("/initiatives/" + initiative.uuid, {
						method: "PUT",
						form: {_csrf_token: this.csrfToken, status: "followUp"}
					})

					res.statusCode.must.equal(200)
					res.body.must.include(t("SEND_TO_PARLIAMENT_HEADER"))
					res.body.must.include(t("SEND_TO_PARLIAMENT_TEXT"))
				})

				it("must render update status for parliament page if has paper signatures", function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative({
						phase: "sign",
						has_paper_signatures: true
					}))

					var topic = yield createTopic(newTopic({
						id: initiative.uuid,
						creatorId: this.user.id,
						sourcePartnerId: this.partner.id,
						status: "voting"
					}))

					var vote = yield createVote(topic, newVote())
					yield createSignatures(vote, 1)

					var res = yield this.request("/initiatives/" + initiative.uuid, {
						method: "PUT",
						form: {_csrf_token: this.csrfToken, status: "followUp"}
					})

					res.statusCode.must.equal(200)
				})

				it("must respond with 403 if initiative not successful", function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative({
						phase: "sign"
					}))

					var topic = yield createTopic(newTopic({
						id: initiative.uuid,
						creatorId: this.user.id,
						sourcePartnerId: this.partner.id,
						status: "voting"
					}))

					var vote = yield createVote(topic, newVote())
					yield createSignatures(vote, Config.votesRequired - 1)

					var res = yield this.request("/initiatives/" + initiative.uuid, {
						method: "PUT",
						form: {_csrf_token: this.csrfToken, status: "followUp"}
					})

					res.statusCode.must.equal(403)
					res.statusMessage.must.match(/parliament/i)
				})

				it("must respond with 403 if only has paper signatures", function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative({
						phase: "sign",
						has_paper_signatures: true
					}))

					var topic = yield createTopic(newTopic({
						id: initiative.uuid,
						creatorId: this.user.id,
						sourcePartnerId: this.partner.id,
						status: "voting"
					}))

					yield createVote(topic, newVote())

					var res = yield this.request("/initiatives/" + initiative.uuid, {
						method: "PUT",
						form: {_csrf_token: this.csrfToken, status: "followUp"}
					})

					res.statusCode.must.equal(403)
					res.statusMessage.must.match(/parliament/i)
				})

				it("must update initiative", function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative({
						phase: "sign"
					}))

					var topic = yield createTopic(newTopic({
						id: initiative.uuid,
						creatorId: this.user.id,
						sourcePartnerId: this.partner.id,
						status: "voting"
					}))

					var vote = yield createVote(topic, newVote())
					yield createSignatures(vote, Config.votesRequired)

					var updated = 0
					this.router.put(`/api/users/self/topics/${topic.id}`,
						function(req, res) {
						++updated
						req.body.must.eql({
							status: "followUp",
							contact: {name: "John", email: "john@example.com", phone: "42"}

						})
						res.end()
					})

					var res = yield this.request(`/initiatives/${initiative.uuid}`, {
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
					res.headers.location.must.equal(`/initiatives/${initiative.uuid}`)

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
					var initiative = yield initiativesDb.create(new ValidInitiative({
						phase: "sign"
					}))

					var topic = yield createTopic(newTopic({
						id: initiative.uuid,
						title: "Better life for everyone.",
						creatorId: this.user.id,
						sourcePartnerId: this.partner.id,
						status: "voting"
					}))

					var vote = yield createVote(topic, newVote())
					yield createSignatures(vote, Config.votesRequired)

					this.router.put(`/api/users/self/topics/${topic.id}`, endResponse)

					var subscriptions = yield subscriptionsDb.create([
						new ValidSubscription({
							initiative_uuid: initiative.uuid,
							confirmed_at: new Date,
							official_interest: false
						}),

						new ValidSubscription({
							initiative_uuid: null,
							confirmed_at: new Date,
							official_interest: false
						}),

						new ValidSubscription({
							initiative_uuid: initiative.uuid,
							confirmed_at: new Date
						}),

						new ValidSubscription({
							initiative_uuid: null,
							confirmed_at: new Date
						})
					])

					var res = yield this.request(`/initiatives/${initiative.uuid}`, {
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
						initiative_uuid: initiative.uuid,
						created_at: new Date,
						updated_at: new Date,
						origin: "status",

						title: t("SENT_TO_PARLIAMENT_MESSAGE_TITLE", {
							initiativeTitle: topic.title
						}),

						text: renderEmail("SENT_TO_PARLIAMENT_MESSAGE_BODY", {
							authorName: "John",
							initiativeTitle: topic.title,
							initiativeUrl: `${Config.url}/initiatives/${initiative.uuid}`,
							signatureCount: Config.votesRequired
						}),

						sent_at: new Date,
						sent_to: emails
					}])

					this.emails.length.must.equal(1)
					this.emails[0].envelope.to.must.eql(emails)
					var msg = String(this.emails[0].message)
					msg.match(/^Subject: .*/m)[0].must.include(topic.title)

					subscriptions.slice(2).forEach((s) => (
						msg.must.include(s.update_token)
					))
				})
			})

			describe("given local info", function() {
				it("must update attributes", function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative)

					yield createTopic(newTopic({
						id: initiative.uuid,
						creatorId: this.user.id,
						sourcePartnerId: this.partner.id
					}))

					var res = yield this.request(`/initiatives/${initiative.uuid}`, {
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
					res.headers.location.must.equal(`/initiatives/${initiative.uuid}`)

					yield initiativesDb.read(initiative).must.then.eql({
						__proto__: initiative,
						uuid: initiative.uuid,
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
				})

				it("must not update other initiatives", function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative)

					yield createTopic(newTopic({
						id: initiative.uuid,
						creatorId: this.user.id,
						sourcePartnerId: this.partner.id
					}))

					var other = yield initiativesDb.create(new ValidInitiative)

					var res = yield this.request(`/initiatives/${initiative.uuid}`, {
						method: "PUT",
						form: {_csrf_token: this.csrfToken, notes: "Hello, world"}
					})

					res.statusCode.must.equal(303)

					yield initiativesDb.search(sql`
						SELECT * FROM initiatives
					`).must.then.eql([
						{__proto__: initiative, notes: "Hello, world"},
						other,
					])
				})

				it("must throw 403 when not permitted to edit", function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative)

					yield createTopic(newTopic({
						id: initiative.uuid,
						creatorId: (yield createUser(newUser())).id,
						sourcePartnerId: this.partner.id,
						visibility: "public"
					}))

					var res = yield this.request(`/initiatives/${initiative.uuid}`, {
						method: "PUT",
						form: {_csrf_token: this.csrfToken, notes: "Hello, world"}
					})

					res.statusCode.must.equal(403)
					res.statusMessage.must.match(/permission to edit/i)
					yield initiativesDb.read(initiative).must.then.eql(initiative)
				})
			})
		})
	})

	describe("DELETE /:id", function() {
		beforeEach(function*() {
			this.partner = yield createPartner(newPartner({id: Config.apiPartnerId}))
		})

		describe("when logged in", function() {
			require("root/test/fixtures").user()

			it("must delete private initiative in edit phase", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative)

				var topic = yield createTopic(newTopic({
					id: initiative.uuid,
					creatorId: this.user.id,
					sourcePartnerId: this.partner.id
				}))

				this.router.delete(
					`/api/users/self/topics/${topic.id}`,
					endResponse
				)

				var res = yield this.request("/initiatives/" + initiative.uuid, {
					method: "POST",
					form: {_csrf_token: this.csrfToken, _method: "delete"}
				})

				res.statusCode.must.equal(302)
				res.headers.location.must.equal(`/initiatives`)

				var flash = parseFlashFromCookies(res.headers["set-cookie"])
				flash.notice.must.equal(t("INITIATIVE_DELETED"))
			})

			it("must delete initiative in edit phase", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative)

				var topic = yield createTopic(newTopic({
					id: initiative.uuid,
					creatorId: this.user.id,
					sourcePartnerId: this.partner.id,
					visibility: "public"
				}))

				this.router.delete(`/api/users/self/topics/${topic.id}`, endResponse)

				var res = yield this.request("/initiatives/" + initiative.uuid, {
					method: "POST",
					form: {_csrf_token: this.csrfToken, _method: "delete"}
				})

				res.statusCode.must.equal(302)
				res.headers.location.must.equal(`/initiatives`)

				var flash = parseFlashFromCookies(res.headers["set-cookie"])
				flash.notice.must.equal(t("INITIATIVE_DELETED"))
			})

			it("must respond with 405 given initiative in sign phase", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					phase: "sign"
				}))

				var topic = yield createTopic(newTopic({
					id: initiative.uuid,
					creatorId: this.user.id,
					sourcePartnerId: this.partner.id,
					status: "voting"
				}))

				yield createVote(topic, newVote())

				var res = yield this.request("/initiatives/" + initiative.uuid, {
					method: "POST",
					form: {_csrf_token: this.csrfToken, _method: "delete"}
				})

				res.statusCode.must.equal(405)
				res.statusMessage.must.match(/discussion/i)
			})

			it("must respond with 405 given other user's initiative", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative)

				yield createTopic(newTopic({
					id: initiative.uuid,
					creatorId: (yield createUser(newUser())).id,
					sourcePartnerId: this.partner.id,
					visibility: "public"
				}))

				var res = yield this.request("/initiatives/" + initiative.uuid, {
					method: "POST",
					form: {_csrf_token: this.csrfToken, _method: "delete"}
				})

				res.statusCode.must.equal(405)
				res.statusMessage.must.match(/discussion/i)
			})
		})
	})

	describe("GET /:id/edit", function() {
		require("root/test/fixtures").user()

		beforeEach(function*() {
			this.partner = yield createPartner(newPartner({id: Config.apiPartnerId}))
		})

		it("must get Etherpad URL path from CitizenOS API and append theme",
			function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative)

			var topic = yield createTopic(newTopic({
				id: initiative.uuid,
				creatorId: this.user.id,
				sourcePartnerId: this.partner.id
			}))

			var path = `/api/users/self/topics/${topic.id}`
			this.router.get(path, respond.bind(null, {data: {
				padUrl: "http://badpad.example.com/edit?token=1234"
			}}))

			var res = yield this.request(`/initiatives/${initiative.uuid}/edit`)
			res.statusCode.must.equal(200)

			var dom = parseDom(res.body)
			var url = Config.etherpadUrl + "/edit?token=1234&theme=test"
			dom.querySelector("iframe#initiative-etherpad").src.must.equal(url)
		})

		it("must append theme to Etherpad URL if no query params", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative)

			var topic = yield createTopic(newTopic({
				id: initiative.uuid,
				creatorId: this.user.id,
				sourcePartnerId: this.partner.id
			}))

			var path = `/api/users/self/topics/${topic.id}`
			this.router.get(path, respond.bind(null, {data: {
				padUrl: "http://badpad.example.com/1234"
			}}))

			var res = yield this.request(`/initiatives/${initiative.uuid}/edit`)
			res.statusCode.must.equal(200)

			var dom = parseDom(res.body)
			var url = Config.etherpadUrl + "/1234?theme=test"
			dom.querySelector("iframe#initiative-etherpad").src.must.equal(url)
		})
	})

	describe("GET /:id/signature", function() {
		require("root/test/time")(+new Date(2015, 5, 18))
		
		beforeEach(function*() {
			this.partner = yield createPartner(newPartner({id: Config.apiPartnerId}))

			this.initiative = yield initiativesDb.create(new ValidInitiative({
				phase: "sign"
			}))

			this.topic = yield createTopic(newTopic({
				id: this.initiative.uuid,
				creatorId: (yield createUser(newUser())).id,
				sourcePartnerId: this.partner.id,
				status: "voting"
			}))

			this.vote = yield createVote(this.topic, newVote())
			this.yesAndNo = yield createOptions(this.vote)
		})

		describe("when signing via Mobile-Id", function() {
			it("must redirect to initiative page", function*() {
				var self = this
				var user = yield createUser(newUser())
				var signature

				this.router.get(
					`/api/topics/${this.topic.id}/votes/${this.vote.id}/status`,
					next(function*(req, res) {
					var query = Url.parse(req.url, true).query
					query.token.must.equal(SIGN_TOKEN)
					var bdocUrl = newBdocUrl(self.topic, self.vote, user)
					respond({status: {code: 20000}, data: {bdocUri: bdocUrl}}, req, res)

					signature = yield createSignature(newSignature({
						userId: user.id,
						voteId: self.vote.id,
						optionId: self.yesAndNo[0]
					}))
				}))

				var res = yield this.request(
					`/initiatives/${this.initiative.uuid}/signature?token=${SIGN_TOKEN}`
				)

				res.statusCode.must.equal(303)
				res.headers.location.must.equal(`/initiatives/${this.initiative.uuid}`)

				var flash = parseFlashFromCookies(res.headers["set-cookie"])
				flash.signatureId.must.equal(signature.id)
			})

			it("must unhide signature", function*() {
				var self = this
				var user = yield createUser(newUser())

				this.router.get(
					`/api/topics/${this.topic.id}/votes/${this.vote.id}/status`,
					next(function*(req, res) {
					var bdocUrl = newBdocUrl(self.topic, self.vote, user)
					respond({status: {code: 20000}, data: {bdocUri: bdocUrl}}, req, res)

					yield createSignature(newSignature({
						userId: user.id,
						voteId: self.vote.id,
						optionId: self.yesAndNo[0]
					}))
				}))

				var signature = yield signaturesDb.create({
					initiative_uuid: this.initiative.uuid,
					user_uuid: user.id,
					hidden: true
				})

				var res = yield this.request(
					`/initiatives/${this.initiative.uuid}/signature?token=${SIGN_TOKEN}`
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
				var self = this
				var user = yield createUser(newUser())

				this.router.get(
					`/api/topics/${this.topic.id}/votes/${this.vote.id}/status`,
					next(function*(req, res) {
					var bdocUrl = newBdocUrl(self.topic, self.vote, user)
					respond({status: {code: 20000}, data: {bdocUri: bdocUrl}}, req, res)

					yield createSignature(newSignature({
						userId: user.id,
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
					`/initiatives/${this.initiative.uuid}/signature?token=${SIGN_TOKEN}`
				)

				res.statusCode.must.equal(303)

				yield signaturesDb.search(sql`
					SELECT * FROM initiative_signatures
				`).must.then.eql([signature])
			})

			it("must not unhide other user's signature", function*() {
				var self = this
				var user = yield createUser(newUser())

				this.router.get(
					`/api/topics/${this.topic.id}/votes/${this.vote.id}/status`,
					next(function*(req, res) {
					var bdocUrl = newBdocUrl(self.topic, self.vote, user)
					respond({status: {code: 20000}, data: {bdocUri: bdocUrl}}, req, res)

					yield createSignature(newSignature({
						userId: user.id,
						voteId: self.vote.id,
						optionId: self.yesAndNo[0]
					}))
				}))

				var otherUser = yield createUser(newUser())
				var otherInitiative = yield initiativesDb.create(new ValidInitiative)

				var signature = yield signaturesDb.create({
					initiative_uuid: otherInitiative.uuid,
					user_uuid: otherUser.id,
					hidden: true
				})

				var res = yield this.request(
					`/initiatives/${this.initiative.uuid}/signature?token=${SIGN_TOKEN}`
				)

				res.statusCode.must.equal(303)

				yield signaturesDb.search(sql`
					SELECT * FROM initiative_signatures
				`).must.then.eql([signature])
			})
		})
	})

	describe("POST /:id/signature", function() {
		require("root/test/time")(+new Date(2015, 5, 18))

		beforeEach(function*() {
			this.partner = yield createPartner(newPartner({id: Config.apiPartnerId}))

			this.initiative = yield initiativesDb.create(new ValidInitiative({
				phase: "sign"
			}))

			this.topic = yield createTopic(newTopic({
				id: this.initiative.uuid,
				creatorId: (yield createUser(newUser())).id,
				sourcePartnerId: this.partner.id,
				status: "voting"
			}))

			this.vote = yield createVote(this.topic, newVote())
			this.yesAndNo = yield createOptions(this.vote)
		})

		describe("when signing via Id-Card", function() {
			it("must send signature to CitizenOS", function*() {
				var self = this
				var user = yield createUser(newUser())
				var created = 0
				var signature

				var path = `/api/topics/${this.topic.id}/votes/${this.vote.id}/sign`
				this.router.post(path,
					next(function*(req, res) {
					++created
					req.body.must.eql({token: AUTH_TOKEN, signatureValue: SIGN_TOKEN})
					var bdocUrl = newBdocUrl(self.topic, self.vote, user)
					respond({data: {bdocUri: bdocUrl}}, req, res)

					signature = yield createSignature(newSignature({
						userId: user.id,
						voteId: self.vote.id,
						optionId: self.yesAndNo[0]
					}))
				}))

				path = `/initiatives/${this.initiative.uuid}/signature`
				var res = yield this.request(path, {
					method: "POST",
					form: {
						_csrf_token: this.csrfToken,
						method: "id-card",
						token: AUTH_TOKEN,
						signature: SIGN_TOKEN
					}
				})

				res.statusCode.must.equal(303)
				res.headers.location.must.equal(`/initiatives/${this.initiative.uuid}`)
				created.must.equal(1)

				var flash = parseFlashFromCookies(res.headers["set-cookie"])
				flash.signatureId.must.equal(signature.id)
			})

			it("must send signature deletion to CitizenOS", function*() {
				var self = this
				var user = yield createUser(newUser())
				var signature

				yield createSignature(newSignature({
					userId: user.id,
					voteId: this.vote.id,
					optionId: this.yesAndNo[0],
					createdAt: DateFns.addMinutes(new Date, -1)
				}))

				var path = `/api/topics/${this.topic.id}/votes/${this.vote.id}/sign`
				this.router.post(path,
					next(function*(req, res) {
					req.body.must.eql({token: AUTH_TOKEN, signatureValue: SIGN_TOKEN})
					var bdocUrl = newBdocUrl(self.topic, self.vote, user)
					respond({data: {bdocUri: bdocUrl}}, req, res)

					signature = yield createSignature(newSignature({
						userId: user.id,
						voteId: self.vote.id,
						optionId: self.yesAndNo[1]
					}))
				}))

				path = `/initiatives/${this.initiative.uuid}/signature`
				var res = yield this.request(path, {
					method: "POST",
					form: {
						_csrf_token: this.csrfToken,
						method: "id-card",
						token: AUTH_TOKEN,
						signature: SIGN_TOKEN
					}
				})

				res.statusCode.must.equal(303)
				res.headers.location.must.equal(`/initiatives/${this.initiative.uuid}`)

				var flash = parseFlashFromCookies(res.headers["set-cookie"])
				flash.signatureId.must.equal(signature.id)
			})

			it("must unhide signature", function*() {
				var self = this
				var user = yield createUser(newUser())

				var path = `/api/topics/${this.topic.id}/votes/${this.vote.id}/sign`
				this.router.post(path,
					next(function*(req, res) {
					var bdocUrl = newBdocUrl(self.topic, self.vote, user)
					respond({data: {bdocUri: bdocUrl}}, req, res)

					yield createSignature(newSignature({
						userId: user.id,
						voteId: self.vote.id,
						optionId: self.yesAndNo[0]
					}))
				}))

				var signature = yield signaturesDb.create({
					initiative_uuid: this.topic.id,
					user_uuid: user.id,
					hidden: true
				})

				path = `/initiatives/${this.initiative.uuid}/signature`
				var res = yield this.request(path, {
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
				var self = this
				var user = yield createUser(newUser())

				var path = `/api/topics/${this.topic.id}/votes/${this.vote.id}/sign`
				this.router.post(path,
					next(function*(req, res) {
					var bdocUrl = newBdocUrl(self.topic, self.vote, user)
					respond({data: {bdocUri: bdocUrl}}, req, res)

					yield createSignature(newSignature({
						userId: user.id,
						voteId: self.vote.id,
						optionId: self.yesAndNo[0]
					}))
				}))

				var other = yield initiativesDb.create(new ValidInitiative)

				var signature = yield signaturesDb.create({
					initiative_uuid: other.uuid,
					user_uuid: user.id,
					hidden: true
				})

				path = `/initiatives/${this.initiative.uuid}/signature`
				var res = yield this.request(path, {
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
				var self = this
				var user = yield createUser(newUser())

				var path = `/api/topics/${this.topic.id}/votes/${this.vote.id}/sign`
				this.router.post(path,
					next(function*(req, res) {
					var bdocUrl = newBdocUrl(self.topic, self.vote, user)
					respond({data: {bdocUri: bdocUrl}}, req, res)

					yield createSignature(newSignature({
						userId: user.id,
						voteId: self.vote.id,
						optionId: self.yesAndNo[0]
					}))
				}))

				var signature = yield signaturesDb.create({
					initiative_uuid: this.topic.id,
					user_uuid: "93a13041-c015-431e-b8dd-302e9e4b3d5d",
					hidden: true
				})

				path = `/initiatives/${this.initiative.uuid}/signature`
				var res = yield this.request(path, {
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
				var created = 0
				this.router.post(`/api/topics/${this.topic.id}/votes/${this.vote.id}`,
					function(req, res) {
					++created
					req.body.must.eql({
						options: [{optionId: "0bf34d36-59cd-438f-afd1-9a3a779b78b0"}],
						pid: "11412090004",
						phoneNumber: "+37200000766",
					})

					respond({data: {challengeID: "1337", token: "abcdef"}}, req, res)
				})

				var res = yield this.request(`/initiatives/${this.initiative.uuid}/signature`, {
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
					var created = 0
					this.router.post(`/api/topics/${this.topic.id}/votes/${this.vote.id}`,
						function(req, res) {
						++created
						req.body.must.eql({
							options: [{optionId: "0bf34d36-59cd-438f-afd1-9a3a779b78b0"}],
							pid: "11412090004",
							phoneNumber: long,
						})

						respond({data: {challengeID: "1337", token: "abcdef"}}, req, res)
					})

					var path = `/initiatives/${this.topic.id}/signature`
					var res = yield this.request(path, {
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
		beforeEach(function*() {
			this.partner = yield createPartner(newPartner({id: Config.apiPartnerId}))

			this.initiative = yield initiativesDb.create(new ValidInitiative({
				phase: "sign"
			}))

			this.topic = yield createTopic(newTopic({
				id: this.initiative.uuid,
				creatorId: (yield createUser(newUser())).id,
				sourcePartnerId: this.partner.id,
				status: "voting"
			}))

			this.vote = yield createVote(this.topic, newVote())
			this.yesAndNo = yield createOptions(this.vote)
		})

		describe("when not logged in", function() {
			it("must respond with 401 if not logged in", function*() {
				var path = `/initiatives/${this.initiative.uuid}/signature`
				var res = yield this.request(path, {
					method: "PUT",
					form: {_csrf_token: this.csrfToken, hidden: true}
				})

				res.statusCode.must.equal(401)
			})
		})

		describe("when logged in", function() {
			require("root/test/fixtures").user()
			require("root/test/time")(+new Date(2015, 5, 18))

			it("must respond with 303 if hiding a non-existent signature",
				function*() {
				var path = `/initiatives/${this.initiative.uuid}/signature`
				var res = yield this.request(path, {
					method: "PUT",
					form: {_csrf_token: this.csrfToken, hidden: true}
				})

				yield signaturesDb.search(sql`
					SELECT * FROM initiative_signatures
				`).must.then.be.empty()

				res.statusCode.must.equal(303)
				res.headers.location.must.equal(`/initiatives/${this.initiative.uuid}`)
			})

			it("must hide signature", function*() {
				yield createSignature(newSignature({
					userId: this.user.id,
					voteId: this.vote.id,
					optionId: this.yesAndNo[0]
				}))

				var path = `/initiatives/${this.initiative.uuid}/signature`
				var res = yield this.request(path, {
					method: "PUT",
					form: {_csrf_token: this.csrfToken, hidden: true}
				})

				yield signaturesDb.search(sql`
					SELECT * FROM initiative_signatures
				`).must.then.eql([{
					initiative_uuid: this.initiative.uuid,
					user_uuid: this.user.id,
					hidden: true,
					updated_at: new Date
				}])

				res.statusCode.must.equal(303)
				res.headers.location.must.equal(`/initiatives/${this.initiative.uuid}`)
			})

			it("must hide signature that was previously made visible", function*() {
				yield createSignature(newSignature({
					userId: this.user.id,
					voteId: this.vote.id,
					optionId: this.yesAndNo[0]
				}))

				var signature = yield signaturesDb.create({
					initiative_uuid: this.initiative.uuid,
					user_uuid: this.user.id,
					hidden: false
				})

				var path = `/initiatives/${this.initiative.uuid}/signature`
				var res = yield this.request(path, {
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
				res.headers.location.must.equal(`/initiatives/${this.initiative.uuid}`)
			})

			it("must hide an already hidden signature", function*() {
				yield createSignature(newSignature({
					userId: this.user.id,
					voteId: this.vote.id,
					optionId: this.yesAndNo[0]
				}))

				var signature = yield signaturesDb.create({
					initiative_uuid: this.initiative.uuid,
					user_uuid: this.user.id,
					hidden: true
				})

				var path = `/initiatives/${this.initiative.uuid}/signature`
				var res = yield this.request(path, {
					method: "PUT",
					form: {_csrf_token: this.csrfToken, hidden: true}
				})

				res.statusCode.must.equal(303)
				res.headers.location.must.equal(`/initiatives/${this.initiative.uuid}`)

				signature = yield signaturesDb.read(sql`
					SELECT * FROM initiative_signatures
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

function newBdocUrl(topic, vote, user) {
	var url = "http://example.com/api/users/self/topics/" + topic.id
	url += `/votes/${vote.id}/downloads/bdocs/user`
	url += "?token=" + fakeJwt({userId: user.id})
	return url
}

function queryPhases(html) {
	var phases = html.querySelectorAll("#initiative-phases li")
	var phasesById = _.indexBy(phases, (phase) => phase.id.match(/^\w+/)[0])

	return _.mapValues(phasesById, function(phase) {
		var progressElement = phase.querySelector(".progress")

		return {
			current: phase.classList.contains("current"),
			past: phase.classList.contains("past"),
			text: progressElement ? progressElement.textContent.trim() : ""
		}
	})
}

function queryEvents(html) {
	var events = html.querySelectorAll("#initiative-events li.event")

	return _.map(events, function(event) {
		var phase = event.className.match(/\b(\w+)-phase\b/)
		var author = event.querySelector(".author")

		return {
			id: event.id.replace(/^event-/, ""),
			title: event.querySelector("h2").textContent,
			at: new Date(event.querySelector(".metadata time").dateTime),
			author: author && author.textContent,
			content: event.querySelectorAll(".metadata ~ *:not(.files)"),
			phase: phase ? phase[1] : null
		}
	}).reverse()
}

function endResponse(_req, res) { res.end() }
