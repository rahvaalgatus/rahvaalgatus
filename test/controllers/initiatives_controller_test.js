var _ = require("root/lib/underscore")
var Url = require("url")
var Atom = require("root/lib/atom")
var DateFns = require("date-fns")
var Config = require("root/config")
var Crypto = require("crypto")
var MediaType = require("medium-type")
var Initiative = require("root/lib/initiative")
var ValidUser = require("root/test/valid_user")
var ValidInitiative = require("root/test/valid_db_initiative")
var ValidSubscription = require("root/test/valid_subscription")
var ValidSignature = require("root/test/valid_signature")
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
var newTopic = require("root/test/citizenos_fixtures").newTopic
var newVote = require("root/test/citizenos_fixtures").newVote
var newPermission = require("root/test/citizenos_fixtures").newPermission
var createPartner = require("root/test/citizenos_fixtures").createPartner
var createUser = require("root/test/fixtures").createUser
var createTopic = require("root/test/citizenos_fixtures").createTopic
var createVote = require("root/test/citizenos_fixtures").createVote
var createOptions = require("root/test/citizenos_fixtures").createOptions
var newCitizenSignature = require("root/test/citizenos_fixtures").newSignature
var createCitizenSignature =
	require("root/test/citizenos_fixtures").createSignature
var createCitizenSignatures =
	require("root/test/citizenos_fixtures").createSignatures
var createPermission = require("root/test/citizenos_fixtures").createPermission
var pseudoDateTime = require("root/lib/crypto").pseudoDateTime
var parseCookies = Http.parseCookies
var usersDb = require("root/db/users_db")
var initiativesDb = require("root/db/initiatives_db")
var subscriptionsDb = require("root/db/initiative_subscriptions_db")
var imagesDb = require("root/db/initiative_images_db")
var eventsDb = require("root/db/initiative_events_db")
var messagesDb = require("root/db/initiative_messages_db")
var signaturesDb = require("root/db/initiative_signatures_db")
var commentsDb = require("root/db/comments_db")
var encodeMime = require("nodemailer/lib/mime-funcs").encodeWord
var parseDom = require("root/lib/dom").parse
var outdent = require("root/lib/outdent")
var sha256 = require("root/lib/crypto").hash.bind(null, "sha256")
var concat = Array.prototype.concat.bind(Array.prototype)
var next = require("co-next")
var cosDb = require("root").cosDb
var INITIATIVE_TYPE = "application/vnd.rahvaalgatus.initiative+json; v=1"
var ATOM_TYPE = "application/atom+xml"
var PHASES = require("root/lib/initiative").PHASES
var EVENTABLE_PHASES = _.without(PHASES, "edit")
var PARLIAMENT_DECISIONS = Initiative.PARLIAMENT_DECISIONS
var COMMITTEE_MEETING_DECISIONS = Initiative.COMMITTEE_MEETING_DECISIONS
var PARLIAMENT_SITE_HOSTNAME = Url.parse(Config.url).hostname
var LOCAL_SITE_HOSTNAME = Url.parse(Config.localUrl).hostname
var PNG = new Buffer("89504e470d0a1a0a1337", "hex")
var PNG_PREVIEW = new Buffer("89504e470d0a1a0a4269", "hex")
var LOCAL_GOVERNMENTS = require("root/lib/local_governments")

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
			this.author = yield createUser()
		})

		it("must show initiatives", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				phase: "edit"
			}))

			yield createTopic(newTopic({
				id: initiative.uuid,
				creatorId: this.author.uuid,
				sourcePartnerId: this.partner.id,
				endsAt: DateFns.addSeconds(new Date, 1),
				visibility: "public"
			}))

			var res = yield this.request("/initiatives")
			res.statusCode.must.equal(200)
			res.body.must.include(initiative.uuid)
			res.body.must.include(this.author.name)
		})

		it("must show initiatives in edit phase", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				phase: "edit",
				created_at: pseudoDateTime()
			}))

			yield createTopic(newTopic({
				id: initiative.uuid,
				creatorId: this.author.uuid,
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
				user_id: this.author.id,
				phase: "edit",
				destination: "parliament"
			}))

			yield createTopic(newTopic({
				id: initiative.uuid,
				creatorId: this.author.uuid,
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
				user_id: this.author.id,
				phase: "edit",
				destination: "parliament",
				archived_at: new Date
			}))

			yield createTopic(newTopic({
				id: initiative.uuid,
				creatorId: this.author.uuid,
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
				user_id: this.author.id,
				phase: "sign"
			}))

			var topic = yield createTopic(newTopic({
				id: initiative.uuid,
				creatorId: this.author.uuid,
				sourcePartnerId: this.partner.id,
				status: "voting"
			}))

			var vote = yield createVote(topic, newVote({
				createdAt: pseudoDateTime(),
				endsAt: DateFns.addDays(new Date, 1)
			}))

			yield createCitizenSignatures(vote, 5)

			yield signaturesDb.create(_.times(3, () => new ValidSignature({
				initiative_uuid: initiative.uuid
			})))

			var res = yield this.request("/initiatives")
			res.statusCode.must.equal(200)
			res.body.must.include(initiative.uuid)
			res.body.must.include(t("N_SIGNATURES", {votes: 8}))

			var dom = parseDom(res.body)
			dom.querySelector(".initiative time").textContent.must.equal(
				I18n.formatDate("numeric", vote.createdAt)
			)
		})

		it("must show initiatives in sign phase that failed", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				phase: "sign"
			}))

			var topic = yield createTopic(newTopic({
				id: initiative.uuid,
				creatorId: this.author.uuid,
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
				user_id: this.author.id,
				phase: "sign"
			}))

			var topic = yield createTopic(newTopic({
				id: initiative.uuid,
				creatorId: this.author.uuid,
				sourcePartnerId: this.partner.id,
				status: "voting"
			}))

			var vote = yield createVote(topic, newVote({endsAt: new Date}))
			yield createCitizenSignatures(vote, Config.votesRequired)

			var res = yield this.request("/initiatives")
			res.statusCode.must.equal(200)
			res.body.must.include(initiative.uuid)
		})

		it("must show initiatives in parliament", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				phase: "parliament",
				sent_to_parliament_at: pseudoDateTime()
			}))

			var topic = yield createTopic(newTopic({
				id: initiative.uuid,
				creatorId: this.author.uuid,
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
				user_id: this.author.id,
				phase: "parliament",
				sent_to_parliament_at: pseudoDateTime(),
				received_by_parliament_at: pseudoDateTime()
			}))

			var topic = yield createTopic(newTopic({
				id: initiative.uuid,
				creatorId: this.author.uuid,
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
				user_id: this.author.id,
				phase: "government",
				sent_to_government_at: pseudoDateTime()
			}))

			var topic = yield createTopic(newTopic({
				id: initiative.uuid,
				creatorId: this.author.uuid,
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
				user_id: this.author.id,
				phase: "done",
				finished_in_parliament_at: pseudoDateTime(),
				finished_in_government_at: pseudoDateTime()
			}))

			var topic = yield createTopic(newTopic({
				id: initiative.uuid,
				creatorId: this.author.uuid,
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
				user_id: this.author.id,
				phase: "done",
				finished_in_parliament_at: pseudoDateTime()
			}))

			var topic = yield createTopic(newTopic({
				id: initiative.uuid,
				creatorId: this.author.uuid,
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

		function mustShowInitiativesInPhases(host, dest) {
			describe("as a shared site", function() {
				it("must show initiatives in edit phase with no destination",
					function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative({
						user_id: this.author.id,
						phase: "edit",
						destination: null
					}))

					yield createTopic(newTopic({
						id: initiative.uuid,
						creatorId: this.author.uuid,
						sourcePartnerId: this.partner.id,
						status: "inProgress",
						visibility: "public"
					}))

					var res = yield this.request("/initiatives", {headers: {Host: host}})
					res.statusCode.must.equal(200)
					res.body.must.include(initiative.uuid)
				})

				PHASES.forEach(function(phase) {
					it(`must show initiatives in ${phase} phase destined to ${dest}`,
						function*() {
						var initiative = yield initiativesDb.create(new ValidInitiative({
							user_id: this.author.id,
							phase: phase,
							destination: dest
						}))

						var topic = yield createTopic(newTopic({
							id: initiative.uuid,
							creatorId: this.author.uuid,
							sourcePartnerId: this.partner.id,
							status: phase == "edit" ? "inProgress" : "voting",
							visibility: "public"
						}))

						if (phase != "edit") yield createVote(topic, newVote())

						var res = yield this.request("/initiatives", {
							headers: {Host: host}
						})

						res.statusCode.must.equal(200)
						res.body.must.include(initiative.uuid)
					})

					it(`must not show initiatives in ${phase} not destined to ${dest}`,
						function*() {
						var initiative = yield initiativesDb.create(new ValidInitiative({
							user_id: this.author.id,
							phase: phase,
							destination: dest == "parliament" ? "muhu-vald" : "parliament"
						}))

						var topic = yield createTopic(newTopic({
							id: initiative.uuid,
							creatorId: this.author.uuid,
							sourcePartnerId: this.partner.id,
							status: phase == "edit" ? "inProgress" : "voting",
							visibility: "public"
						}))

						if (phase != "edit") yield createVote(topic, newVote())

						var res = yield this.request("/initiatives", {
							headers: {Host: host}
						})

						res.statusCode.must.equal(200)
						res.body.must.not.include(initiative.uuid)
					})
				})
			})
		}

		describe(`on ${PARLIAMENT_SITE_HOSTNAME}`, function() {
			mustShowInitiativesInPhases(PARLIAMENT_SITE_HOSTNAME, "parliament")
		})

		describe(`on ${LOCAL_SITE_HOSTNAME}`, function() {
			Object.keys(LOCAL_GOVERNMENTS).forEach(function(dest) {
				it(`must show initiatives destined to ${dest}`, function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative({
						user_id: this.author.id,
						phase: "sign",
						destination: dest
					}))

					var topic = yield createTopic(newTopic({
						id: initiative.uuid,
						creatorId: this.author.uuid,
						sourcePartnerId: this.partner.id,
						status: "voting",
						visibility: "public"
					}))

					yield createVote(topic, newVote())

					var res = yield this.request("/initiatives", {
						headers: {Host: LOCAL_SITE_HOSTNAME}
					})

					res.statusCode.must.equal(200)
					res.body.must.include(initiative.uuid)
				})
			})

			mustShowInitiativesInPhases(LOCAL_SITE_HOSTNAME, "muhu-vald")
		})

		_.each(Config.partners, function(partner, id) {
			if (id == Config.apiPartnerId) return

			describe("given " + partner.name, function() {
				it("must show initiatives", function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative({
						user_id: this.author.id
					}))

					var partner = yield createPartner(newPartner({id: id}))

					yield createTopic(newTopic({
						id: initiative.uuid,
						creatorId: this.author.uuid,
						sourcePartnerId: partner.id,
						visibility: "public"
					}))

					var res = yield this.request("/initiatives")
					res.statusCode.must.equal(200)
					res.body.must.include(initiative.uuid)
				})

				it("must not show archived initiatives in edit phase", function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative({
						user_id: this.author.id,
						archived_at: new Date
					}))

					var partner = yield createPartner(newPartner({id: id}))

					yield createTopic(newTopic({
						id: initiative.uuid,
						creatorId: this.author.uuid,
						sourcePartnerId: partner.id,
						visibility: "public"
					}))

					var res = yield this.request("/initiatives")
					res.statusCode.must.equal(200)
					res.body.must.not.include(initiative.uuid)
				})

				it("must show archived initiatives in sign phase", function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative({
						user_id: this.author.id,
						phase: "sign",
						archived_at: new Date
					}))

					var partner = yield createPartner(newPartner({id: id}))

					var topic = yield createTopic(newTopic({
						id: initiative.uuid,
						creatorId: this.author.uuid,
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
			var initiative = yield initiativesDb.create(new ValidInitiative({
				user_id: this.author.id
			}))

			var partner = yield createPartner(newPartner())

			var topic = yield createTopic(newTopic({
				id: initiative.uuid,
				creatorId: this.author.uuid,
				sourcePartnerId: partner.id,
				visibility: "public"
			}))

			var res = yield this.request("/initiatives")
			res.statusCode.must.equal(200)
			res.body.must.not.include(topic.id)
		})

		it("must not show private initiatives", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				user_id: this.author.id
			}))

			var topic = yield createTopic(newTopic({
				id: initiative.uuid,
				creatorId: this.author.uuid,
				sourcePartnerId: this.partner.id,
				visibility: "private"
			}))

			var res = yield this.request("/initiatives")
			res.statusCode.must.equal(200)
			res.body.must.not.include(topic.id)
		})

		it("must not show deleted initiatives", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				user_id: this.author.id
			}))

			var topic = yield createTopic(newTopic({
				id: initiative.uuid,
				creatorId: this.author.uuid,
				sourcePartnerId: this.partner.id,
				visibility: "public",
				deletedAt: new Date
			}))

			var res = yield this.request("/initiatives")
			res.statusCode.must.equal(200)
			res.body.must.not.include(topic.id)
		})

		it("must show initiatives by category if given", function*() {
			var initiativeA = yield initiativesDb.create(new ValidInitiative({
				user_id: this.author.id
			}))

			var initiativeB = yield initiativesDb.create(new ValidInitiative({
				user_id: this.author.id
			}))

			yield createTopic(newTopic({
				id: initiativeA.uuid,
				creatorId: this.author.uuid,
				sourcePartnerId: this.partner.id,
				visibility: "public",
				categories: ["uuseakus"]
			}))

			yield createTopic(newTopic({
				id: initiativeB.uuid,
				creatorId: this.author.uuid,
				sourcePartnerId: this.partner.id,
				visibility: "public"
			}))

			var res = yield this.request("/initiatives?category=uuseakus")
			res.statusCode.must.equal(200)
			res.body.must.include(initiativeA.uuid)
			res.body.must.not.include(initiativeB.uuid)
		})

		it("must include social media tags", function*() {
			var res = yield this.request("/initiatives?category=uuseakus")
			res.statusCode.must.equal(200)
			
			var dom = parseDom(res.body)
			var metas = dom.head.querySelectorAll("meta")
			var metasByName = _.indexBy(metas, (el) => el.getAttribute("name"))
			var metasByProp = _.indexBy(metas, (el) => el.getAttribute("property"))

			metasByName["twitter:site"].content.must.equal("rahvaalgatus")
			metasByName["twitter:card"].content.must.equal("summary")

			metasByProp["og:title"].content.must.equal("Rahvaalgatus")
			var imageUrl = `${Config.url}/assets/rahvaalgatus-description.png`
			metasByProp["og:image"].content.must.equal(imageUrl)
		})

		describe("recent initiatives", function() {
			it("must show initiatives last signed", function*() {
				var self = this

				var initiatives = yield _.times(10, function*(i) {
					var initiative = yield initiativesDb.create(new ValidInitiative({
						user_id: self.author.id,
						phase: "sign"
					}))

					var topic = yield createTopic(newTopic({
						id: initiative.uuid,
						title: "Better life for everyone.",
						creatorId: self.author.uuid,
						sourcePartnerId: self.partner.id,
						status: "voting"
					}))

					var vote = yield createVote(topic, newVote({endsAt: new Date}))

					if (i % 2 == 0) yield signaturesDb.create(new ValidSignature({
						initiative_uuid: initiative.uuid,
						created_at: DateFns.addMinutes(new Date, i * 2),
					}))
					else {
						var user = yield createUser()
						var yesAndNo = yield createOptions(vote)

						yield createCitizenSignature(newCitizenSignature({
							userId: user.uuid,
							optionId: yesAndNo[0],
							createdAt: DateFns.addMinutes(new Date, i * 2),
							voteId: vote.id
						}))
					}

					return initiative
				})

				var res = yield this.request("/initiatives")
				res.statusCode.must.equal(200)
				
				var dom = parseDom(res.body)
				var els = dom.querySelectorAll("#recent-initiatives ol li")
				els.length.must.equal(6)
				initiatives = _.reverse(initiatives)
				els.forEach((el, i) => el.innerHTML.must.include(initiatives[i].uuid))
			})
		})
	})

	describe(`GET / for ${INITIATIVE_TYPE}`, function() {
		beforeEach(function*() {
			this.partner = yield createPartner(newPartner({id: Config.apiPartnerId}))
			this.author = yield createUser()
		})

		it("must not respond with initiatives from other partners", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				user_id: this.author.id
			}))

			var partner = yield createPartner(newPartner())

			yield createTopic(newTopic({
				id: initiative.uuid,
				creatorId: this.author.uuid,
				sourcePartnerId: partner.id,
				visibility: "public"
			}))

			var res = yield this.request("/initiatives", {
				headers: {Accept: INITIATIVE_TYPE}
			})

			res.statusCode.must.equal(200)
			res.body.must.eql([])
		})

		it("must not respond with private initiatives", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				user_id: this.author.id
			}))

			yield createTopic(newTopic({
				id: initiative.uuid,
				creatorId: this.author.uuid,
				sourcePartnerId: this.partner.id,
				visibility: "private"
			}))

			var res = yield this.request("/initiatives", {
				headers: {Accept: INITIATIVE_TYPE}
			})

			res.statusCode.must.equal(200)
			res.body.must.eql([])
		})

		it("must not respond with deleted initiatives", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				user_id: this.author.id
			}))

			yield createTopic(newTopic({
				id: initiative.uuid,
				creatorId: this.author.uuid,
				sourcePartnerId: this.partner.id,
				visibility: "public",
				deletedAt: new Date
			}))

			var res = yield this.request("/initiatives", {
				headers: {Accept: INITIATIVE_TYPE}
			})

			res.statusCode.must.equal(200)
			res.body.must.eql([])
		})

		it("must respond with initiatives", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				phase: "edit"
			}))

			var topic = yield createTopic(newTopic({
				id: initiative.uuid,
				title: "Better life for everyone.",
				creatorId: this.author.uuid,
				sourcePartnerId: this.partner.id,
				visibility: "public",
				endsAt: DateFns.addSeconds(new Date, 1)
			}))

			var res = yield this.request("/initiatives", {
				headers: {Accept: INITIATIVE_TYPE}
			})

			res.statusCode.must.equal(200)
			res.headers["content-type"].must.equal(INITIATIVE_TYPE)
			res.headers["access-control-allow-origin"].must.equal("*")

			res.body.must.eql([{
				id: initiative.uuid,
				title: topic.title,
				phase: "edit",
				signatureCount: 0
			}])
		})

		it("must respond with external initiatives in parliament", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				phase: "parliament",
				received_by_parliament_at: pseudoDateTime(),
				external: true
			}))

			var res = yield this.request("/initiatives", {
				headers: {Accept: INITIATIVE_TYPE}
			})

			res.statusCode.must.equal(200)

			res.body.must.eql([{
				id: initiative.uuid,
				title: initiative.title,
				phase: "parliament",
				signatureCount: null
			}])
		})

		it("must respond with signature count", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				phase: "sign"
			}))

			var topic = yield createTopic(newTopic({
				id: initiative.uuid,
				title: "Better life for everyone.",
				creatorId: this.author.uuid,
				sourcePartnerId: this.partner.id,
				status: "voting"
			}))

			var vote = yield createVote(topic, newVote({endsAt: new Date}))
			yield createCitizenSignatures(vote, 5)

			yield signaturesDb.create(_.times(3, () => new ValidSignature({
				initiative_uuid: initiative.uuid
			})))

			var res = yield this.request("/initiatives", {
				headers: {Accept: INITIATIVE_TYPE}
			})

			res.statusCode.must.equal(200)

			res.body.must.eql([{
				id: initiative.uuid,
				title: topic.title,
				phase: "sign",
				signatureCount: 8
			}])
		})

		describe("given signedSince", function() {
			it("must return signature count since given date", function*() {
				var self = this

				var initiatives = yield _.times(10, function*(i) {
					var initiative = yield initiativesDb.create(new ValidInitiative({
						user_id: self.author.id
					}))

					yield createTopic(newTopic({
						id: initiative.uuid,
						creatorId: self.author.uuid,
						sourcePartnerId: self.partner.id,
						status: "voting"
					}))

					yield signaturesDb.create(_.times(i, () => new ValidSignature({
						initiative_uuid: initiative.uuid,
						created_at: new Date(2015, 5, 18 + i, 13, 37, 42)
					})))

					return initiative
				})

				var res = yield this.request("/initiatives?signedSince=2015-06-23", {
					headers: {Accept: INITIATIVE_TYPE}
				})

				res.statusCode.must.equal(200)
				_.map(res.body, "id").must.eql(_.map(initiatives.slice(5), "uuid"))
				_.map(res.body, "signaturesSinceCount").must.eql([5, 6, 7, 8, 9])
			})
		})

		describe("given phase", function() {
			it("must respond with 400 given invalid phase", function*() {
				var res = yield this.request("/initiatives?phase=foo", {
					headers: {Accept: INITIATIVE_TYPE}
				})

				res.statusCode.must.equal(400)
				res.statusMessage.must.equal("Invalid Phase")

				res.body.must.eql({
					code: 400,
					message: "Invalid Phase",
					name: "HttpError"
				})
			})

			PHASES.forEach(function(phase, i) {
				function* createInitiative(partner, user, attrs) {
					var initiative = yield initiativesDb.create(
						new ValidInitiative(_.assign({user_id: user.id}, attrs))
					)

					var topic = yield createTopic(newTopic({
						id: initiative.uuid,
						creatorId: user.uuid,
						sourcePartnerId: partner.id,
						status: initiative.phase == "edit" ? "inProgress" : "voting",
						visibility: "public"
					}))

					if (initiative.phase != "edit") yield createVote(topic, newVote())

					return [initiative, topic]
				}

				it(`must respond with ${phase} initiatives if requested`, function*() {
					var [initiative, topic] = yield createInitiative(
						this.partner,
						this.author,
						{phase: phase}
					)

					var nextPhase = PHASES[(i + 1) % PHASES.length]
					yield createInitiative(this.partner, this.author, {phase: nextPhase})

					var res = yield this.request("/initiatives?phase=" + phase, {
						headers: {Accept: INITIATIVE_TYPE}
					})

					res.statusCode.must.equal(200)

					res.body.must.eql([{
						id: initiative.uuid,
						title: topic.title,
						phase: phase,
						signatureCount: 0
					}])
				})
			})
		})

		describe("given order", function() {
			it("must respond with 400 given invalid order", function*() {
				var res = yield this.request("/initiatives?order=foo", {
					headers: {Accept: INITIATIVE_TYPE}
				})

				res.statusCode.must.equal(400)
				res.statusMessage.must.equal("Invalid Order")

				res.body.must.eql({
					code: 400,
					message: "Invalid Order",
					name: "HttpError"
				})
			})

			_.each({
				"signatureCount": _.id,
				"+signatureCount": _.id,
				"-signatureCount": _.reverse,
			}, function(sort, order) {
				it(`must sort by ${order}`, function*() {
					var self = this

					var initiatives = yield _.times(5, function*(i) {
						var initiative = yield initiativesDb.create(new ValidInitiative({
							user_id: self.author.id
						}))

						yield createTopic(newTopic({
							id: initiative.uuid,
							creatorId: self.author.uuid,
							sourcePartnerId: self.partner.id,
							status: "voting"
						}))

						// Create signatures in descending order to ensure their default
						// order doesn't match initiative creation order.
						yield signaturesDb.create(_.times(4 - i, () => new ValidSignature({
							initiative_uuid: initiative.uuid
						})))

						return initiative
					})

					var path = "/initiatives?order=" + encodeURIComponent(order)
					var res = yield this.request(path, {
						headers: {Accept: INITIATIVE_TYPE}
					})

					res.statusCode.must.equal(200)
					var uuids = _.map(initiatives, "uuid").reverse()
					_.map(res.body, "id").must.eql(sort(uuids))
				})
			})

			_.each({
				"signaturesSinceCount": _.id,
				"+signaturesSinceCount": _.id,
				"-signaturesSinceCount": _.reverse,
			}, function(sort, order) {
				it("must return signature count since given date", function*() {
					var self = this

					var initiatives = yield _.times(10, function*(i) {
						var initiative = yield initiativesDb.create(new ValidInitiative({
							user_id: self.author.id
						}))

						yield createTopic(newTopic({
							id: initiative.uuid,
							creatorId: self.author.uuid,
							sourcePartnerId: self.partner.id,
							status: "voting"
						}))

						// Create signatures in descending order to ensure their default
						// order doesn't match initiative creation order.
						yield signaturesDb.create(_.times(9 - i, () => new ValidSignature({
							initiative_uuid: initiative.uuid,
							created_at: new Date(2015, 5, 27 - i, 13, 37, 42)
						})))

						return initiative
					})

					var path = "/initiatives?signedSince=2015-06-23"
					path += "&order=" + encodeURIComponent(order)
					var res = yield this.request(path, {
						headers: {Accept: INITIATIVE_TYPE}
					})

					res.statusCode.must.equal(200)
					var uuids = _.map(initiatives.slice(0, 5).reverse(), "uuid")
					_.map(res.body, "id").must.eql(sort(uuids))
					var counts = sort([5, 6, 7, 8, 9])
					_.map(res.body, "signaturesSinceCount").must.eql(counts)
				})
			})
		})

		describe("given limit", function() {
			it("must limit initiatives", function*() {
				var self = this

				var initiatives = yield _.times(10, function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative({
						user_id: self.author.id
					}))

					yield createTopic(newTopic({
						id: initiative.uuid,
						creatorId: self.author.uuid,
						sourcePartnerId: self.partner.id,
						status: "voting"
					}))

					return initiative
				})

				var res = yield this.request("/initiatives?limit=5", {
					headers: {Accept: INITIATIVE_TYPE}
				})

				res.statusCode.must.equal(200)
				_.map(res.body, "id").must.eql(_.map(initiatives.slice(0, 5), "uuid"))
			})

			it("must limit initiatives after sorting", function*() {
				var self = this

				var initiatives = yield _.times(10, function*(i) {
					var initiative = yield initiativesDb.create(new ValidInitiative({
						user_id: self.author.id
					}))

					yield createTopic(newTopic({
						id: initiative.uuid,
						creatorId: self.author.uuid,
						sourcePartnerId: self.partner.id,
						status: "inProgress",
						visibility: "public"
					}))

					yield signaturesDb.create(_.times(i, () => new ValidSignature({
						initiative_uuid: initiative.uuid
					})))

					return initiative
				})

				var path = "/initiatives?order=-signatureCount&limit=5"
				var res = yield this.request(path, {
					headers: {Accept: INITIATIVE_TYPE}
				})

				res.statusCode.must.equal(200)
				var last5 = _.map(initiatives.slice(5), "uuid")
				_.map(res.body, "id").must.eql(last5.reverse())
			})
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

				var initiatives = yield initiativesDb.search(sql`
					SELECT * FROM initiatives
				`)

				initiatives.must.eql([new ValidInitiative({
					uuid: uuid,
					user_id: this.user.id,
					parliament_token: initiatives[0].parliament_token,
					destination: null
				})])
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
			this.author = yield createUser()
		})

		describe("when not logged in", function() {
			require("root/test/time")(new Date(2015, 5, 18, 13, 37, 42))

			it("must respond with 403 for a private initiative", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: this.author.id
				}))

				yield createTopic(newTopic({
					id: initiative.uuid,
					creatorId: this.author.uuid,
					sourcePartnerId: this.partner.id,
					visibility: "private"
				}))

				var res = yield this.request("/initiatives/" + initiative.uuid)
				res.statusCode.must.equal(403)
				res.statusMessage.must.match(/public/i)
			})

			it("must respond with 404 for a deleted initiative", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: this.author.id
				}))

				yield createTopic(newTopic({
					id: initiative.uuid,
					creatorId: this.author.uuid,
					sourcePartnerId: this.partner.id,
					visibility: "public",
					deletedAt: new Date
				}))

				var res = yield this.request("/initiatives/" + initiative.uuid)
				res.statusCode.must.equal(404)
			})

			it("must include social media tags", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: this.author.id
				}))

				var topic = yield createTopic(newTopic({
					id: initiative.uuid,
					creatorId: this.author.uuid,
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
				var metasByName = _.indexBy(metas, (el) => el.getAttribute("name"))
				var metasByProp = _.indexBy(metas, (el) => el.getAttribute("property"))

				metasByName["twitter:site"].content.must.equal("rahvaalgatus")
				metasByName["twitter:card"].content.must.equal("summary_large_image")

				var url = `${Config.url}/initiatives/${initiative.uuid}`
				metasByProp["og:title"].content.must.equal(topic.title)
				metasByProp["og:url"].content.must.equal(url)
				metasByProp["og:image"].content.must.equal(url + ".png")
			})

			it("must show done phase by default", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					destination: "parliament"
				}))

				yield createTopic(newTopic({
					id: initiative.uuid,
					creatorId: this.author.uuid,
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

			it("must render initiative", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "edit"
				}))

				yield createTopic(newTopic({
					id: initiative.uuid,
					creatorId: this.author.uuid,
					sourcePartnerId: this.partner.id,
					endsAt: DateFns.addSeconds(new Date, 1),
					visibility: "public"
				}))

				var res = yield this.request("/initiatives/" + initiative.uuid)
				res.statusCode.must.equal(200)
				res.body.must.include(this.author.name)
			})

			it("must render initiative in edit phase", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					destination: "parliament"
				}))

				yield createTopic(newTopic({
					id: initiative.uuid,
					creatorId: this.author.uuid,
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
					user_id: this.author.id,
					phase: "edit",
					archived_at: new Date
				}))

				yield createTopic(newTopic({
					id: initiative.uuid,
					creatorId: this.author.uuid,
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
					user_id: this.author.id,
					phase: "edit",
					archived_at: new Date
				}))

				yield createTopic(newTopic({
					id: initiative.uuid,
					creatorId: this.author.uuid,
					sourcePartnerId: this.partner.id,
					status: "closed"
				}))

				var res = yield this.request("/initiatives/" + initiative.uuid)
				res.statusCode.must.equal(200)
				res.body.must.not.include(tHtml("INITIATIVE_IN_DISCUSSION"))
			})

			it("must render initiative in edit phase that have ended", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					destination: "parliament"
				}))

				yield createTopic(newTopic({
					id: initiative.uuid,
					creatorId: this.author.uuid,
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
					user_id: this.author.id,
					phase: "sign"
				}))

				var topic = yield createTopic(newTopic({
					id: initiative.uuid,
					creatorId: this.author.uuid,
					sourcePartnerId: this.partner.id,
					createdAt: DateFns.addDays(new Date, -3),
					status: "voting"
				}))

				var vote = yield createVote(topic, newVote({
					createdAt: DateFns.addDays(new Date, -1),
					endsAt: DateFns.addDays(new Date, 1)
				}))

				yield createCitizenSignatures(vote, Config.votesRequired / 2)

				var res = yield this.request("/initiatives/" + initiative.uuid)
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
					user_id: this.author.id,
					phase: "sign",
					signature_milestones: {
						[milestones[0]]: DateFns.addDays(new Date, -5),
						[milestones[1]]: DateFns.addDays(new Date, -3),
						[milestones[2]]: DateFns.addDays(new Date, -1)
					}
				}))

				var topic = yield createTopic(newTopic({
					id: initiative.uuid,
					creatorId: this.author.uuid,
					sourcePartnerId: this.partner.id,
					status: "voting"
				}))

				var vote = yield createVote(topic, newVote())
				yield createCitizenSignatures(vote, Config.votesRequired)

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
					user_id: this.author.id,
					phase: "sign"
				}))

				var topic = yield createTopic(newTopic({
					id: initiative.uuid,
					creatorId: this.author.uuid,
					sourcePartnerId: this.partner.id,
					status: "voting"
				}))

				var vote = yield createVote(topic, newVote({endsAt: new Date}))
				var signatureCount = Config.votesRequired - 1
				yield createCitizenSignatures(vote, signatureCount)

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
					user_id: this.author.id,
					phase: "sign",
					archived_at: new Date
				}))

				var topic = yield createTopic(newTopic({
					id: initiative.uuid,
					creatorId: this.author.uuid,
					sourcePartnerId: this.partner.id,
					status: "voting"
				}))

				var vote = yield createVote(topic, newVote({endsAt: new Date}))
				var signatureCount = Config.votesRequired - 1
				yield createCitizenSignatures(vote, signatureCount)

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
					user_id: this.author.id,
					phase: "sign",
					archived_at: new Date
				}))

				var topic = yield createTopic(newTopic({
					id: initiative.uuid,
					creatorId: this.author.uuid,
					sourcePartnerId: this.partner.id,
					status: "closed"
				}))

				var vote = yield createVote(topic, newVote({endsAt: new Date}))
				var signatureCount = Config.votesRequired - 1
				yield createCitizenSignatures(vote, signatureCount)

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
					user_id: this.author.id,
					phase: "sign"
				}))

				var topic = yield createTopic(newTopic({
					id: initiative.uuid,
					creatorId: this.author.uuid,
					sourcePartnerId: this.partner.id,
					status: "voting"
				}))

				var vote = yield createVote(topic, newVote({endsAt: new Date}))
				yield createCitizenSignatures(vote, Config.votesRequired)

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
					user_id: this.author.id,
					phase: "sign",
					has_paper_signatures: true
				}))

				var topic = yield createTopic(newTopic({
					id: initiative.uuid,
					creatorId: this.author.uuid,
					sourcePartnerId: this.partner.id,
					status: "voting"
				}))

				var vote = yield createVote(topic, newVote({
					endsAt: DateFns.addDays(new Date, 1)
				}))

				yield createCitizenSignatures(vote, 1)

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
					user_id: this.author.id,
					phase: "parliament",
					sent_to_parliament_at: DateFns.addDays(new Date, -5)
				}))

				var topic = yield createTopic(newTopic({
					id: initiative.uuid,
					creatorId: this.author.uuid,
					sourcePartnerId: this.partner.id,
					status: "followUp"
				}))

				var vote = yield createVote(topic, newVote())
				yield createCitizenSignatures(vote, Config.votesRequired)

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
					user_id: this.author.id,
					phase: "parliament",
					sent_to_parliament_at: DateFns.addDays(new Date, -6),
					received_by_parliament_at: DateFns.addDays(new Date, -5),
					parliament_committee: "Keskkonnakomisjon"
				}))

				var topic = yield createTopic(newTopic({
					id: initiative.uuid,
					creatorId: this.author.uuid,
					sourcePartnerId: this.partner.id,
					status: "followUp"
				}))

				var vote = yield createVote(topic, newVote())
				yield createCitizenSignatures(vote, Config.votesRequired)

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
						: decision == "draft-act-or-national-matter"
						? t("PARLIAMENT_MEETING_DECISION_DRAFT_ACT_OR_NATIONAL_MATTER")
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
					user_id: this.author.id,
					phase: "parliament",
					sent_to_parliament_at: DateFns.addDays(new Date, -30)
				}))

				var topic = yield createTopic(newTopic({
					id: initiative.uuid,
					creatorId: this.author.uuid,
					sourcePartnerId: this.partner.id,
					status: "followUp"
				}))

				var vote = yield createVote(topic, newVote())
				yield createCitizenSignatures(vote, Config.votesRequired)

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
					user_id: this.author.id,
					phase: "parliament",
					sent_to_parliament_at: DateFns.addDays(new Date, -35)
				}))

				var topic = yield createTopic(newTopic({
					id: initiative.uuid,
					creatorId: this.author.uuid,
					sourcePartnerId: this.partner.id,
					status: "followUp"
				}))

				var vote = yield createVote(topic, newVote())
				yield createCitizenSignatures(vote, Config.votesRequired)

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
					user_id: this.author.id,
					phase: "parliament",
					sent_to_parliament_at: DateFns.addDays(new Date, -35),
					accepted_by_parliament_at: DateFns.addDays(new Date, -5)
				}))

				var topic = yield createTopic(newTopic({
					id: initiative.uuid,
					creatorId: this.author.uuid,
					sourcePartnerId: this.partner.id,
					status: "followUp"
				}))

				var vote = yield createVote(topic, newVote())
				yield createCitizenSignatures(vote, Config.votesRequired)

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
					user_id: this.author.id,
					phase: "parliament",
					sent_to_parliament_at: DateFns.addMonths(new Date, -7),
					accepted_by_parliament_at: DateFns.addMonths(new Date, -6)
				}))

				yield createTopic(newTopic({
					id: initiative.uuid,
					creatorId: this.author.uuid,
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
					user_id: this.author.id,
					phase: "parliament",
					sent_to_parliament_at: DateFns.addMonths(new Date, -7),
					accepted_by_parliament_at:
						DateFns.addMonths(DateFns.addDays(new Date, -5), -6)
				}))

				yield createTopic(newTopic({
					id: initiative.uuid,
					creatorId: this.author.uuid,
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
					user_id: this.author.id,
					phase: "parliament",
					sent_to_parliament_at: DateFns.addDays(new Date, -30),
					received_by_parliament_at: DateFns.addDays(new Date, -25),
					finished_in_parliament_at: DateFns.addDays(new Date, -5)
				}))

				yield createTopic(newTopic({
					id: initiative.uuid,
					creatorId: this.author.uuid,
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
						user_id: this.author.id,
						phase: "parliament",
						sent_to_parliament_at: DateFns.addDays(new Date, -30),
						parliament_decision: decision,
						finished_in_parliament_at: DateFns.addDays(new Date, -5)
					}))

					yield createTopic(newTopic({
						id: initiative.uuid,
						creatorId: this.author.uuid,
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
						: decision == "draft-act-or-national-matter"
						? t("PARLIAMENT_DECISION_DRAFT_ACT_OR_NATIONAL_MATTER")
						: null
					)
				})

				it(`must render initiative in parliament and finished event with ${decision} decision`, function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative({
						user_id: this.author.id,
						phase: "parliament",
						sent_to_parliament_at: DateFns.addDays(new Date, -30),
						parliament_decision: decision,
						finished_in_parliament_at: DateFns.addDays(new Date, -5)
					}))

					yield createTopic(newTopic({
						id: initiative.uuid,
						creatorId: this.author.uuid,
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
						: decision == "draft-act-or-national-matter"
						? t("PARLIAMENT_DECISION_DRAFT_ACT_OR_NATIONAL_MATTER")
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
					user_id: this.author.id,
					phase: "government",
					sent_to_parliament_at: DateFns.addDays(new Date, -30),
					received_by_parliament_at: DateFns.addDays(new Date, -25),
					finished_in_parliament_at: DateFns.addDays(new Date, -5),
					sent_to_government_at: new Date,
					government_agency: "Sidususministeerium"
				}))

				var topic = yield createTopic(newTopic({
					id: initiative.uuid,
					creatorId: this.author.uuid,
					sourcePartnerId: this.partner.id,
					status: "followUp"
				}))

				var vote = yield createVote(topic, newVote())
				yield createCitizenSignatures(vote, Config.votesRequired)

				var res = yield this.request("/initiatives/" + initiative.uuid)
				res.statusCode.must.equal(200)
				res.body.must.include(tHtml("INITIATIVE_IN_GOVERNMENT"))

				res.body.must.include(t("INITIATIVE_IS_IN_GOVERNMENT_AGENCY", {
					agency: "Sidususministeerium"
				}))

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

			it("must render initiative in government with a contact", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "government",
					sent_to_parliament_at: DateFns.addDays(new Date, -30),
					received_by_parliament_at: DateFns.addDays(new Date, -25),
					finished_in_parliament_at: DateFns.addDays(new Date, -5),
					sent_to_government_at: new Date,
					government_agency: "Sidususministeerium",
					government_contact: "John Smith",
					government_contact_details: "john@example.com"
				}))

				var topic = yield createTopic(newTopic({
					id: initiative.uuid,
					creatorId: this.author.uuid,
					sourcePartnerId: this.partner.id,
					status: "followUp"
				}))

				var vote = yield createVote(topic, newVote())
				yield createCitizenSignatures(vote, Config.votesRequired)

				var res = yield this.request("/initiatives/" + initiative.uuid)
				res.statusCode.must.equal(200)
				res.body.must.include(t("GOVERNMENT_AGENCY_CONTACT"))
				res.body.must.include("John Smith")
				res.body.must.include("john@example.com")
			})

			it("must render initiative in government that's finished", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
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
					creatorId: this.author.uuid,
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
					user_id: this.author.id,
					phase: "government",
					sent_to_parliament_at: DateFns.addDays(new Date, -30),
					received_by_parliament_at: DateFns.addDays(new Date, -25),
					finished_in_parliament_at: DateFns.addDays(new Date, -5)
				}))

				yield createTopic(newTopic({
					id: initiative.uuid,
					creatorId: this.author.uuid,
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
					user_id: this.author.id,
					phase: "done",
					sent_to_parliament_at: new Date
				}))

				yield createTopic(newTopic({
					id: initiative.uuid,
					creatorId: this.author.uuid,
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
					user_id: this.author.id,
					phase: "done",
					sent_to_parliament_at: new Date,
					sent_to_government_at: new Date,
					finished_in_government_at: new Date
				}))

				yield createTopic(newTopic({
					id: initiative.uuid,
					creatorId: this.author.uuid,
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
					user_id: this.author.id,
					phase: "done",
					sent_to_parliament_at: new Date,
					archived_at: new Date
				}))

				yield createTopic(newTopic({
					id: initiative.uuid,
					creatorId: this.author.uuid,
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
					user_id: this.author.id,
					phase: "done",
					sent_to_parliament_at: new Date,
					sent_to_government_at: new Date,
					archived_at: new Date
				}))

				yield createTopic(newTopic({
					id: initiative.uuid,
					creatorId: this.author.uuid,
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

				var author = yield usersDb.create(new ValidUser({name: "Johnny Lang"}))

				var event = yield eventsDb.create(new ValidEvent({
					initiative_uuid: initiative.uuid,
					user_id: author.id,
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
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: this.author.id
				}))

				yield createTopic(newTopic({
					id: initiative.uuid,
					creatorId: this.author.uuid,
					sourcePartnerId: this.partner.id,
					visibility: "public"
				}))

				var author = yield createUser({name: "Johnny Lang"})
				var replier = yield createUser({name: "Kenny Loggins"})

				var comment = yield commentsDb.create(new ValidComment({
					initiative_uuid: initiative.uuid,
					user_id: author.id,
					user_uuid: _.serializeUuid(author.uuid)
				}))

				var reply = yield commentsDb.create(new ValidComment({
					initiative_uuid: initiative.uuid,
					user_id: replier.id,
					user_uuid: _.serializeUuid(replier.uuid),
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

			it("must render initiative comments with names from local database",
				function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: this.author.id
				}))

				yield createTopic(newTopic({
					id: initiative.uuid,
					creatorId: this.author.uuid,
					sourcePartnerId: this.partner.id,
					visibility: "public"
				}))

				var author = yield createUser({name: "Johnny Lang"})
				var replier = yield createUser({name: "Kenny Loggins"})

				var comment = yield commentsDb.create(new ValidComment({
					initiative_uuid: initiative.uuid,
					user_id: author.id,
					user_uuid: _.serializeUuid(author.uuid)
				}))

				var reply = yield commentsDb.create(new ValidComment({
					initiative_uuid: initiative.uuid,
					user_id: replier.id,
					user_uuid: _.serializeUuid(replier.uuid),
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
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: this.author.id
				}))

				yield createTopic(newTopic({
					id: initiative.uuid,
					creatorId: this.author.uuid,
					sourcePartnerId: this.partner.id,
					visibility: "public"
				}))

				var other = yield initiativesDb.create(new ValidInitiative({
					user_id: this.author.id
				}))

				var author = yield createUser()

				var comment = yield commentsDb.create(new ValidComment({
					initiative_uuid: other.uuid,
					user_id: author.id,
					user_uuid: _.serializeUuid(author.uuid)
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
					user_id: this.author.id,
					phase: "sign"
				}))

				var topic = yield createTopic(newTopic({
					id: initiative.uuid,
					creatorId: this.author.uuid,
					sourcePartnerId: this.partner.id,
					status: "voting"
				}))

				yield createVote(topic, newVote({endsAt: DateFns.addDays(new Date, 1)}))

				var res = yield this.request("/initiatives/" + initiative.uuid)
				res.statusCode.must.equal(200)
				res.body.must.include("MSG_ERROR_HWCRYPTO_NO_CERTIFICATES")
			})

			it("must not show thanks if not signed", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "sign"
				}))

				var topic = yield createTopic(newTopic({
					id: initiative.uuid,
					creatorId: this.author.uuid,
					sourcePartnerId: this.partner.id,
					status: "voting"
				}))

				yield createVote(topic, newVote({endsAt: DateFns.addDays(new Date, 1)}))

				var res = yield this.request("/initiatives/" + initiative.uuid)
				res.statusCode.must.equal(200)
				res.body.must.not.include(t("THANKS_FOR_SIGNING"))
				res.body.must.not.include(t("THANKS_FOR_SIGNING_AGAIN"))
				res.body.must.not.include("donate-form")
			})

			describe(`on ${PARLIAMENT_SITE_HOSTNAME}`, function() {
				it("must render initiative without destination", function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative({
						user_id: this.author.id,
						phase: "edit",
						destination: null
					}))

					yield createTopic(newTopic({
						id: initiative.uuid,
						creatorId: this.author.uuid,
						sourcePartnerId: this.partner.id,
						status: "inProgress",
						visibility: "public"
					}))

					var res = yield this.request("/initiatives/" + initiative.uuid, {
						headers: {Host: PARLIAMENT_SITE_HOSTNAME}
					})

					res.statusCode.must.equal(200)
				})

				it(`must redirect initiative destined to local to ${LOCAL_SITE_HOSTNAME}`, function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative({
						user_id: this.author.id,
						phase: "edit",
						destination: "muhu-vald"
					}))

					yield createTopic(newTopic({
						id: initiative.uuid,
						creatorId: this.author.uuid,
						sourcePartnerId: this.partner.id,
						status: "inProgress",
						visibility: "public"
					}))

					var path = "/initiatives/" + initiative.uuid + "?foo=bar"
					var res = yield this.request(path, {
						headers: {Host: PARLIAMENT_SITE_HOSTNAME}
					})

					res.statusCode.must.equal(301)
					res.headers.location.must.equal(Config.localUrl + path)
				})
			})

			describe(`on ${LOCAL_SITE_HOSTNAME}`, function() {
				Object.keys(LOCAL_GOVERNMENTS).forEach(function(dest) {
					it(`must render initiative destined to ${dest}`, function*() {
						var initiative = yield initiativesDb.create(new ValidInitiative({
							user_id: this.author.id,
							phase: "sign",
							destination: dest
						}))

						var topic = yield createTopic(newTopic({
							id: initiative.uuid,
							creatorId: this.author.uuid,
							sourcePartnerId: this.partner.id,
							status: "voting",
							visibility: "public"
						}))

						yield createVote(topic, newVote())

						var res = yield this.request("/initiatives/" + initiative.uuid, {
							headers: {Host: LOCAL_SITE_HOSTNAME}
						})

						res.statusCode.must.equal(200)
					})
				})

				it(`must redirect initiative without destination to ${PARLIAMENT_SITE_HOSTNAME}`, function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative({
						user_id: this.author.id,
						phase: "edit",
						destination: null
					}))

					yield createTopic(newTopic({
						id: initiative.uuid,
						creatorId: this.author.uuid,
						sourcePartnerId: this.partner.id,
						status: "inProgress",
						visibility: "public"
					}))

					var path = "/initiatives/" + initiative.uuid + "?foo=bar"
					var res = yield this.request(path, {
						headers: {Host: LOCAL_SITE_HOSTNAME}
					})

					res.statusCode.must.equal(301)
					res.headers.location.must.equal(Config.url + path)
				})

				it(`must redirect initiative destined to parliament to ${PARLIAMENT_SITE_HOSTNAME}`, function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative({
						user_id: this.author.id,
						phase: "edit",
						destination: "parliament"
					}))

					yield createTopic(newTopic({
						id: initiative.uuid,
						creatorId: this.author.uuid,
						sourcePartnerId: this.partner.id,
						status: "inProgress",
						visibility: "public"
					}))

					var path = "/initiatives/" + initiative.uuid + "?foo=bar"
					var res = yield this.request(path, {
						headers: {Host: LOCAL_SITE_HOSTNAME}
					})

					res.statusCode.must.equal(301)
					res.headers.location.must.equal(Config.url + path)
				})
			})
		})

		describe("when logged in", function() {
			require("root/test/fixtures").user()

			it("must render private initiative if creator", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: this.author.id
				}))

				yield createTopic(newTopic({
					id: initiative.uuid,
					creatorId: this.user.uuid,
					sourcePartnerId: this.partner.id,
					visibility: "private"
				}))

				var res = yield this.request("/initiatives/" + initiative.uuid)
				res.statusCode.must.equal(200)
			})

			;["admin", "edit"].forEach(function(perm) {
				it("must render private initiative if admin permission", function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative({
						user_id: this.author.id
					}))

					yield createTopic(newTopic({
						id: initiative.uuid,
						creatorId: this.author.uuid,
						sourcePartnerId: this.partner.id,
						visibility: "private"
					}))

					yield createPermission(newPermission({
						userId: this.user.uuid,
						topicId: initiative.uuid,
						level: perm
					}))

					var res = yield this.request("/initiatives/" + initiative.uuid)
					res.statusCode.must.equal(200)
				})
			})

			it("must respond with 403 for private discussion of other user",
				function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: this.author.id
				}))

				yield createTopic(newTopic({
					id: initiative.uuid,
					creatorId: this.author.uuid,
					sourcePartnerId: this.partner.id,
					visibility: "private"
				}))

				var res = yield this.request("/initiatives/" + initiative.uuid)
				res.statusCode.must.equal(403)
				res.statusMessage.must.match(/public/i)
			})

			it("must render initiative in edit phase", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					destination: "parliament"
				}))

				yield createTopic(newTopic({
					id: initiative.uuid,
					creatorId: this.author.uuid,
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

			it("must render subscription form without email if person lacks one",
				function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: this.author.id
				}))

				yield createTopic(newTopic({
					id: initiative.uuid,
					creatorId: this.author.uuid,
					sourcePartnerId: this.partner.id,
					visibility: "public"
				}))

				var res = yield this.request("/initiatives/" + initiative.uuid)
				res.statusCode.must.equal(200)

				var dom = parseDom(res.body)
				var form = dom.querySelector(".initiative-subscribe-form")
				form.querySelector("input[name=email]").value.must.equal("")
			})

			it("must render subscription form with person's confirmed email",
				function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: this.author.id
				}))

				yield createTopic(newTopic({
					id: initiative.uuid,
					creatorId: this.author.uuid,
					sourcePartnerId: this.partner.id,
					visibility: "public"
				}))

				yield usersDb.update(this.user, {
					email: "user@example.com",
					email_confirmed_at: new Date
				})

				var res = yield this.request("/initiatives/" + initiative.uuid)
				res.statusCode.must.equal(200)

				var dom = parseDom(res.body)
				var form = dom.querySelector(".initiative-subscribe-form")
				var input = form.querySelector("input[name=email]")
				input.value.must.equal("user@example.com")
			})

			it("must render subscription form with person's unconfirmed email",
				function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: this.author.id
				}))

				yield createTopic(newTopic({
					id: initiative.uuid,
					creatorId: this.author.uuid,
					sourcePartnerId: this.partner.id,
					visibility: "public"
				}))

				yield usersDb.update(this.user, {
					unconfirmed_email: "user@example.com",
					email_confirmation_token: Crypto.randomBytes(12)
				})

				var res = yield this.request("/initiatives/" + initiative.uuid)
				res.statusCode.must.equal(200)

				var dom = parseDom(res.body)
				var form = dom.querySelector(".initiative-subscribe-form")
				var input = form.querySelector("input[name=email]")
				input.value.must.equal("user@example.com")
			})

			it("must render comment form mentioning missing email", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: this.author.id
				}))

				yield createTopic(newTopic({
					id: initiative.uuid,
					creatorId: this.author.uuid,
					sourcePartnerId: this.partner.id,
					visibility: "public"
				}))

				var res = yield this.request("/initiatives/" + initiative.uuid)
				res.statusCode.must.equal(200)

				var dom = parseDom(res.body)
				var form = dom.getElementById("comment-form")
				var check = form.querySelector("input[type=checkbox][name=subscribe]")
				check.checked.must.be.false()
				check.disabled.must.be.true()

				form.innerHTML.must.include(t("SUBSCRIBE_TO_COMMENTS_SET_EMAIL", {
					userUrl: "/user"
				}))
			})

			it("must render comment form mentioning unconfirmed email",
				function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: this.author.id
				}))

				yield createTopic(newTopic({
					id: initiative.uuid,
					creatorId: this.author.uuid,
					sourcePartnerId: this.partner.id,
					visibility: "public"
				}))

				yield usersDb.update(this.user, {
					unconfirmed_email: "user@example.com",
					email_confirmation_token: Crypto.randomBytes(12)
				})

				var res = yield this.request("/initiatives/" + initiative.uuid)
				res.statusCode.must.equal(200)

				var dom = parseDom(res.body)
				var form = dom.getElementById("comment-form")
				var check = form.querySelector("input[type=checkbox][name=subscribe]")
				check.checked.must.be.false()
				check.disabled.must.be.true()

				form.textContent.must.include(
					t("SUBSCRIBE_TO_COMMENTS_CONFIRM_EMAIL")
				)
			})

			it("must render comment form if user has confirmed email", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: this.author.id
				}))

				yield createTopic(newTopic({
					id: initiative.uuid,
					creatorId: this.author.uuid,
					sourcePartnerId: this.partner.id,
					visibility: "public"
				}))

				yield usersDb.update(this.user, {
					email: "user@example.com",
					email_confirmed_at: new Date
				})

				var res = yield this.request("/initiatives/" + initiative.uuid)
				res.statusCode.must.equal(200)

				var dom = parseDom(res.body)
				var form = dom.getElementById("comment-form")
				var check = form.querySelector("input[type=checkbox][name=subscribe]")
				check.checked.must.be.false()

				form.textContent.must.not.include(t("SUBSCRIBE_TO_COMMENTS_SET_EMAIL"))

				form.textContent.must.not.include(
					t("SUBSCRIBE_TO_COMMENTS_CONFIRM_EMAIL")
				)
			})

			it("must render subscribe checkbox if subscribed to initiative comments",
				function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: this.author.id
				}))

				yield createTopic(newTopic({
					id: initiative.uuid,
					creatorId: this.author.uuid,
					sourcePartnerId: this.partner.id,
					visibility: "public"
				}))

				yield usersDb.update(this.user, {
					email: "user@example.com",
					email_confirmed_at: new Date
				})

				yield subscriptionsDb.create(new ValidSubscription({
					initiative_uuid: initiative.uuid,
					email: "user@example.com",
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

				yield usersDb.update(this.user, {
					email: "user@example.com",
					email_confirmed_at: new Date
				})

				yield subscriptionsDb.create(new ValidSubscription({
					initiative_uuid: initiative.uuid,
					email: "user@example.com",
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
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: this.author.id
				}))

				yield createTopic(newTopic({
					id: initiative.uuid,
					creatorId: this.author.uuid,
					sourcePartnerId: this.partner.id,
					visibility: "public"
				}))

				yield usersDb.update(this.user, {
					email: "user@example.com",
					email_confirmed_at: new Date
				})

				yield subscriptionsDb.create(new ValidSubscription({
					initiative_uuid: initiative.uuid,
					email: "user@example.com",
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
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: this.author.id
				}))

				yield createTopic(newTopic({
					id: initiative.uuid,
					creatorId: this.author.uuid,
					sourcePartnerId: this.partner.id,
					visibility: "public"
				}))	

				yield usersDb.update(this.user, {
					email: "user@example.com",
					email_confirmed_at: new Date
				})

				yield subscriptionsDb.create(new ValidSubscription({
					email: "user@example.com",
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

			it("must not show event creation button if in edit phase", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "edit"
				}))

				yield createTopic(newTopic({
					id: initiative.uuid,
					creatorId: this.user.uuid,
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
						user_id: this.author.id,
						phase: phase
					}))

					var topic = yield createTopic(newTopic({
						id: initiative.uuid,
						creatorId: this.user.uuid,
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
					user_id: this.author.id,
					phase: "sign"
				}))

				var topic = yield createTopic(newTopic({
					id: initiative.uuid,
					creatorId: this.author.uuid,
					sourcePartnerId: this.partner.id,
					status: "voting"
				}))

				yield createVote(topic, newVote())

				var res = yield this.request("/initiatives/" + initiative.uuid)
				res.statusCode.must.equal(200)
				res.body.must.not.include(t("CREATE_INITIATIVE_EVENT_BUTTON"))
			})

			it("must not show thanks if not signed", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "sign"
				}))

				var topic = yield createTopic(newTopic({
					id: initiative.uuid,
					creatorId: this.author.uuid,
					sourcePartnerId: this.partner.id,
					status: "voting"
				}))

				yield createVote(topic, newVote({endsAt: DateFns.addDays(new Date, 1)}))

				var res = yield this.request("/initiatives/" + initiative.uuid)
				res.statusCode.must.equal(200)
				res.body.must.not.include(t("THANKS_FOR_SIGNING"))
				res.body.must.not.include(t("THANKS_FOR_SIGNING_AGAIN"))
			})

			describe(`on ${PARLIAMENT_SITE_HOSTNAME}`, function() {
				it("must not render send to parliament button if not enough signatures",
					function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative({
						user_id: this.author.id,
						phase: "sign"
					}))

					var topic = yield createTopic(newTopic({
						id: initiative.uuid,
						creatorId: this.user.uuid,
						sourcePartnerId: this.partner.id,
						status: "voting"
					}))

					var vote = yield createVote(topic, newVote())
					yield createCitizenSignatures(vote, Config.votesRequired - 1)

					var res = yield this.request("/initiatives/" + initiative.uuid)
					res.statusCode.must.equal(200)
					res.body.must.not.include(t("SEND_TO_PARLIAMENT"))
				})

				it("must render send to parliament button if enough signatures",
					function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative({
						user_id: this.author.id,
						phase: "sign"
					}))

					var topic = yield createTopic(newTopic({
						id: initiative.uuid,
						creatorId: this.user.uuid,
						sourcePartnerId: this.partner.id,
						status: "voting"
					}))

					var vote = yield createVote(topic, newVote())
					yield createCitizenSignatures(vote, Config.votesRequired)

					var res = yield this.request("/initiatives/" + initiative.uuid)
					res.statusCode.must.equal(200)
					res.body.must.include(t("SEND_TO_PARLIAMENT"))
				})

				it("must render send to parliament button if has paper signatures",
					function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative({
						user_id: this.author.id,
						phase: "sign",
						has_paper_signatures: true
					}))

					var topic = yield createTopic(newTopic({
						id: initiative.uuid,
						creatorId: this.user.uuid,
						sourcePartnerId: this.partner.id,
						status: "voting"
					}))

					var vote = yield createVote(topic, newVote())
					yield createCitizenSignatures(vote, 1)

					var res = yield this.request("/initiatives/" + initiative.uuid)
					res.statusCode.must.equal(200)
					res.body.must.include(t("SEND_TO_PARLIAMENT"))
				})

				it("must not render send to parliament button if only has paper signatures", function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative({
						user_id: this.author.id,
						phase: "sign",
						has_paper_signatures: true
					}))

					var topic = yield createTopic(newTopic({
						id: initiative.uuid,
						creatorId: this.user.uuid,
						sourcePartnerId: this.partner.id,
						status: "voting"
					}))

					yield createVote(topic, newVote())

					var res = yield this.request("/initiatives/" + initiative.uuid)
					res.statusCode.must.equal(200)
					res.body.must.not.include(t("SEND_TO_PARLIAMENT"))
				})
			})

			describe(`on ${LOCAL_SITE_HOSTNAME}`, function() {
				it("must not render send to government button if not enough signatures",
					function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative({
						user_id: this.author.id,
						phase: "sign",
						destination: "muhu-vald"
					}))

					var topic = yield createTopic(newTopic({
						id: initiative.uuid,
						creatorId: this.user.uuid,
						sourcePartnerId: this.partner.id,
						status: "voting"
					}))

					var vote = yield createVote(topic, newVote())
					var threshold = LOCAL_GOVERNMENTS["muhu-vald"].population * 0.01
					yield createCitizenSignatures(vote, Math.round(threshold) - 1)

					var res = yield this.request("/initiatives/" + initiative.uuid, {
						headers: {Host: LOCAL_SITE_HOSTNAME}
					})

					res.statusCode.must.equal(200)
					res.body.must.not.include(t("SEND_TO_PARLIAMENT"))
				})

				it("must not render send to government button if enough signatures",
					function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative({
						user_id: this.author.id,
						phase: "sign",
						destination: "muhu-vald"
					}))

					var topic = yield createTopic(newTopic({
						id: initiative.uuid,
						creatorId: this.user.uuid,
						sourcePartnerId: this.partner.id,
						status: "voting"
					}))

					var vote = yield createVote(topic, newVote())
					var threshold = LOCAL_GOVERNMENTS["muhu-vald"].population * 0.01
					yield createCitizenSignatures(vote, Math.round(threshold))

					var res = yield this.request("/initiatives/" + initiative.uuid, {
						headers: {Host: LOCAL_SITE_HOSTNAME}
					})

					res.statusCode.must.equal(200)
					res.body.must.not.include(t("SEND_TO_PARLIAMENT"))
				})
			})
		})
	})

	describe(`GET /:id for image/*`, function() {
		beforeEach(function*() {
			this.partner = yield createPartner(newPartner({id: Config.apiPartnerId}))
			this.author = yield createUser()

			this.initiative = yield initiativesDb.create(new ValidInitiative({
				user_id: this.author.id
			}))

			yield createTopic(newTopic({
				id: this.initiative.uuid,
				creatorId: this.author.uuid,
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
			res.body.equals(PNG_PREVIEW).must.be.true()
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
			res.body.equals(PNG_PREVIEW).must.be.true()
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
			res.body.equals(PNG_PREVIEW).must.be.true()
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

	describe(`GET /:id for ${INITIATIVE_TYPE}`, function() {
		beforeEach(function*() {
			this.partner = yield createPartner(newPartner({id: Config.apiPartnerId}))
			this.author = yield createUser()
		})

		it("must respond with 403 for a private initiative", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				user_id: this.author.id
			}))

			yield createTopic(newTopic({
				id: initiative.uuid,
				creatorId: this.author.uuid,
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
			var initiative = yield initiativesDb.create(new ValidInitiative({
				user_id: this.author.id
			}))

			yield createTopic(newTopic({
				id: initiative.uuid,
				creatorId: this.author.uuid,
				sourcePartnerId: this.partner.id,
				visibility: "public",
				deletedAt: new Date
			}))

			var res = yield this.request("/initiatives/" + initiative.uuid, {
				headers: {Accept: INITIATIVE_TYPE}
			})

			res.statusCode.must.equal(404)
		})

		it("must respond with initiative", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				user_id: this.author.id
			}))

			yield createTopic(newTopic({
				id: initiative.uuid,
				title: "Better life for everyone.",
				creatorId: this.author.uuid,
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
				id: initiative.uuid,
				title: "Better life for everyone.",
				phase: "edit",
				signatureCount: 0
			})
		})

		it("must respond with external initiative", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				title: "Better life for everyone.",
				external: true,
				phase: "parliament"
			}))

			var res = yield this.request("/initiatives/" + initiative.uuid, {
				headers: {Accept: INITIATIVE_TYPE}
			})

			res.statusCode.must.equal(200)

			res.body.must.eql({
				id: initiative.uuid,
				title: "Better life for everyone.",
				phase: "parliament",
				signatureCount: null
			})
		})

		it("must respond with signature count", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				phase: "sign"
			}))

			var topic = yield createTopic(newTopic({
				id: initiative.uuid,
				title: "Better life for everyone.",
				creatorId: this.author.uuid,
				sourcePartnerId: this.partner.id,
				status: "voting"
			}))

			var vote = yield createVote(topic, newVote({endsAt: new Date}))
			yield createCitizenSignatures(vote, 5)

			yield signaturesDb.create(_.times(3, () => new ValidSignature({
				initiative_uuid: initiative.uuid
			})))

			var res = yield this.request("/initiatives/" + initiative.uuid, {
				headers: {Accept: INITIATIVE_TYPE}
			})

			res.statusCode.must.equal(200)

			res.body.must.eql({
				id: initiative.uuid,
				title: "Better life for everyone.",
				phase: "sign",
				signatureCount: 8
			})
		})
	})

	describe(`GET /:id for ${ATOM_TYPE}`, function() {
		beforeEach(function*() {
			this.partner = yield createPartner(newPartner({id: Config.apiPartnerId}))
			this.author = yield createUser()
		})

		it("must respond with Atom feed", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				user_id: this.author.id
			}))

			var topic = yield createTopic(newTopic({
				id: initiative.uuid,
				title: "Better life for everyone.",
				creatorId: this.author.uuid,
				sourcePartnerId: this.partner.id,
				visibility: "public"
			}))

			var path = `/initiatives/${initiative.uuid}`
			var res = yield this.request(path, {headers: {Accept: ATOM_TYPE}})
			res.statusCode.must.equal(200)
			res.headers["content-type"].must.equal(ATOM_TYPE)

			var feed = Atom.parse(res.body).feed
			feed.id.$.must.equal(Config.url + path)
			feed.updated.$.must.equal(topic.updatedAt.toJSON())

			feed.title.$.must.equal(t("ATOM_INITIATIVE_FEED_TITLE", {
				title: "Better life for everyone."
			}))

			var links = _.indexBy(feed.link, (link) => link.rel)
			links.self.href.must.equal(Config.url + path + ".atom")
			links.self.type.must.equal(ATOM_TYPE)
			links.alternate.href.must.equal(Config.url + path)
			links.alternate.type.must.equal("text/html")

			feed.author.name.$.must.equal(Config.title)
			feed.author.uri.$.must.equal(Config.url)
		})

		it("must respond with correct feed id given .atom extension", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				external: true
			}))

			var path = `/initiatives/${initiative.uuid}`
			var res = yield this.request(path + ".atom")
			res.statusCode.must.equal(200)
			res.headers["content-type"].must.equal(ATOM_TYPE)

			var feed = Atom.parse(res.body).feed
			feed.id.$.must.equal(Config.url + path)

			var links = _.indexBy(feed.link, (link) => link.rel)
			links.self.href.must.equal(Config.url + path + ".atom")
			links.self.type.must.equal(ATOM_TYPE)
			links.alternate.href.must.equal(Config.url + path)
			links.alternate.type.must.equal("text/html")
		})

		it("must respond given an external initiative", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				external: true,
				title: "Better life for everyone."
			}))

			var res = yield this.request(`/initiatives/${initiative.uuid}.atom`)
			res.statusCode.must.equal(200)
			res.headers["content-type"].must.equal(ATOM_TYPE)

			var feed = Atom.parse(res.body).feed
			feed.updated.$.must.equal(initiative.created_at.toJSON())

			feed.title.$.must.equal(t("ATOM_INITIATIVE_FEED_TITLE", {
				title: "Better life for everyone."
			}))
		})

		it("must use last event's time for feed update", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				user_id: this.author.id
			}))

			yield createTopic(newTopic({
				id: initiative.uuid,
				title: "Better life for everyone.",
				creatorId: this.author.uuid,
				sourcePartnerId: this.partner.id,
				visibility: "public"
			}))

			var author = yield usersDb.create(new ValidUser({name: "Johnny Lang"}))

			var events = yield eventsDb.create([new ValidEvent({
				initiative_uuid: initiative.uuid,
				user_id: author.id,
				title: "We sent it.",
				content: "To somewhere.",
				created_at: new Date(2015, 5, 18),
				updated_at: new Date(2015, 5, 19),
				occurred_at: new Date(2015, 5, 20)
			}), new ValidEvent({
				initiative_uuid: initiative.uuid,
				user_id: author.id,
				title: "They got it.",
				content: "From somewhere.",
				created_at: new Date(2015, 5, 21),
				updated_at: new Date(2015, 5, 22),
				occurred_at: new Date(2015, 5, 23)
			})])

			var res = yield this.request(`/initiatives/${initiative.uuid}.atom`)
			res.statusCode.must.equal(200)

			var feed = Atom.parse(res.body).feed
			feed.updated.$.must.equal(events[1].updated_at.toJSON())
		})

		it("must use initiative updated time if no events", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				user_id: this.author.id
			}))

			var topic = yield createTopic(newTopic({
				id: initiative.uuid,
				title: "Better life for everyone.",
				creatorId: this.author.uuid,
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
				user_id: this.author.id,
				phase: "sign",
				signature_milestones: {
					[milestones[0]]: DateFns.addDays(new Date, -5),
					[milestones[1]]: DateFns.addDays(new Date, -3),
					[milestones[2]]: DateFns.addDays(new Date, -1)
				}
			}))

			var topic = yield createTopic(newTopic({
				id: initiative.uuid,
				creatorId: this.author.uuid,
				sourcePartnerId: this.partner.id,
				status: "voting"
			}))

			var vote = yield createVote(topic, newVote())
			yield createCitizenSignatures(vote, Config.votesRequired)

			var res = yield this.request(`/initiatives/${initiative.uuid}.atom`)
			res.statusCode.must.equal(200)

			var events = milestones.map((count) => ({
				id: "milestone-" + count,
				occurred_at: initiative.signature_milestones[count],
				title: t("SIGNATURE_MILESTONE_EVENT_TITLE", {milestone: count})
			}))

			Atom.parse(res.body).feed.entry.forEach(function(entry, i) {
				var event = events[i]
				var initiativeUrl = `${Config.url}/initiatives/${initiative.uuid}`
				var eventUrl = `${initiativeUrl}#event-${event.id}`

				entry.must.eql({
					id: {$: `${initiativeUrl}/events/${event.id}`},
					link: {rel: "alternate", type: "text/html", href: eventUrl},
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
			var initiativeUrl = `${Config.url}/initiatives/${initiative.uuid}`
			var eventUrl = `${initiativeUrl}#event-sent-to-parliament`

			entry.must.eql({
				id: {$: `${initiativeUrl}/events/sent-to-parliament`},
				link: {rel: "alternate", type: "text/html", href: eventUrl},
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
			var initiativeUrl = `${Config.url}/initiatives/${initiative.uuid}`
			var eventUrl = `${initiativeUrl}#event-${event.id}`

			entry.must.eql({
				id: {$: `${initiativeUrl}/events/${event.id}`},
				link: {rel: "alternate", type: "text/html", href: eventUrl},
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
			var initiativeUrl = `${Config.url}/initiatives/${initiative.uuid}`
			var eventUrl = `${initiativeUrl}#event-${event.id}`

			entry.must.eql({
				id: {$: `${initiativeUrl}/events/${event.id}`},
				link: {rel: "alternate", type: "text/html", href: eventUrl},
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
			var initiativeUrl = `${Config.url}/initiatives/${initiative.uuid}`
			var eventUrl = `${initiativeUrl}#event-${event.id}`

			entry.must.eql({
				id: {$: `${initiativeUrl}/events/${event.id}`},
				link: {rel: "alternate", type: "text/html", href: eventUrl},
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
			var initiativeUrl = `${Config.url}/initiatives/${initiative.uuid}`
			var eventUrl = `${initiativeUrl}#event-${event.id}`

			entry.must.eql({
				id: {$: `${initiativeUrl}/events/${event.id}`},
				link: {rel: "alternate", type: "text/html", href: eventUrl},
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
				var initiativeUrl = `${Config.url}/initiatives/${initiative.uuid}`
				var eventUrl = `${initiativeUrl}#event-${event.id}`

				entry.must.eql({
					id: {$: `${initiativeUrl}/events/${event.id}`},
					link: {rel: "alternate", type: "text/html", href: eventUrl},
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
						: decision == "draft-act-or-national-matter"
						? t("PARLIAMENT_MEETING_DECISION_DRAFT_ACT_OR_NATIONAL_MATTER")
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
			var initiativeUrl = `${Config.url}/initiatives/${initiative.uuid}`
			var eventUrl = `${initiativeUrl}#event-${event.id}`

			entry.must.eql({
				id: {$: `${initiativeUrl}/events/${event.id}`},
				link: {rel: "alternate", type: "text/html", href: eventUrl},
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
			var initiativeUrl = `${Config.url}/initiatives/${initiative.uuid}`
			var eventUrl = `${initiativeUrl}#event-${event.id}`

			entry.must.eql({
				id: {$: `${initiativeUrl}/events/${event.id}`},
				link: {rel: "alternate", type: "text/html", href: eventUrl},
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
			var initiativeUrl = `${Config.url}/initiatives/${initiative.uuid}`
			var eventUrl = `${initiativeUrl}#event-${event.id}`

			entry.must.eql({
				id: {$: `${initiativeUrl}/events/${event.id}`},
				link: {rel: "alternate", type: "text/html", href: eventUrl},
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
			var initiativeUrl = `${Config.url}/initiatives/${initiative.uuid}`
			var eventUrl = `${initiativeUrl}#event-${event.id}`

			entry.must.eql({
				id: {$: `${initiativeUrl}/events/${event.id}`},
				link: {rel: "alternate", type: "text/html", href: eventUrl},
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
			var initiativeUrl = `${Config.url}/initiatives/${initiative.uuid}`
			var eventUrl = `${initiativeUrl}#event-${event.id}`

			entry.must.eql({
				id: {$: `${initiativeUrl}/events/${event.id}`},
				link: {rel: "alternate", type: "text/html", href: eventUrl},
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
			var initiativeUrl = `${Config.url}/initiatives/${initiative.uuid}`
			var eventUrl = `${initiativeUrl}#event-${event.id}`

			entry.must.eql({
				id: {$: `${initiativeUrl}/events/${event.id}`},
				link: {rel: "alternate", type: "text/html", href: eventUrl},
				updated: {$: event.updated_at.toJSON()},
				published: {$: event.occurred_at.toJSON()},
				title: {$: t("PARLIAMENT_NATIONAL_MATTER")}
			})
		})

		PARLIAMENT_DECISIONS.forEach(function(decision) {
			it(`must respond if initiative in parliament and finished with ${decision} decision`, function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "parliament",
					sent_to_parliament_at: DateFns.addDays(new Date, -30),
					parliament_decision: decision,
					finished_in_parliament_at: DateFns.addDays(new Date, -5)
				}))

				yield createTopic(newTopic({
					id: initiative.uuid,
					title: "Better life for everyone.",
					creatorId: this.author.uuid,
					sourcePartnerId: this.partner.id,
					status: "followUp"
				}))

				var res = yield this.request(`/initiatives/${initiative.uuid}.atom`)
				res.statusCode.must.equal(200)

				var entries = Atom.parse(res.body).feed.entry
				entries.length.must.equal(2)
				entries[0].id.$.must.match(/\/sent-to-parliament$/)

				var initiativeUrl = `${Config.url}/initiatives/${initiative.uuid}`
				var eventUrl = `${initiativeUrl}#event-parliament-finished`

				entries[1].must.eql({
					id: {$: `${initiativeUrl}/events/parliament-finished`},
					link: {rel: "alternate", type: "text/html", href: eventUrl},
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
						: decision == "draft-act-or-national-matter"
						? t("PARLIAMENT_DECISION_DRAFT_ACT_OR_NATIONAL_MATTER")
						: null
					}
				})
			})

			it(`must respond if initiative in parliament and finished event with ${decision} decision`, function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "parliament",
					sent_to_parliament_at: DateFns.addDays(new Date, -30),
					parliament_decision: decision,
					finished_in_parliament_at: DateFns.addDays(new Date, -5)
				}))

				yield createTopic(newTopic({
					id: initiative.uuid,
					title: "Better life for everyone.",
					creatorId: this.author.uuid,
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

				var initiativeUrl = `${Config.url}/initiatives/${initiative.uuid}`
				var eventUrl = `${initiativeUrl}#event-${event.id}`

				entries[1].must.eql({
					id: {$: `${initiativeUrl}/events/${event.id}`},
					link: {rel: "alternate", type: "text/html", href: eventUrl},
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
						: decision == "draft-act-or-national-matter"
						? t("PARLIAMENT_DECISION_DRAFT_ACT_OR_NATIONAL_MATTER")
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
			var initiativeUrl = `${Config.url}/initiatives/${initiative.uuid}`
			var eventUrl = `${initiativeUrl}#event-sent-to-government`

			entry.must.eql({
				id: {$: `${initiativeUrl}/events/sent-to-government`},
				link: {rel: "alternate", type: "text/html", href: eventUrl},
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

			var initiativeUrl = `${Config.url}/initiatives/${initiative.uuid}`
			var eventUrl = `${initiativeUrl}#event-finished-in-government`

			entries[1].must.eql({
				id: {$: `${initiativeUrl}/events/finished-in-government`},
				link: {rel: "alternate", type: "text/html", href: eventUrl},
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

			var author = yield usersDb.create(new ValidUser({name: "Johnny Lang"}))

			var event = yield eventsDb.create(new ValidEvent({
				initiative_uuid: initiative.uuid,
				user_id: author.id,
				title: "This just in.",
				content: "Everything is fine!",
				created_at: pseudoDateTime(),
				occurred_at: pseudoDateTime()
			}))

			var res = yield this.request(`/initiatives/${initiative.uuid}.atom`)
			res.statusCode.must.equal(200)

			var initiativeUrl = `${Config.url}/initiatives/${initiative.uuid}`
			var eventUrl = `${initiativeUrl}#event-${event.id}`

			Atom.parse(res.body).feed.entry.must.eql({
				id: {$: `${initiativeUrl}/events/${event.id}`},
				link: {rel: "alternate", type: "text/html", href: eventUrl},
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

			describe("given destination", function() {
				it("must set destination to null given empty string", function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative({
						user_id: this.user.id,
						destination: "tallinn"
					}))

					yield createTopic(newTopic({
						id: initiative.uuid,
						creatorId: this.user.uuid,
						sourcePartnerId: this.partner.id
					}))

					var res = yield this.request(`/initiatives/${initiative.uuid}`, {
						method: "PUT",
						form: {_csrf_token: this.csrfToken, destination: ""}
					})

					res.statusCode.must.equal(303)
					res.headers.location.must.equal(`/initiatives/${initiative.uuid}`)

					yield initiativesDb.read(initiative).must.then.eql({
						__proto__: initiative,
						destination: null
					})
				})

				concat(
					"parliament",
					Object.keys(LOCAL_GOVERNMENTS)
				).forEach(function(dest) {
					it(`must update destination to ${dest}`, function*() {
						var initiative = yield initiativesDb.create(new ValidInitiative({
							user_id: this.user.id
						}))

						yield createTopic(newTopic({
							id: initiative.uuid,
							creatorId: this.user.uuid,
							sourcePartnerId: this.partner.id
						}))

						var res = yield this.request(`/initiatives/${initiative.uuid}`, {
							method: "PUT",
							form: {_csrf_token: this.csrfToken, destination: dest}
						})

						res.statusCode.must.equal(303)
						res.headers.location.must.equal(`/initiatives/${initiative.uuid}`)

						yield initiativesDb.read(initiative).must.then.eql({
							__proto__: initiative,
							destination: dest
						})
					})
				})

				it("must respond with 422 given invalid destination", function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative({
						user_id: this.user.id
					}))

					yield createTopic(newTopic({
						id: initiative.uuid,
						creatorId: this.user.uuid,
						sourcePartnerId: this.partner.id
					}))

					var res = yield this.request(`/initiatives/${initiative.uuid}`, {
						method: "PUT",
						form: {_csrf_token: this.csrfToken, destination: "foo"}
					})

					res.statusCode.must.equal(422)
					res.statusMessage.must.equal("Destination Invalid")
					yield initiativesDb.read(initiative).must.then.eql(initiative)
				})

				it("must not update initiative destination after edit phase",
					function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative({
						user_id: this.user.id,
						phase: "sign"
					}))

					var topic = yield createTopic(newTopic({
						id: initiative.uuid,
						creatorId: this.user.uuid,
						sourcePartnerId: this.partner.id
					}))

					yield createVote(topic, newVote())

					var res = yield this.request(`/initiatives/${initiative.uuid}`, {
						method: "PUT",
						form: {_csrf_token: this.csrfToken, destination: "muhu-vald"}
					})

					res.statusCode.must.equal(303)
					res.headers.location.must.equal(`/initiatives/${initiative.uuid}`)
					yield initiativesDb.read(initiative).must.then.eql(initiative)
				})
			})

			describe("given visibility=public", function() {
				it("must render update visibility page", function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative({
						user_id: this.user.id
					}))

					yield createTopic(newTopic({
						id: initiative.uuid,
						creatorId: this.user.uuid,
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
					var initiative = yield initiativesDb.create(new ValidInitiative({
						user_id: this.user.id
					}))

					var topic = yield createTopic(newTopic({
						id: initiative.uuid,
						creatorId: this.user.uuid,
						sourcePartnerId: this.partner.id,
						visibility: "private"
					}))

					var today = DateFns.startOfDay(new Date)
					var endsAt = DateFns.endOfDay(DateFns.addDays(today, 5))

					var updated = 0
					this.router.put(`/api/users/self/topics/${topic.id}`,
						next(function*(req, res) {
						++updated
						req.body.must.eql({visibility: "public", endsAt: endsAt.toJSON()})
						res.end()

						yield cosDb("Topics").where("id", topic.id).update({
							visibility: "public"
						})
					}))

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

					var cookies = parseCookies(res.headers["set-cookie"])
					res = yield this.request(res.headers.location, {
						headers: {Cookie: Http.serializeCookies(cookies)}
					})

					res.statusCode.must.equal(200)
					res.body.must.include(t("PUBLISHED_INITIATIVE"))
				})

				it("must clear end email when setting discussion end time",
					function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative({
						user_id: this.user.id,
						discussion_end_email_sent_at: new Date
					}))

					var topic = yield createTopic(newTopic({
						id: initiative.uuid,
						creatorId: this.user.uuid,
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
						user_id: this.user.id,
						discussion_end_email_sent_at: new Date
					}))

					yield createTopic(newTopic({
						id: initiative.uuid,
						creatorId: this.user.uuid,
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
					var initiative = yield initiativesDb.create(new ValidInitiative({
						user_id: this.user.id,
						destination: "parliament"
					}))

					yield createTopic(newTopic({
						id: initiative.uuid,
						creatorId: this.user.uuid,
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
					var initiative = yield initiativesDb.create(new ValidInitiative({
						user_id: this.user.id,
						destination: "parliament"
					}))

					var topic = yield createTopic(newTopic({
						id: initiative.uuid,
						creatorId: this.user.uuid,
						sourcePartnerId: this.partner.id,
						createdAt: DateFns.addDays(new Date, -Config.minDeadlineDays),
						visibility: "public"
					}))

					var endsAt = DateFns.endOfDay(DateFns.addDays(new Date, 30))

					this.router.post(`/api/users/self/topics/${topic.id}/votes`,
						next(function*(req, res) {
						req.body.must.eql({
							endsAt: endsAt.toJSON(),
							authType: "hard",
							voteType: "regular",
							delegationIsAllowed: false,
							options: [{value: "Yes"}, {value: "No"}]
						})

						res.end()

						yield createVote(topic, newVote())
					}))

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

					var cookies = parseCookies(res.headers["set-cookie"])
					res = yield this.request(res.headers.location, {
						headers: {Cookie: Http.serializeCookies(cookies)}
					})

					res.statusCode.must.equal(200)
					res.body.must.include(t("INITIATIVE_SIGN_PHASE_UPDATED"))

					yield initiativesDb.search(sql`
						SELECT * FROM initiatives
					`).must.then.eql([{
						__proto__: initiative,
						phase: "sign",
						text: topic.description,
						text_type: new MediaType("text/html"),
						text_sha256: sha256(topic.description)
					}])
				})

				it("must respond with 403 if less than 3 days passed", function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative({
						user_id: this.user.id,
						destination: "parliament"
					}))

					yield createTopic(newTopic({
						id: initiative.uuid,
						creatorId: this.user.uuid,
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
					var initiative = yield initiativesDb.create(new ValidInitiative({
						user_id: this.user.id,
						destination: "parliament"
					}))

					var topic = yield createTopic(newTopic({
						id: initiative.uuid,
						creatorId: this.user.uuid,
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
						phase: "sign",
						text: topic.description,
						text_type: new MediaType("text/html"),
						text_sha256: sha256(topic.description)
					}])
				})

				it("must respond with 422 if setting a short deadline", function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative({
						user_id: this.user.id
					}))

					yield createTopic(newTopic({
						id: initiative.uuid,
						creatorId: this.user.uuid,
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
						user_id: this.user.id,
						phase: "sign",
						discussion_end_email_sent_at: new Date,
						signing_end_email_sent_at: new Date
					}))

					var topic = yield createTopic(newTopic({
						id: initiative.uuid,
						creatorId: this.user.uuid,
						sourcePartnerId: this.partner.id,
						status: "voting",
						description: initiative.text
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
					var initiative = yield initiativesDb.create(new ValidInitiative({
						user_id: this.user.id,
						destination: "parliament"
					}))

					var topic = yield createTopic(newTopic({
						id: initiative.uuid,
						title: "Better life.",
						creatorId: this.user.uuid,
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
				it("must respond with 403 given initiative destined to local",
					function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative({
						user_id: this.user.id,
						phase: "sign",
						destination: "muhu-vald"
					}))

					var topic = yield createTopic(newTopic({
						id: initiative.uuid,
						creatorId: this.user.uuid,
						sourcePartnerId: this.partner.id,
						status: "voting"
					}))

					yield createVote(topic, newVote())

					var threshold = LOCAL_GOVERNMENTS["muhu-vald"].population * 0.01
					yield signaturesDb.create(_.times(Math.round(threshold), () => (
						new ValidSignature({initiative_uuid: initiative.uuid})
					)))

					var res = yield this.request("/initiatives/" + initiative.uuid, {
						method: "PUT",
						form: {_csrf_token: this.csrfToken, status: "followUp"}
					})

					res.statusCode.must.equal(403)

					res.statusMessage.must.equal(
						"Cannot Send Local Initiative to Parliament"
					)
				})

				it("must render update page", function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative({
						user_id: this.user.id,
						phase: "sign"
					}))

					var topic = yield createTopic(newTopic({
						id: initiative.uuid,
						creatorId: this.user.uuid,
						sourcePartnerId: this.partner.id,
						status: "voting"
					}))

					var vote = yield createVote(topic, newVote())
					yield createCitizenSignatures(vote, Config.votesRequired / 2)

					yield signaturesDb.create(_.times(Config.votesRequired / 2, () => (
						new ValidSignature({initiative_uuid: initiative.uuid})
					)))

					var res = yield this.request("/initiatives/" + initiative.uuid, {
						method: "PUT",
						form: {_csrf_token: this.csrfToken, status: "followUp"}
					})

					res.statusCode.must.equal(200)
					res.body.must.include(t("SEND_TO_PARLIAMENT_HEADER"))
					res.body.must.include(t("SEND_TO_PARLIAMENT_TEXT"))
				})

				it("must render update page if has paper signatures", function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative({
						user_id: this.user.id,
						phase: "sign",
						has_paper_signatures: true
					}))

					var topic = yield createTopic(newTopic({
						id: initiative.uuid,
						creatorId: this.user.uuid,
						sourcePartnerId: this.partner.id,
						status: "voting"
					}))

					yield createVote(topic, newVote())

					yield signaturesDb.create(_.times(Config.votesRequired, () => (
						new ValidSignature({initiative_uuid: initiative.uuid})
					)))

					var res = yield this.request("/initiatives/" + initiative.uuid, {
						method: "PUT",
						form: {_csrf_token: this.csrfToken, status: "followUp"}
					})

					res.statusCode.must.equal(200)
				})

				it("must respond with 403 if initiative not successful", function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative({
						user_id: this.user.id,
						phase: "sign"
					}))

					var topic = yield createTopic(newTopic({
						id: initiative.uuid,
						creatorId: this.user.uuid,
						sourcePartnerId: this.partner.id,
						status: "voting"
					}))

					yield createVote(topic, newVote())

					yield signaturesDb.create(_.times(Config.votesRequired - 1, () => (
						new ValidSignature({initiative_uuid: initiative.uuid})
					)))

					var res = yield this.request("/initiatives/" + initiative.uuid, {
						method: "PUT",
						form: {_csrf_token: this.csrfToken, status: "followUp"}
					})

					res.statusCode.must.equal(403)
					res.statusMessage.must.match(/parliament/i)
				})

				it("must respond with 403 if only has paper signatures", function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative({
						user_id: this.user.id,
						phase: "sign",
						has_paper_signatures: true
					}))

					var topic = yield createTopic(newTopic({
						id: initiative.uuid,
						creatorId: this.user.uuid,
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
						user_id: this.user.id,
						phase: "sign"
					}))

					var topic = yield createTopic(newTopic({
						id: initiative.uuid,
						creatorId: this.user.uuid,
						sourcePartnerId: this.partner.id,
						status: "voting"
					}))

					var vote = yield createVote(topic, newVote())

					yield createCitizenSignatures(vote, Config.votesRequired / 2)

					yield signaturesDb.create(_.times(Config.votesRequired / 2, () => (
						new ValidSignature({initiative_uuid: initiative.uuid})
					)))

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

					var cookies = parseCookies(res.headers["set-cookie"])
					res = yield this.request(res.headers.location, {
						headers: {Cookie: Http.serializeCookies(cookies)}
					})

					res.statusCode.must.equal(200)
					res.body.must.include(t("SENT_TO_PARLIAMENT_CONTENT"))

					var updatedInitiative = yield initiativesDb.read(initiative)

					updatedInitiative.must.eql({
						__proto__: initiative,
						phase: "parliament",
						sent_to_parliament_at: new Date,
						parliament_token: updatedInitiative.parliament_token
					})

					updatedInitiative.parliament_token.must.exist()
				})

				it("must email parliament", function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative({
						user_id: this.user.id,
						phase: "sign"
					}))

					var topic = yield createTopic(newTopic({
						id: initiative.uuid,
						creatorId: this.user.uuid,
						sourcePartnerId: this.partner.id,
						status: "voting"
					}))

					var vote = yield createVote(topic, newVote())
					yield createCitizenSignatures(vote, Config.votesRequired / 2)

					yield signaturesDb.create(_.times(Config.votesRequired / 2, () => (
						new ValidSignature({initiative_uuid: initiative.uuid})
					)))

					this.router.put(`/api/users/self/topics/${topic.id}`, endResponse)

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
					res.headers.location.must.equal(`/initiatives/${initiative.uuid}`)

					initiative = yield initiativesDb.read(initiative)

					this.emails.length.must.equal(1)
					var email = this.emails[0]
					email.envelope.to.must.eql([Config.parliamentEmail])

					email.headers.subject.must.equal(t(
						"EMAIL_INITIATIVE_TO_PARLIAMENT_TITLE",
						{initiativeTitle: topic.title}
					))

					var initiativeUrl = `${Config.url}/initiatives/${initiative.uuid}`
					var signaturesUrl = initiativeUrl + "/signatures.asice"
					signaturesUrl += "?parliament-token="
					signaturesUrl += initiative.parliament_token.toString("hex")

					email.body.must.equal(t("EMAIL_INITIATIVE_TO_PARLIAMENT_BODY", {
						initiativeUuid: initiative.uuid,
						initiativeTitle: topic.title,
						initiativeUrl: initiativeUrl,
						signatureCount: Config.votesRequired / 2,
						signaturesUrl: signaturesUrl,
						authorName: "John",
						authorEmail: "john@example.com",
						authorPhone: "42",
						siteUrl: Config.url,
						facebookUrl: Config.facebookUrl,
						twitterUrl: Config.twitterUrl
					}))
				})

				it("must not email parliament if no undersigned signatures",
					function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative({
						user_id: this.user.id,
						phase: "sign"
					}))

					var topic = yield createTopic(newTopic({
						id: initiative.uuid,
						creatorId: this.user.uuid,
						sourcePartnerId: this.partner.id,
						status: "voting"
					}))

					var vote = yield createVote(topic, newVote())
					yield createCitizenSignatures(vote, Config.votesRequired)

					this.router.put(`/api/users/self/topics/${topic.id}`, endResponse)

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
					res.headers.location.must.equal(`/initiatives/${initiative.uuid}`)
					this.emails.length.must.equal(0)
				})

				it("must email subscribers", function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative({
						user_id: this.user.id,
						phase: "sign"
					}))

					var topic = yield createTopic(newTopic({
						id: initiative.uuid,
						title: "Better life for everyone.",
						creatorId: this.user.uuid,
						sourcePartnerId: this.partner.id,
						status: "voting"
					}))

					var vote = yield createVote(topic, newVote())
					yield createCitizenSignatures(vote, Config.votesRequired + 3)

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
							signatureCount: Config.votesRequired + 3
						}),

						sent_at: new Date,
						sent_to: emails
					}])

					this.emails.length.must.equal(1)
					var email = this.emails[0]
					email.envelope.to.must.eql(emails)

					email.headers.subject.must.equal(t(
						"SENT_TO_PARLIAMENT_MESSAGE_TITLE",
						{initiativeTitle: topic.title}
					))

					var vars = JSON.parse(email.headers["x-mailgun-recipient-variables"])

					vars.must.eql({
						[subscriptions[2].email]: {
							unsubscribeUrl: `/initiatives/${initiative.uuid}/subscriptions/${subscriptions[2].update_token}`
						},

						[subscriptions[3].email]: {
							unsubscribeUrl: `/subscriptions/${subscriptions[3].update_token}`
						}
					})

					email.body.must.equal(t("SENT_TO_PARLIAMENT_MESSAGE_BODY", {
						initiativeTitle: topic.title,
						initiativeUrl: `${Config.url}/initiatives/${initiative.uuid}`,
						signatureCount: Config.votesRequired + 3,
						authorName: "John",
						unsubscribeUrl: `${Config.url}%recipient.unsubscribeUrl%`,
						siteUrl: Config.url,
						facebookUrl: Config.facebookUrl,
						twitterUrl: Config.twitterUrl
					}))
				})
			})

			describe("given local info", function() {
				it("must update attributes", function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative({
						user_id: this.user.id
					}))

					yield createTopic(newTopic({
						id: initiative.uuid,
						creatorId: this.user.uuid,
						sourcePartnerId: this.partner.id
					}))

					var res = yield this.request(`/initiatives/${initiative.uuid}`, {
						method: "PUT",
						form: {
							_csrf_token: this.csrfToken,
							author_name: "John Smith",
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
						author_name: "John Smith",
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
					var initiative = yield initiativesDb.create(new ValidInitiative({
						user_id: this.user.id
					}))

					yield createTopic(newTopic({
						id: initiative.uuid,
						creatorId: this.user.uuid,
						sourcePartnerId: this.partner.id
					}))

					var other = yield initiativesDb.create(new ValidInitiative({
						user_id: this.user.id
					}))

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
					var author = yield createUser()

					var initiative = yield initiativesDb.create(new ValidInitiative({
						user_id: author.id
					}))

					yield createTopic(newTopic({
						id: initiative.uuid,
						creatorId: author.uuid,
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
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: this.user.id
				}))

				var topic = yield createTopic(newTopic({
					id: initiative.uuid,
					creatorId: this.user.uuid,
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

				var cookies = parseCookies(res.headers["set-cookie"])
				res = yield this.request(res.headers.location, {
					headers: {Cookie: Http.serializeCookies(cookies)}
				})

				res.statusCode.must.equal(200)
				res.body.must.include(t("INITIATIVE_DELETED"))
			})

			it("must delete initiative in edit phase", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: this.user.id
				}))

				var topic = yield createTopic(newTopic({
					id: initiative.uuid,
					creatorId: this.user.uuid,
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

				var cookies = parseCookies(res.headers["set-cookie"])
				res = yield this.request(res.headers.location, {
					headers: {Cookie: Http.serializeCookies(cookies)}
				})

				res.statusCode.must.equal(200)
				res.body.must.include(t("INITIATIVE_DELETED"))
			})

			it("must respond with 405 given initiative in sign phase", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: this.user.id,
					phase: "sign"
				}))

				var topic = yield createTopic(newTopic({
					id: initiative.uuid,
					creatorId: this.user.uuid,
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
				var author = yield createUser()

				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: author.id
				}))

				yield createTopic(newTopic({
					id: initiative.uuid,
					creatorId: author.uuid,
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
			var initiative = yield initiativesDb.create(new ValidInitiative({
				user_id: this.user.id
			}))

			var topic = yield createTopic(newTopic({
				id: initiative.uuid,
				creatorId: this.user.uuid,
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
			var initiative = yield initiativesDb.create(new ValidInitiative({
				user_id: this.user.id
			}))

			var topic = yield createTopic(newTopic({
				id: initiative.uuid,
				creatorId: this.user.uuid,
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
})

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
