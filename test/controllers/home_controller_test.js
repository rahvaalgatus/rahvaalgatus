var _ = require("root/lib/underscore")
var Url = require("url")
var Config = require("root").config
var Crypto = require("crypto")
var DateFns = require("date-fns")
var ValidInitiative = require("root/test/valid_initiative")
var ValidSignature = require("root/test/valid_signature")
var ValidComment = require("root/test/valid_comment")
var ValidEvent = require("root/test/valid_initiative_event")
var ValidUser = require("root/test/valid_user")
var ValidCoauthor = require("root/test/valid_initiative_coauthor")
var ValidCitizenosSignature = require("root/test/valid_citizenos_signature")
var usersDb = require("root/db/users_db")
var coauthorsDb = require("root/db/initiative_coauthors_db")
var initiativesDb = require("root/db/initiatives_db")
var commentsDb = require("root/db/comments_db")
var eventsDb = require("root/db/initiative_events_db")
var signaturesDb = require("root/db/initiative_signatures_db")
var citizenosSignaturesDb =
	require("root/db/initiative_citizenos_signatures_db")
var {getRequiredSignatureCount} = require("root/lib/initiative")
var parseHtml = require("root/test/html").parse
var t = require("root/lib/i18n").t.bind(null, Config.language)
var demand = require("must")
var flatten = Function.apply.bind(Array.prototype.concat, Array.prototype)
var SITE_HOSTNAME = Url.parse(Config.url).hostname
var PARLIAMENT_SITE_HOSTNAME = Url.parse(Config.parliamentSiteUrl).hostname
var LOCAL_SITE_HOSTNAME = Url.parse(Config.localSiteUrl).hostname
var STATISTICS_TYPE = "application/vnd.rahvaalgatus.statistics+json; v=1"
var LOCAL_GOVERNMENTS = require("root/lib/local_governments")
var {PHASES} = require("root/lib/initiative")
var LOCAL_PHASES = _.without(PHASES, "parliament")
var TWITTER_NAME = Config.twitterUrl.replace(/^.*\//, "")
var CUTOFF = 14 // days
var COAUTHOR_STATUSES =
	require("root/controllers/initiatives/coauthors_controller").STATUSES

var EMPTY_STATISTICS = {
	initiativeCountsByPhase: {
		edit: 0,
		sign: 0,
		parliament: 0,
		government: 0,
		done: 0
	},

	activeInitiativeCountsByPhase: {
		edit: 0,
		sign: 0
	},

	signatureCount: 0
}

describe("HomeController", function() {
	require("root/test/web")()
	require("root/test/mitm")()
	require("root/test/db")()
	require("root/test/time")()
	beforeEach(require("root/test/mitm").router)

	beforeEach(function() {
		this.author = usersDb.create(new ValidUser)
	})

	describe("GET /", function() {
		it("must show initiatives", function*() {
			var initiative = initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				phase: "edit",
				published_at: new Date,
				discussion_ends_at: DateFns.addSeconds(new Date, 1)
			}))

			var res = yield this.request("/")
			res.statusCode.must.equal(200)

			var dom = parseHtml(res.body)
			var el = dom.getElementById("initiatives")
			el = el.querySelector(`.initiative[data-uuid="${initiative.uuid}"]`)
			el.textContent.must.include(initiative.title)
			el.textContent.must.include(this.author.name)
		})

		it(`must not show coauthor name from another initiative`, function*() {
			var initiative = initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				phase: "edit",
				published_at: new Date,
				discussion_ends_at: DateFns.addSeconds(new Date, 1)
			}))

			var other = initiativesDb.create(new ValidInitiative({
				user_id: this.author.id
			}))

			var coauthor = usersDb.create(new ValidUser)

			coauthorsDb.create(new ValidCoauthor({
				initiative: other,
				user: coauthor,
				status: "accepted"
			}))

			var res = yield this.request("/")
			res.statusCode.must.equal(200)

			var dom = parseHtml(res.body)
			var el = dom.getElementById("initiatives")
			el = el.querySelector(`.initiative[data-uuid="${initiative.uuid}"]`)
			el.textContent.must.include(this.author.name)
			el.textContent.must.not.include(coauthor.name)
		})

		it("must not show coauthor name", function*() {
			var initiative = initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				phase: "edit",
				published_at: new Date,
				discussion_ends_at: DateFns.addSeconds(new Date, 1)
			}))

			var coauthor = usersDb.create(new ValidUser)

			coauthorsDb.create(new ValidCoauthor({
				initiative: initiative,
				user: coauthor,
				status: "accepted"
			}))

			var res = yield this.request("/")
			res.statusCode.must.equal(200)

			var dom = parseHtml(res.body)
			var el = dom.getElementById("initiatives")
			el = el.querySelector(`.initiative[data-uuid="${initiative.uuid}"]`)
			el.textContent.must.include(this.author.name)
			el.textContent.must.not.include(coauthor.name)
		})

		_.without(COAUTHOR_STATUSES, "accepted").forEach(function(status) {
			it(`must not show ${status} coauthor name`, function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "edit",
					published_at: new Date,
					discussion_ends_at: DateFns.addSeconds(new Date, 1)
				}))

				var coauthor = usersDb.create(new ValidUser)

				coauthorsDb.create(new ValidCoauthor({
					initiative: initiative,
					user: coauthor,
					status: status
				}))

				var res = yield this.request("/")
				res.statusCode.must.equal(200)

				var dom = parseHtml(res.body)
				var el = dom.getElementById("initiatives")
				el = el.querySelector(`.initiative[data-uuid="${initiative.uuid}"]`)
				el.textContent.must.include(this.author.name)
				el.textContent.must.not.include(coauthor.name)
			})
		})

		describe("given initiatives in edit phase", function() {
			it("must not show unpublished initiatives", function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					discussion_ends_at: DateFns.addSeconds(new Date, 1)
				}))

				var res = yield this.request("/")
				res.statusCode.must.equal(200)
				res.body.must.not.include(initiative.uuid)
				demand(parseHtml(res.body).querySelector(".initiative")).be.null()
			})

			it("must show", function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "edit",
					published_at: new Date,
					discussion_ends_at: DateFns.addSeconds(new Date, 1)
				}))

				var res = yield this.request("/")
				res.statusCode.must.equal(200)

				var dom = parseHtml(res.body)

				dom.getElementById("initiatives-in-edit").querySelector(
					`.initiative[data-uuid="${initiative.uuid}"]`
				).must.exist()
			})

			it("must show if deadline less than 2w ago", function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "edit",
					published_at: new Date,
					discussion_ends_at: DateFns.addDays(DateFns.startOfDay(new Date), -13)
				}))

				var res = yield this.request("/")
				res.statusCode.must.equal(200)

				var dom = parseHtml(res.body)

				dom.getElementById("initiatives-in-edit").querySelector(
					`.initiative[data-uuid="${initiative.uuid}"]`
				).must.exist()
			})

			it("must not show if deadline 2w ago", function*() {
				initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "edit",
					published_at: new Date,
					discussion_ends_at:
						DateFns.addDays(DateFns.startOfDay(new Date), -CUTOFF)
				}))

				var res = yield this.request("/")
				res.statusCode.must.equal(200)
				demand(parseHtml(res.body).querySelector(".initiative")).be.null()
			})

			it("must not show archived initiatives", function*() {
				initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "edit",
					published_at: new Date,
					discussion_ends_at: DateFns.addSeconds(new Date, 1),
					archived_at: new Date
				}))

				var res = yield this.request("/")
				res.statusCode.must.equal(200)
				demand(parseHtml(res.body).querySelector(".initiative")).be.null()
			})
		})

		describe("given initiatives in sign phase", function() {
			it("must show if deadline in 3 days", function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "sign",
					signing_ends_at: DateFns.addDays(DateFns.startOfDay(new Date), 4)
				}))

				signaturesDb.create(_.times(5, () => new ValidSignature({
					initiative_uuid: initiative.uuid
				})))

				var res = yield this.request("/")
				res.statusCode.must.equal(200)

				var dom = parseHtml(res.body)

				var el = dom.getElementById("initiatives-in-sign").querySelector(
					`.initiative[data-uuid="${initiative.uuid}"]`
				)

				el.textContent.must.include(t("N_SIGNATURES", {votes: 5}))

				el.querySelector("time").textContent.must.equal(
					t("RELATIVE_DEADLINE_N_MORE", {days: 3})
				)
			})

			it("must show if deadline in 1 days", function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "sign",
					signing_ends_at: DateFns.addDays(DateFns.startOfDay(new Date), 2)
				}))

				signaturesDb.create(_.times(5, () => new ValidSignature({
					initiative_uuid: initiative.uuid
				})))

				var res = yield this.request("/")
				res.statusCode.must.equal(200)

				var dom = parseHtml(res.body)

				var el = dom.getElementById("initiatives-in-sign").querySelector(
					`.initiative[data-uuid="${initiative.uuid}"]`
				)

				el.textContent.must.include(t("N_SIGNATURES", {votes: 5}))

				el.querySelector("time").textContent.must.equal(
					t("RELATIVE_DEADLINE_1_MORE")
				)
			})

			it("must show if deadline today", function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "sign",
					signing_ends_at: DateFns.addDays(DateFns.startOfDay(new Date), 1)
				}))

				signaturesDb.create(_.times(5, () => new ValidSignature({
					initiative_uuid: initiative.uuid
				})))

				var res = yield this.request("/")
				res.statusCode.must.equal(200)

				var dom = parseHtml(res.body)

				var el = dom.getElementById("initiatives-in-sign").querySelector(
					`.initiative[data-uuid="${initiative.uuid}"]`
				)

				el.textContent.must.include(t("N_SIGNATURES", {votes: 5}))

				el.querySelector("time").textContent.must.equal(
					t("RELATIVE_DEADLINE_0_MORE")
				)
			})

			it("must show if deadline yesterday and succeeded", function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "sign",
					signing_ends_at: DateFns.startOfDay(new Date)
				}))

				signaturesDb.create(_.times(Config.votesRequired, () => (
					new ValidSignature({initiative_uuid: initiative.uuid})
				)))

				var res = yield this.request("/")
				res.statusCode.must.equal(200)

				var dom = parseHtml(res.body)

				var el = dom.getElementById("initiatives-in-sign-unsent").querySelector(
					`.initiative[data-uuid="${initiative.uuid}"]`
				)

				el.textContent.must.include(t("N_SIGNATURES", {
					votes: Config.votesRequired
				}))

				demand(el.querySelector("time")).be.null()
			})

			it("must show if for parliament and succeeded 2w ago", function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "sign",
					destination: "parliament",
					signing_ends_at: DateFns.addDays(DateFns.startOfDay(new Date), -CUTOFF)
				}))

				signaturesDb.create(_.times(Config.votesRequired, () => (
					new ValidSignature({initiative_uuid: initiative.uuid})
				)))

				var res = yield this.request("/")
				res.statusCode.must.equal(200)

				var dom = parseHtml(res.body)

				var el = dom.getElementById("initiatives-in-sign-unsent").querySelector(
					`.initiative[data-uuid="${initiative.uuid}"]`
				)

				el.textContent.must.include(t("N_SIGNATURES", {
					votes: Config.votesRequired
				}))

				demand(el.querySelector("time")).be.null()
			})

			it("must show if for local and succeeded 2w ago", function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "sign",
					destination: "kihnu-vald",
					signing_ends_at: DateFns.addDays(DateFns.startOfDay(new Date), -CUTOFF)
				}))

				var threshold = Math.round(
					LOCAL_GOVERNMENTS["kihnu-vald"].population * 0.01
				)

				signaturesDb.create(_.times(threshold, () => (
					new ValidSignature({initiative_uuid: initiative.uuid})
				)))

				var res = yield this.request("/")
				res.statusCode.must.equal(200)

				var dom = parseHtml(res.body)

				var el = dom.getElementById("initiatives-in-sign-unsent").querySelector(
					`.initiative[data-uuid="${initiative.uuid}"]`
				)

				el.textContent.must.include(t("N_SIGNATURES", {votes: threshold}))
				demand(el.querySelector("time")).be.null()
			})

			it("must show if failed in less than 2w", function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "sign",
					signing_ends_at: DateFns.addDays(DateFns.startOfDay(new Date), -13)
				}))

				var res = yield this.request("/")
				res.statusCode.must.equal(200)

				var dom = parseHtml(res.body)

				var el = dom.getElementById("initiatives-in-sign").querySelector(
					`.initiative[data-uuid="${initiative.uuid}"]`
				)

				el.must.exist()
				demand(el.querySelector("time")).be.null()
			})

			it("must not show if for parliament and failed 2w ago", function*() {
				initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "sign",
					destination: "parliament",
					signing_ends_at: DateFns.addDays(DateFns.startOfDay(new Date), -CUTOFF)
				}))

				var res = yield this.request("/")
				res.statusCode.must.equal(200)
				demand(parseHtml(res.body).querySelector(".initiative")).be.null()
			})

			it("must not show if for local and failed 2w ago", function*() {
				initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					destination: "kihnu-vald",
					phase: "sign",
					signing_ends_at: DateFns.addDays(DateFns.startOfDay(new Date), -CUTOFF)
				}))

				var res = yield this.request("/")
				res.statusCode.must.equal(200)
				demand(parseHtml(res.body).querySelector(".initiative")).be.null()
			})
		})

		describe("given initiatives in parliament phase", function() {
			it("must show", function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "parliament"
				}))

				var res = yield this.request("/")
				res.statusCode.must.equal(200)

				var dom = parseHtml(res.body)

				dom.getElementById("initiatives-in-parliament").querySelector(
					`.initiative[data-uuid="${initiative.uuid}"]`
				).must.exist()
			})

			it("must show external initiatives", function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					phase: "parliament",
					external: true
				}))

				var res = yield this.request("/")
				res.statusCode.must.equal(200)

				var dom = parseHtml(res.body)

				dom.getElementById("initiatives-in-parliament").querySelector(
					`.initiative[data-uuid="${initiative.uuid}"]`
				).must.exist()
			})
		})

		describe("given initiatives in government", function() {
			it("must show", function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "government"
				}))

				var res = yield this.request("/")
				res.statusCode.must.equal(200)

				var dom = parseHtml(res.body)

				dom.getElementById("initiatives-in-government").querySelector(
					`.initiative[data-uuid="${initiative.uuid}"]`
				).must.exist()
			})

			it("must show external initiatives", function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					phase: "government",
					external: true
				}))

				var res = yield this.request("/")
				res.statusCode.must.equal(200)

				var dom = parseHtml(res.body)

				dom.getElementById("initiatives-in-government").querySelector(
					`.initiative[data-uuid="${initiative.uuid}"]`
				).must.exist()
			})
		})

		describe("given initiatives in done phase", function() {
			it("must show", function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "done"
				}))

				var res = yield this.request("/")
				res.statusCode.must.equal(200)

				var dom = parseHtml(res.body)

				dom.getElementById("initiatives-in-done").querySelector(
					`.initiative[data-uuid="${initiative.uuid}"]`
				).must.exist()
			})

			it("must show external initiatives", function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					phase: "done",
					external: true
				}))

				var res = yield this.request("/")
				res.statusCode.must.equal(200)

				var dom = parseHtml(res.body)

				dom.getElementById("initiatives-in-done").querySelector(
					`.initiative[data-uuid="${initiative.uuid}"]`
				).must.exist()
			})

			it("must not show archived external initiatives", function*() {
				initiativesDb.create(new ValidInitiative({
					phase: "done",
					external: true,
					archived_at: new Date
				}))

				var res = yield this.request("/")
				res.statusCode.must.equal(200)
				demand(parseHtml(res.body).querySelector(".initiative")).be.null()
			})
		})

		it("must include social media tags", function*() {
			var res = yield this.request("/")
			res.statusCode.must.equal(200)

			var dom = parseHtml(res.body)
			var metas = dom.head.querySelectorAll("meta")
			var metasByName = _.indexBy(metas, (el) => el.getAttribute("name"))
			var metasByProp = _.indexBy(metas, (el) => el.getAttribute("property"))

			metasByName["twitter:site"].content.must.equal("@" + TWITTER_NAME)
			metasByName["twitter:card"].content.must.equal("summary")

			metasByProp["og:title"].content.must.equal("Rahvaalgatus")
			var imageUrl = `${Config.url}/assets/rahvaalgatus-description.png`
			metasByProp["og:image"].content.must.equal(imageUrl)
		})

		function mustShowInitiativesInPhases(host, dest) {
			describe("as a filtered site", function() {
				it("must show initiatives in edit phase with no destination",
					function*() {
					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: this.author.id,
						phase: "edit",
						published_at: new Date,
						destination: null,
						discussion_ends_at: DateFns.addSeconds(new Date, 1),
					}))

					var res = yield this.request("/", {headers: {Host: host}})
					res.statusCode.must.equal(200)

					var dom = parseHtml(res.body)

					dom.getElementById("initiatives-in-edit").querySelector(
						`.initiative[data-uuid="${initiative.uuid}"]`
					).must.exist()
				})

				;["edit", "sign"].forEach(function(phase) {
					it(`must show initiatives in ${phase} phase destined for ${dest}`,
						function*() {
						var initiative = initiativesDb.create(new ValidInitiative({
							user_id: this.author.id,
							phase: phase,
							destination: dest,
							published_at: new Date,
							discussion_ends_at: DateFns.addSeconds(new Date, 1),

							signing_ends_at: phase == "sign"
								? DateFns.addDays(DateFns.startOfDay(new Date), 1)
								: null
						}))

						var res = yield this.request("/", {headers: {Host: host}})
						res.statusCode.must.equal(200)

						var dom = parseHtml(res.body)

						dom.getElementById(`initiatives-in-${phase}`).querySelector(
							`.initiative[data-uuid="${initiative.uuid}"]`
						).must.exist()
					})

					it(`must not show initiatives in ${phase} not destined for ${dest}`,
						function*() {
						initiativesDb.create(new ValidInitiative({
							user_id: this.author.id,
							phase: phase,
							published_at: new Date,
							destination: dest == "parliament" ? "muhu-vald" : "parliament",

							signing_ends_at: phase == "sign"
								? DateFns.addSeconds(new Date, 1)
								: null
						}))

						var res = yield this.request("/", {headers: {Host: host}})
						res.statusCode.must.equal(200)
						demand(parseHtml(res.body).querySelector(".initiative")).be.null()
					})
				})

				it(`must show initiatives in sign phase with deadline past destined for ${dest}`,
					function*() {
					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: this.author.id,
						phase: "sign",
						destination: dest,
						signing_ends_at: DateFns.startOfDay(new Date)
					}))

					var threshold = getRequiredSignatureCount(initiative)

					signaturesDb.create(_.times(threshold, () => (
						new ValidSignature({initiative_uuid: initiative.uuid})
					)))

					var res = yield this.request("/", {headers: {Host: host}})
					res.statusCode.must.equal(200)

					var dom = parseHtml(res.body)

					dom.getElementById(`initiatives-in-sign-unsent`).querySelector(
						`.initiative[data-uuid="${initiative.uuid}"]`
					).must.exist()
				})
			})
		}

		describe(`on ${SITE_HOSTNAME}`, function() {
			it("must show initiatives in edit phase with no destination",
				function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "edit",
					published_at: new Date,
					destination: null,
					discussion_ends_at: DateFns.addSeconds(new Date, 1),
				}))

				var res = yield this.request("/")
				res.statusCode.must.equal(200)

				var dom = parseHtml(res.body)

				dom.getElementById("initiatives-in-edit").querySelector(
					`.initiative[data-uuid="${initiative.uuid}"]`
				).must.exist()
			})

			;["parliament", "muhu-vald"].forEach(function(dest) {
				;["edit", "sign"].forEach(function(phase) {
					it(`must show initiatives in ${phase} phase destined for ${dest}`,
						function*() {
						var initiative = initiativesDb.create(new ValidInitiative({
							user_id: this.author.id,
							phase: phase,
							destination: dest,
							published_at: new Date,
							discussion_ends_at: DateFns.addSeconds(new Date, 1),

							signing_ends_at: phase == "sign"
								? DateFns.addSeconds(new Date, 1)
								: null
						}))

						var res = yield this.request("/")
						res.statusCode.must.equal(200)

						var dom = parseHtml(res.body)

						dom.getElementById(`initiatives-in-${phase}`).querySelector(
							`.initiative[data-uuid="${initiative.uuid}"]`
						).must.exist()
					})
				})
			})

			describe("statistics", function() {
				describe("discussions", function() {
					it("must count initiatives in edit phase without destination",
						function*() {
						initiativesDb.create(new ValidInitiative({
							user_id: this.author.id,
							phase: "edit",
							published_at: new Date
						}))

						var res = yield this.request("/")
						res.statusCode.must.equal(200)

						var dom = parseHtml(res.body)
						var el = dom.querySelector("#discussions-statistic .count")
						el.textContent.must.equal("1")
					})

					it("must count initiatives", function*() {
						initiativesDb.create(PHASES.map((phase) => (
							new ValidInitiative({
								user_id: this.author.id,
								destination: "parliament",
								phase: phase,
								published_at: new Date
							})
						)))

						initiativesDb.create(LOCAL_PHASES.map((phase) => (
							new ValidInitiative({
								user_id: this.author.id,
								destination: "kihnu-vald",
								phase: phase,
								published_at: new Date
							})
						)))

						var res = yield this.request("/")
						res.statusCode.must.equal(200)

						var dom = parseHtml(res.body)
						var el = dom.querySelector("#discussions-statistic .count")
						el.textContent.must.equal(String(PHASES.length * 2 - 1))
					})

					it("must not count unpublished initiatives", function*() {
						initiativesDb.create(new ValidInitiative({
							user_id: this.author.id,
							phase: "edit"
						}))

						var res = yield this.request("/")
						res.statusCode.must.equal(200)

						var dom = parseHtml(res.body)
						var el = dom.querySelector("#discussions-statistic .count")
						el.textContent.must.equal("0")
					})
				})

				describe("initiatives", function() {
					it("must count initiatives", function*() {
						var phases = _.without(PHASES, "edit")
						var localPhases = _.without(LOCAL_PHASES, "edit")

						initiativesDb.create(phases.map((phase) => (
							new ValidInitiative({
								user_id: this.author.id,
								destination: "parliament",
								phase: phase,
								published_at: new Date
							})
						)))

						initiativesDb.create(localPhases.map((phase) => (
							new ValidInitiative({
								user_id: this.author.id,
								destination: "kihnu-vald",
								phase: phase,
								published_at: new Date
							})
						)))

						var res = yield this.request("/")
						res.statusCode.must.equal(200)

						var dom = parseHtml(res.body)
						var el = dom.querySelector("#initiatives-statistic .count")
						el.textContent.must.equal(String(phases.length * 2 - 1))
					})

					it("must not count external initiatives", function*() {
						initiativesDb.create(new ValidInitiative({
							phase: "parliament",
							external: true
						}))

						var res = yield this.request("/")
						res.statusCode.must.equal(200)

						var dom = parseHtml(res.body), el
						el = dom.querySelector("#discussions-statistic .count")
						el.textContent.must.equal("0")
						el = dom.querySelector("#initiatives-statistic .count")
						el.textContent.must.equal("0")
					})
				})

				describe("signatures", function() {
					it("must count signatures of initiatives", function*() {
						var initiativeA = initiativesDb.create(new ValidInitiative({
							user_id: this.author.id,
							phase: "sign",
							signing_ends_at: new Date,
							destination: "parliament"
						}))

						var initiativeB = initiativesDb.create(new ValidInitiative({
							user_id: this.author.id,
							phase: "sign",
							signing_ends_at: new Date,
							destination: "muhu-vald"
						}))

						citizenosSignaturesDb.create(_.times(3, () => (
							new ValidCitizenosSignature({initiative_uuid: initiativeA.uuid})
						)))

						citizenosSignaturesDb.create(_.times(5, () => (
							new ValidCitizenosSignature({initiative_uuid: initiativeB.uuid})
						)))

						var initiativeC = initiativesDb.create(new ValidInitiative({
							user_id: this.author.id,
							phase: "sign",
							signing_ends_at: new Date,
							destination: "parliament"
						}))

						var initiativeD = initiativesDb.create(new ValidInitiative({
							user_id: this.author.id,
							phase: "sign",
							signing_ends_at: new Date,
							destination: "muhu-vald"
						}))

						signaturesDb.create(_.times(7, () => new ValidSignature({
							initiative_uuid: initiativeC.uuid
						})))

						signaturesDb.create(_.times(9, () => new ValidSignature({
							initiative_uuid: initiativeD.uuid
						})))

						var res = yield this.request("/")
						res.statusCode.must.equal(200)

						var dom = parseHtml(res.body)
						var el = dom.querySelector("#signatures-statistic .count")
						el.textContent.must.equal("24")
					})
				})

				describe("parliament", function() {
					it("must show zero if no initiatives sent", function*() {
						var res = yield this.request("/")
						res.statusCode.must.equal(200)

						var dom = parseHtml(res.body)
						var count = dom.querySelector("#parliament-statistic .count")
						count.textContent.must.equal("0")

						dom.querySelector("#parliament-statistic p").innerHTML.must.equal(
							t("HOME_PAGE_STATISTICS_N_SENT_ALL_IN_LAST_30_DAYS", {
								sent: 0,
								sentToParliament: 0,
								sentToLocal: 0,
								external: 0
							})
						)
					})

					it("must count initiatives been in parliament or local government",
						function*() {
						initiativesDb.create(flatten([
							"parliament",
							"muhu-vald"
						].map((dest) => [
							dest == "parliament" ? new ValidInitiative({
								user_id: this.author.id,
								destination: dest,
								phase: "parliament"
							}) : null,

							new ValidInitiative({
								user_id: this.author.id,
								destination: dest,
								phase: "government"
							}),

							new ValidInitiative({
								user_id: this.author.id,
								destination: dest,
								phase: "done"
							}),

							dest == "parliament" ? new ValidInitiative({
								phase: "parliament",
								destination: dest,
								external: true
							}) : null,

							new ValidInitiative({
								phase: "government",
								destination: dest,
								external: true
							})
						].filter(Boolean))))

						var res = yield this.request("/")
						res.statusCode.must.equal(200)

						var dom = parseHtml(res.body)
						var el = dom.querySelector("#parliament-statistic .count")
						el.textContent.must.equal("5+3")
					})
				})
			})

			describe("recent initiatives", function() {
				it("must show initiatives with recent signatures", function*() {
					var self = this

					var initiatives = _.reverse(_.times(10, function(i) {
						var initiative = initiativesDb.create(new ValidInitiative({
							user_id: self.author.id,
							phase: "sign"
						}))

						signaturesDb.create(new ValidSignature({
							initiative_uuid: initiative.uuid,
							created_at: DateFns.addMinutes(new Date, i * 2)
						}))

						return initiative
					}))

					var res = yield this.request("/")
					res.statusCode.must.equal(200)

					var dom = parseHtml(res.body)
					var recents = dom.querySelector("#recent-initiatives ol")
					recents.childNodes.length.must.equal(6)

					recents.childNodes.forEach(function(el, i) {
						el.innerHTML.must.include(initiatives[i].uuid)
						var note = el.querySelector(".note").textContent
						note.must.equal(t("RECENTLY_SIGNED"))
					})
				})

				it("must show initiatives with recent comments", function*() {
					var self = this

					var initiatives = _.reverse(yield _.times(10, function(i) {
						var initiative = initiativesDb.create(new ValidInitiative({
							user_id: self.author.id,
							phase: "sign"
						}))

						commentsDb.create(new ValidComment({
							initiative_uuid: initiative.uuid,
							user_id: self.author.id,
							user_uuid: self.author.uuid,
							created_at: DateFns.addMinutes(new Date, i * 2)
						}))

						return initiative
					}))

					var res = yield this.request("/")
					res.statusCode.must.equal(200)

					var dom = parseHtml(res.body)
					var recents = dom.querySelector("#recent-initiatives ol")
					recents.childNodes.length.must.equal(6)

					recents.childNodes.forEach(function(el, i) {
						el.innerHTML.must.include(initiatives[i].uuid)
						var note = el.querySelector(".note").textContent
						note.must.equal(t("RECENTLY_COMMENTED"))
					})
				})

				it("must show initiatives with recent events", function*() {
					var self = this

					var initiatives = _.reverse(yield _.times(10, function(i) {
						var initiative = initiativesDb.create(new ValidInitiative({
							user_id: self.author.id,
							phase: "sign"
						}))

						eventsDb.create(new ValidEvent({
							initiative_uuid: initiative.uuid,
							created_at: DateFns.addMinutes(new Date, i * 2)
						}))

						return initiative
					}))

					var res = yield this.request("/")
					res.statusCode.must.equal(200)

					var dom = parseHtml(res.body)
					var recents = dom.querySelector("#recent-initiatives ol")
					recents.childNodes.length.must.equal(6)

					recents.childNodes.forEach(function(el, i) {
						el.innerHTML.must.include(initiatives[i].uuid)
						var note = el.querySelector(".note").textContent
						note.must.equal(t("RECENTLY_EVENTED"))
					})
				})

				it("must order based on last update", function*() {
					var initiatives = _.shuffle(
						initiativesDb.create(_.times(3, () => new ValidInitiative({
							user_id: this.author.id,
							phase: "sign"
						})))
					)

					yield _.shuffle([
						(initiative, i) => eventsDb.create(new ValidEvent({
							initiative_uuid: initiative.uuid,
							created_at: DateFns.addMinutes(new Date, -i)
						})),

						(initiative, i) => commentsDb.create(new ValidComment({
							initiative_uuid: initiative.uuid,
							user_id: this.author.id,
							user_uuid: this.author.uuid,
							created_at: DateFns.addMinutes(new Date, -i)
						})),

						(initiative, i) => signaturesDb.create(new ValidSignature({
							initiative_uuid: initiative.uuid,
							created_at: DateFns.addMinutes(new Date, -i)
						}))
					]).map((fn, i) => fn(initiatives[i], i))

					var res = yield this.request("/")
					res.statusCode.must.equal(200)

					var dom = parseHtml(res.body)
					var recents = dom.querySelector("#recent-initiatives ol")
					recents.childNodes.length.must.equal(3)

					recents.childNodes.forEach(function(el, i) {
						el.innerHTML.must.include(initiatives[i].uuid)
					})
				})
			})
		})

		describe(`on ${PARLIAMENT_SITE_HOSTNAME}`, function() {
			mustShowInitiativesInPhases(PARLIAMENT_SITE_HOSTNAME, "parliament")

			describe("statistics", function() {
				describe("discussions", function() {
					it("must count initiatives in edit phase without destination",
						function*() {
						initiativesDb.create(new ValidInitiative({
							user_id: this.author.id,
							phase: "edit",
							published_at: new Date
						}))

						var res = yield this.request("/", {
							headers: {Host: PARLIAMENT_SITE_HOSTNAME}
						})

						res.statusCode.must.equal(200)

						var dom = parseHtml(res.body)
						var el = dom.querySelector("#discussions-statistic .count")
						el.textContent.must.equal("1")
					})

					it("must count initiatives destined for parliament", function*() {
						initiativesDb.create(
							PHASES.map((phase) => new ValidInitiative({
								user_id: this.author.id,
								phase: phase,
								published_at: new Date,
								destination: "parliament"
							}))
						)

						var res = yield this.request("/", {
							headers: {Host: PARLIAMENT_SITE_HOSTNAME}
						})

						res.statusCode.must.equal(200)

						var dom = parseHtml(res.body)
						var el = dom.querySelector("#discussions-statistic .count")
						el.textContent.must.equal(String(PHASES.length))
					})

					it("must not count local initiatives", function*() {
						initiativesDb.create(
							LOCAL_PHASES.map((phase) => new ValidInitiative({
								user_id: this.author.id,
								phase: phase,
								published_at: new Date,
								destination: "muhu-vald"
							}))
						)

						var res = yield this.request("/", {
							headers: {Host: PARLIAMENT_SITE_HOSTNAME}
						})

						res.statusCode.must.equal(200)

						var dom = parseHtml(res.body)
						var el = dom.querySelector("#discussions-statistic .count")
						el.textContent.must.equal("0")
					})

					it("must not count unpublished initiatives", function*() {
						initiativesDb.create(new ValidInitiative({
							user_id: this.author.id,
							phase: "edit"
						}))

						var res = yield this.request("/", {
							headers: {Host: PARLIAMENT_SITE_HOSTNAME}
						})

						res.statusCode.must.equal(200)

						var dom = parseHtml(res.body)
						var el = dom.querySelector("#discussions-statistic .count")
						el.textContent.must.equal("0")
					})
				})

				describe("initiatives", function() {
					it("must count initiatives destined for parliament", function*() {
						var phases = _.without(PHASES, "edit")

						initiativesDb.create(
							phases.map((phase) => new ValidInitiative({
								user_id: this.author.id,
								phase: phase,
								published_at: new Date,
								destination: "parliament"
							}))
						)

						var res = yield this.request("/", {
							headers: {Host: PARLIAMENT_SITE_HOSTNAME}
						})

						res.statusCode.must.equal(200)

						var dom = parseHtml(res.body)
						var el = dom.querySelector("#initiatives-statistic .count")
						el.textContent.must.equal(String(phases.length))
					})

					it("must not count initiatives destined for local", function*() {
						var phases = _.without(LOCAL_PHASES, "edit")

						initiativesDb.create(
							phases.map((phase) => new ValidInitiative({
								user_id: this.author.id,
								phase: phase,
								published_at: new Date,
								destination: "muhu-vald"
							}))
						)

						var res = yield this.request("/", {
							headers: {Host: PARLIAMENT_SITE_HOSTNAME}
						})

						res.statusCode.must.equal(200)

						var dom = parseHtml(res.body)
						var el = dom.querySelector("#initiatives-statistic .count")
						el.textContent.must.equal("0")
					})

					it("must not count external initiatives", function*() {
						initiativesDb.create(new ValidInitiative({
							phase: "parliament",
							external: true
						}))

						var res = yield this.request("/", {
							headers: {Host: PARLIAMENT_SITE_HOSTNAME}
						})

						res.statusCode.must.equal(200)

						var dom = parseHtml(res.body), el
						el = dom.querySelector("#discussions-statistic .count")
						el.textContent.must.equal("0")
						el = dom.querySelector("#initiatives-statistic .count")
						el.textContent.must.equal("0")
					})
				})

				describe("signatures", function() {
					it("must count signatures of initiatives destined for parliament",
						function*() {
						var initiativeA = initiativesDb.create(new ValidInitiative({
							user_id: this.author.id,
							phase: "sign",
							signing_ends_at: new Date,
							destination: "parliament"
						}))

						citizenosSignaturesDb.create(_.times(5, () => (
							new ValidCitizenosSignature({initiative_uuid: initiativeA.uuid})
						)))

						var initiativeB = initiativesDb.create(new ValidInitiative({
							user_id: this.author.id,
							phase: "sign",
							signing_ends_at: new Date,
							destination: "parliament"
						}))

						signaturesDb.create(_.times(3, () => new ValidSignature({
							initiative_uuid: initiativeB.uuid
						})))

						var res = yield this.request("/", {
							headers: {Host: PARLIAMENT_SITE_HOSTNAME}
						})

						res.statusCode.must.equal(200)

						var dom = parseHtml(res.body)
						var el = dom.querySelector("#signatures-statistic .count")
						el.textContent.must.equal("8")
					})

					it("must not count signatures of initiatives destined for local",
						function*() {
						var initiativeA = initiativesDb.create(new ValidInitiative({
							user_id: this.author.id,
							phase: "sign",
							signing_ends_at: new Date,
							destination: "muhu-vald"
						}))

						citizenosSignaturesDb.create(_.times(5, () => (
							new ValidCitizenosSignature({initiative_uuid: initiativeA.uuid})
						)))

						var initiativeB = initiativesDb.create(new ValidInitiative({
							user_id: this.author.id,
							phase: "sign",
							signing_ends_at: new Date,
							destination: "muhu-vald"
						}))

						signaturesDb.create(_.times(3, () => new ValidSignature({
							initiative_uuid: initiativeB.uuid
						})))

						var res = yield this.request("/", {
							headers: {Host: PARLIAMENT_SITE_HOSTNAME}
						})

						res.statusCode.must.equal(200)

						var dom = parseHtml(res.body)
						var el = dom.querySelector("#signatures-statistic .count")
						el.textContent.must.equal("0")
					})
				})

				describe("parliament", function() {
					it("must show zero if no initiatives in parliament", function*() {
						var res = yield this.request("/", {
							headers: {Host: PARLIAMENT_SITE_HOSTNAME}
						})

						res.statusCode.must.equal(200)

						var dom = parseHtml(res.body)
						var count = dom.querySelector("#parliament-statistic .count")
						count.textContent.must.equal("0")

						dom.querySelector("#parliament-statistic p").innerHTML.must.equal(
							t("HOME_PAGE_STATISTICS_N_SENT_IN_LAST_30_DAYS", {
								sent: 0,
								external: 0
							})
						)
					})

					it("must count initiatives been in parliament", function*() {
						initiativesDb.create(new ValidInitiative({
							user_id: this.author.id,
							phase: "parliament"
						}))

						initiativesDb.create(new ValidInitiative({
							user_id: this.author.id,
							phase: "government"
						}))

						initiativesDb.create(new ValidInitiative({
							user_id: this.author.id,
							phase: "done"
						}))

						initiativesDb.create(new ValidInitiative({
							phase: "parliament",
							external: true
						}))

						var res = yield this.request("/", {
							headers: {Host: PARLIAMENT_SITE_HOSTNAME}
						})

						res.statusCode.must.equal(200)

						var dom = parseHtml(res.body)
						var el = dom.querySelector("#parliament-statistic .count")
						el.textContent.must.equal("3+1")
					})

					it("must not count initiatives been to local government",
						function*() {
						initiativesDb.create(new ValidInitiative({
							user_id: this.author.id,
							destination: "muhu-vald",
							phase: "government"
						}))

						initiativesDb.create(new ValidInitiative({
							user_id: this.author.id,
							destination: "muhu-vald",
							phase: "done"
						}))

						initiativesDb.create(new ValidInitiative({
							destination: "muhu-vald",
							phase: "government",
							external: true
						}))

						var res = yield this.request("/", {
							headers: {Host: PARLIAMENT_SITE_HOSTNAME}
						})

						res.statusCode.must.equal(200)

						var dom = parseHtml(res.body)
						var el = dom.querySelector("#parliament-statistic .count")
						el.textContent.must.equal("0")
					})
				})
			})
		})

		describe(`on ${LOCAL_SITE_HOSTNAME}`, function() {
			mustShowInitiativesInPhases(LOCAL_SITE_HOSTNAME, "muhu-vald")

			it(`must not show statistics on ${LOCAL_SITE_HOSTNAME}`, function*() {
				var res = yield this.request("/", {
					headers: {Host: LOCAL_SITE_HOSTNAME}
				})

				res.statusCode.must.equal(200)
				var dom = parseHtml(res.body)
				demand(dom.querySelector("#statistics")).be.null()
			})
		})

		describe("when logged in", function() {
			require("root/test/fixtures").user()

			it("must render subscription form without email if person lacks one",
				function*() {
				var res = yield this.request("/")
				res.statusCode.must.equal(200)

				var dom = parseHtml(res.body)
				var form = dom.querySelector("#initiatives-subscribe")
				form.querySelector("input[name=email]").value.must.equal("")
			})

			it("must render subscription form with person's confirmed email",
				function*() {
				usersDb.update(this.user, {
					email: "user@example.com",
					email_confirmed_at: new Date
				})

				var res = yield this.request("/")
				res.statusCode.must.equal(200)

				var dom = parseHtml(res.body)
				var form = dom.querySelector("#initiatives-subscribe")
				var input = form.querySelector("input[name=email]")
				input.value.must.equal("user@example.com")
			})

			it("must render subscription form with person's unconfirmed email",
				function*() {
				usersDb.update(this.user, {
					unconfirmed_email: "user@example.com",
					email_confirmation_token: Crypto.randomBytes(12)
				})

				var res = yield this.request("/")
				res.statusCode.must.equal(200)

				var dom = parseHtml(res.body)
				var form = dom.querySelector("#initiatives-subscribe")
				var input = form.querySelector("input[name=email]")
				input.value.must.equal("user@example.com")
			})
		})
	})

	describe(`GET /statistics with ${STATISTICS_TYPE}`, function() {
		it("must respond with JSON", function*() {
			var res = yield this.request("/statistics", {
				headers: {Accept: STATISTICS_TYPE}
			})

			res.statusCode.must.equal(200)
			res.headers["content-type"].must.equal(STATISTICS_TYPE)
			res.headers["access-control-allow-origin"].must.equal("*")
			res.body.must.eql(EMPTY_STATISTICS)
		})

		it("must respond with signature count", function*() {
			var initiativeA = initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				phase: "sign"
			}))

			citizenosSignaturesDb.create(_.times(5, () => (
				new ValidCitizenosSignature({initiative_uuid: initiativeA.uuid})
			)))

			var initiativeB = initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				phase: "sign"
			}))

			signaturesDb.create(_.times(3, () => new ValidSignature({
				initiative_uuid: initiativeB.uuid
			})))

			var res = yield this.request("/statistics", {
				headers: {Accept: STATISTICS_TYPE}
			})

			res.statusCode.must.equal(200)

			res.body.must.eql(_.merge({}, EMPTY_STATISTICS, {
				initiativeCountsByPhase: {sign: 2},
				signatureCount: 8
			}))
		})

		PHASES.forEach(function(phase) {
			it(`must count initiatives in ${phase}`, function*() {
				initiativesDb.create(_.times(3, () => new ValidInitiative({
					user_id: this.author.id,
					published_at: new Date,
					phase: phase
				})))

				var res = yield this.request("/statistics", {
					headers: {Accept: STATISTICS_TYPE}
				})

				res.statusCode.must.equal(200)

				res.body.must.eql(_.merge({}, EMPTY_STATISTICS, {
					initiativeCountsByPhase: {[phase]: 3}
				}))
			})
		})

		it("must count active initiatives in edit phase", function*() {
			var self = this

			_.times(5, (i) => initiativesDb.create(new ValidInitiative({
				user_id: self.author.id,
				published_at: new Date,
				discussion_ends_at: DateFns.addSeconds(new Date, 2 - i)
			})))

			var res = yield this.request("/statistics", {
				headers: {Accept: STATISTICS_TYPE}
			})

			res.statusCode.must.equal(200)

			res.body.must.eql(_.merge({}, EMPTY_STATISTICS, {
				initiativeCountsByPhase: {edit: 5},
				activeInitiativeCountsByPhase: {edit: 2}
			}))
		})

		it("must count active initiatives in sign phase", function*() {
			var self = this

			_.times(5, (i) => initiativesDb.create(new ValidInitiative({
				user_id: self.author.id,
				phase: "sign",
				signing_ends_at: DateFns.addSeconds(new Date, 2 - i)
			})))

			var res = yield this.request("/statistics", {
				headers: {Accept: STATISTICS_TYPE}
			})

			res.statusCode.must.equal(200)

			res.body.must.eql(_.merge({}, EMPTY_STATISTICS, {
				initiativeCountsByPhase: {sign: 5},
				activeInitiativeCountsByPhase: {sign: 2}
			}))
		})

		it("must not count external initiatives", function*() {
			initiativesDb.create(new ValidInitiative({
				phase: "parliament",
				external: true
			}))

			var res = yield this.request("/statistics", {
				headers: {Accept: STATISTICS_TYPE}
			})

			res.statusCode.must.equal(200)
			res.body.must.eql(EMPTY_STATISTICS)
		})

		it("must not count unpublished initiatives", function*() {
			initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				discussion_ends_at: DateFns.addSeconds(new Date, 1),
			}))

			var res = yield this.request("/statistics", {
				headers: {Accept: STATISTICS_TYPE}
			})

			res.statusCode.must.equal(200)
			res.body.must.eql(EMPTY_STATISTICS)
		})
	})

	;[
		"/about",
		"/credits",
		"/api",
		"/statistics"
	].forEach(function(path) {
		describe("GET " + path, function() {
			it("must render", function*() {
				var res = yield this.request(path)
				res.statusCode.must.equal(200)
			})

			;[PARLIAMENT_SITE_HOSTNAME, LOCAL_SITE_HOSTNAME].forEach(function(host) {
				it(`must redirect to ${SITE_HOSTNAME} from ${host}`, function*() {
					var query = "?foo=bar"
					var res = yield this.request(path + query, {headers: {Host: host}})
					res.statusCode.must.equal(301)
					res.headers.location.must.equal(Config.url + path + query)
				})
			})
		})
	})
})
