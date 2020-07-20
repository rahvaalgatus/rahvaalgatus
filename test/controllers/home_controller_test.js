var _ = require("root/lib/underscore")
var Url = require("url")
var Config = require("root/config")
var Crypto = require("crypto")
var DateFns = require("date-fns")
var ValidInitiative = require("root/test/valid_db_initiative")
var ValidSignature = require("root/test/valid_signature")
var ValidUser = require("root/test/valid_user")
var ValidCitizenosSignature = require("root/test/valid_citizenos_signature")
var usersDb = require("root/db/users_db")
var initiativesDb = require("root/db/initiatives_db")
var signaturesDb = require("root/db/initiative_signatures_db")
var citizenosSignaturesDb =
	require("root/db/initiative_citizenos_signatures_db")
var parseDom = require("root/lib/dom").parse
var t = require("root/lib/i18n").t.bind(null, Config.language)
var demand = require("must")
var flatten = Function.apply.bind(Array.prototype.concat, Array.prototype)
var SITE_HOSTNAME = Url.parse(Config.url).hostname
var PARLIAMENT_SITE_HOSTNAME = Url.parse(Config.parliamentSiteUrl).hostname
var LOCAL_SITE_HOSTNAME = Url.parse(Config.localSiteUrl).hostname
var STATISTICS_TYPE = "application/vnd.rahvaalgatus.statistics+json; v=1"
var PHASES = require("root/lib/initiative").PHASES

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

	beforeEach(function*() {
		this.author = yield usersDb.create(new ValidUser)
	})

	describe("GET /", function() {
		it("must show initiatives", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				phase: "edit",
				published_at: new Date,
				discussion_ends_at: DateFns.addSeconds(new Date, 1)
			}))

			var res = yield this.request("/")
			res.statusCode.must.equal(200)
			res.body.must.include(initiative.uuid)
			res.body.must.include(initiative.title)
			res.body.must.include(this.author.name)
		})

		it("must show initiatives in edit phase", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				phase: "edit",
				published_at: new Date,
				discussion_ends_at: DateFns.addSeconds(new Date, 1)
			}))

			var res = yield this.request("/")
			res.statusCode.must.equal(200)
			res.body.must.include(initiative.uuid)
		})

		it("must show initiatives in edit phase that have ended less than 2w ago",
			function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				phase: "edit",
				published_at: new Date,
				discussion_ends_at: DateFns.addDays(DateFns.startOfDay(new Date), -13)
			}))

			var res = yield this.request("/")
			res.statusCode.must.equal(200)
			res.body.must.include(initiative.uuid)
		})

		it("must not show initiatives in edit phase that have ended", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				phase: "edit",
				published_at: new Date,
				discussion_ends_at: DateFns.addDays(DateFns.startOfDay(new Date), -14)
			}))

			var res = yield this.request("/")
			res.statusCode.must.equal(200)
			res.body.must.not.include(initiative.uuid)
		})

		it("must not show archived initiatives in edit phase", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				phase: "edit",
				published_at: new Date,
				discussion_ends_at: DateFns.addSeconds(new Date, 1),
				archived_at: new Date
			}))

			var res = yield this.request("/")
			res.statusCode.must.equal(200)
			res.body.must.not.include(initiative.uuid)
		})

		it("must show initiatives in sign phase", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				phase: "sign",
				signing_ends_at: DateFns.addDays(new Date, 1)
			}))

			yield signaturesDb.create(_.times(5, () => new ValidSignature({
				initiative_uuid: initiative.uuid
			})))

			var res = yield this.request("/")
			res.statusCode.must.equal(200)
			res.body.must.include(initiative.uuid)
			res.body.must.include(t("N_SIGNATURES", {votes: 5}))
		})

		it("must show initiatives in sign phase that failed in less than 2w",
			function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				phase: "sign",
				signing_ends_at: DateFns.addDays(DateFns.startOfDay(new Date), -13)
			}))

			var res = yield this.request("/")
			res.statusCode.must.equal(200)
			res.body.must.include(initiative.uuid)
		})

		it("must not show initiatives in sign phase that failed", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				phase: "sign",
				signing_ends_at: DateFns.addDays(DateFns.startOfDay(new Date), -14)
			}))

			var res = yield this.request("/")
			res.statusCode.must.equal(200)
			res.body.must.not.include(initiative.uuid)
		})

		it("must show initiatives in sign phase that succeeded", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				phase: "sign",
				signing_ends_at: DateFns.addDays(DateFns.startOfDay(new Date), -14)
			}))

			yield signaturesDb.create(_.times(Config.votesRequired, () => (
				new ValidSignature({initiative_uuid: initiative.uuid})
			)))

			var res = yield this.request("/")
			res.statusCode.must.equal(200)
			res.body.must.include(initiative.uuid)
		})

		it("must show initiatives in parliament phase", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				phase: "parliament"
			}))

			var res = yield this.request("/")
			res.statusCode.must.equal(200)
			res.body.must.include(initiative.uuid)
		})

		it("must show external initiatives in parliament phase", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				phase: "parliament",
				external: true
			}))

			var res = yield this.request("/")
			res.statusCode.must.equal(200)
			res.body.must.include(initiative.uuid)
		})

		it("must show initiatives in government phase", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				phase: "government"
			}))

			var res = yield this.request("/")
			res.statusCode.must.equal(200)
			res.body.must.include(initiative.uuid)
		})

		it("must show external initiatives in government phase", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				phase: "government",
				external: true
			}))

			var res = yield this.request("/")
			res.statusCode.must.equal(200)
			res.body.must.include(initiative.uuid)
		})

		it("must show initiatives in done phase", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				phase: "done"
			}))

			var res = yield this.request("/")
			res.statusCode.must.equal(200)
			res.body.must.include(initiative.uuid)
		})

		it("must show external initiatives in done phase", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				phase: "done",
				external: true
			}))

			var res = yield this.request("/")
			res.statusCode.must.equal(200)
			res.body.must.include(initiative.uuid)
		})

		it("must not show archived external initiatives in done phase",
			function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				phase: "done",
				external: true,
				archived_at: new Date
			}))

			var res = yield this.request("/")
			res.statusCode.must.equal(200)
			res.body.must.not.include(initiative.uuid)
		})

		it("must not show unpublished initiatives", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				discussion_ends_at: DateFns.addSeconds(new Date, 1)
			}))

			var res = yield this.request("/")
			res.statusCode.must.equal(200)
			res.body.must.not.include(initiative.uuid)
		})

		it("must include social media tags", function*() {
			var res = yield this.request("/")
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

		function mustShowInitiativesInPhases(host, dest) {
			describe("as a filtered site", function() {
				it("must show initiatives in edit phase with no destination",
					function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative({
						user_id: this.author.id,
						phase: "edit",
						published_at: new Date,
						destination: null,
						discussion_ends_at: DateFns.addSeconds(new Date, 1),
					}))

					var res = yield this.request("/", {headers: {Host: host}})
					res.statusCode.must.equal(200)
					res.body.must.include(initiative.uuid)
				})

				;["edit", "sign"].forEach(function(phase) {
					it(`must show initiatives in ${phase} phase destined for ${dest}`,
						function*() {
						var initiative = yield initiativesDb.create(new ValidInitiative({
							user_id: this.author.id,
							phase: phase,
							destination: dest,
							published_at: new Date,
							discussion_ends_at: DateFns.addSeconds(new Date, 1),

							signing_ends_at: phase == "sign"
								? DateFns.addSeconds(new Date, 1)
								: null
						}))

						var res = yield this.request("/", {headers: {Host: host}})
						res.statusCode.must.equal(200)
						res.body.must.include(initiative.uuid)
					})

					it(`must not show initiatives in ${phase} not destined for ${dest}`,
						function*() {
						var initiative = yield initiativesDb.create(new ValidInitiative({
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
						res.body.must.not.include(initiative.uuid)
					})
				})
			})
		}

		describe(`on ${SITE_HOSTNAME}`, function() {
			it("must show initiatives in edit phase with no destination",
				function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "edit",
					published_at: new Date,
					destination: null,
					discussion_ends_at: DateFns.addSeconds(new Date, 1),
				}))

				var res = yield this.request("/")
				res.statusCode.must.equal(200)
				res.body.must.include(initiative.uuid)
			})

			;["parliament", "muhu-vald"].forEach(function(dest) {
				;["edit", "sign"].forEach(function(phase) {
					it(`must show initiatives in ${phase} phase destined for ${dest}`,
						function*() {
						var initiative = yield initiativesDb.create(new ValidInitiative({
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
						res.body.must.include(initiative.uuid)
					})
				})
			})

			describe("statistics", function() {
				describe("discussions", function() {
					it("must count initiatives in edit phase without destination",
						function*() {
						yield initiativesDb.create(new ValidInitiative({
							user_id: this.author.id,
							phase: "edit",
							published_at: new Date
						}))

						var res = yield this.request("/")
						res.statusCode.must.equal(200)

						var dom = parseDom(res.body)
						var el = dom.querySelector("#discussions-statistic .count")
						el.textContent.must.equal("1")
					})

					it("must count initiatives", function*() {
						yield initiativesDb.create(flatten([
							"parliament",
							"muhu-vald"
						].map((dest) => PHASES.map((phase) => new ValidInitiative({
							user_id: this.author.id,
							phase: phase,
							published_at: new Date,
							destination: dest
						})))))

						var res = yield this.request("/")
						res.statusCode.must.equal(200)

						var dom = parseDom(res.body)
						var el = dom.querySelector("#discussions-statistic .count")
						el.textContent.must.equal(String(PHASES.length * 2))
					})

					it("must not count unpublished initiatives", function*() {
						yield initiativesDb.create(new ValidInitiative({
							user_id: this.author.id,
							phase: "edit"
						}))

						var res = yield this.request("/")
						res.statusCode.must.equal(200)

						var dom = parseDom(res.body)
						var el = dom.querySelector("#discussions-statistic .count")
						el.textContent.must.equal("0")
					})
				})

				describe("initiatives", function() {
					it("must count initiatives", function*() {
						var phases = _.without(PHASES, "edit")

						yield initiativesDb.create(flatten([
							"parliament",
							"muhu-vald"
						].map((dest) => phases.map((phase) => new ValidInitiative({
								user_id: this.author.id,
								phase: phase,
								published_at: new Date,
								destination: dest
							}))
						)))

						var res = yield this.request("/")
						res.statusCode.must.equal(200)

						var dom = parseDom(res.body)
						var el = dom.querySelector("#initiatives-statistic .count")
						el.textContent.must.equal(String(phases.length * 2))
					})

					it("must not count external initiatives", function*() {
						yield initiativesDb.create(new ValidInitiative({
							phase: "parliament",
							external: true
						}))

						var res = yield this.request("/")
						res.statusCode.must.equal(200)

						var dom = parseDom(res.body), el
						el = dom.querySelector("#discussions-statistic .count")
						el.textContent.must.equal("0")
						el = dom.querySelector("#initiatives-statistic .count")
						el.textContent.must.equal("0")
					})
				})

				describe("signatures", function() {
					it("must count signatures of initiatives", function*() {
						var initiativeA = yield initiativesDb.create(new ValidInitiative({
							user_id: this.author.id,
							phase: "sign",
							signing_ends_at: new Date,
							destination: "parliament"
						}))

						var initiativeB = yield initiativesDb.create(new ValidInitiative({
							user_id: this.author.id,
							phase: "sign",
							signing_ends_at: new Date,
							destination: "muhu-vald"
						}))

						yield citizenosSignaturesDb.create(_.times(3, () => (
							new ValidCitizenosSignature({initiative_uuid: initiativeA.uuid})
						)))

						yield citizenosSignaturesDb.create(_.times(5, () => (
							new ValidCitizenosSignature({initiative_uuid: initiativeB.uuid})
						)))

						var initiativeC = yield initiativesDb.create(new ValidInitiative({
							user_id: this.author.id,
							phase: "sign",
							signing_ends_at: new Date,
							destination: "parliament"
						}))

						var initiativeD = yield initiativesDb.create(new ValidInitiative({
							user_id: this.author.id,
							phase: "sign",
							signing_ends_at: new Date,
							destination: "muhu-vald"
						}))

						yield signaturesDb.create(_.times(7, () => new ValidSignature({
							initiative_uuid: initiativeC.uuid
						})))

						yield signaturesDb.create(_.times(9, () => new ValidSignature({
							initiative_uuid: initiativeD.uuid
						})))

						var res = yield this.request("/")
						res.statusCode.must.equal(200)

						var dom = parseDom(res.body)
						var el = dom.querySelector("#signatures-statistic .count")
						el.textContent.must.equal("24")
					})
				})

				describe("parliament", function() {
					it("must show zero if no initiatives sent", function*() {
						var res = yield this.request("/")
						res.statusCode.must.equal(200)

						var dom = parseDom(res.body)
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
						yield initiativesDb.create(flatten([
							"parliament",
							"muhu-vald"
						].map((dest) => [
							new ValidInitiative({
								user_id: this.author.id,
								destination: dest,
								phase: "parliament"
							}),

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

							new ValidInitiative({
								phase: "parliament",
								destination: dest,
								external: true
							})
						])))

						var res = yield this.request("/")
						res.statusCode.must.equal(200)

						var dom = parseDom(res.body)
						var el = dom.querySelector("#parliament-statistic .count")
						el.textContent.must.equal("6+2")
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
						yield initiativesDb.create(new ValidInitiative({
							user_id: this.author.id,
							phase: "edit",
							published_at: new Date
						}))

						var res = yield this.request("/", {
							headers: {Host: PARLIAMENT_SITE_HOSTNAME}
						})

						res.statusCode.must.equal(200)

						var dom = parseDom(res.body)
						var el = dom.querySelector("#discussions-statistic .count")
						el.textContent.must.equal("1")
					})

					it("must count initiatives destined for parliament", function*() {
						yield initiativesDb.create(
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

						var dom = parseDom(res.body)
						var el = dom.querySelector("#discussions-statistic .count")
						el.textContent.must.equal(String(PHASES.length))
					})

					it("must not count local initiatives", function*() {
						yield initiativesDb.create(
							PHASES.map((phase) => new ValidInitiative({
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

						var dom = parseDom(res.body)
						var el = dom.querySelector("#discussions-statistic .count")
						el.textContent.must.equal("0")
					})

					it("must not count unpublished initiatives", function*() {
						yield initiativesDb.create(new ValidInitiative({
							user_id: this.author.id,
							phase: "edit"
						}))

						var res = yield this.request("/", {
							headers: {Host: PARLIAMENT_SITE_HOSTNAME}
						})

						res.statusCode.must.equal(200)

						var dom = parseDom(res.body)
						var el = dom.querySelector("#discussions-statistic .count")
						el.textContent.must.equal("0")
					})
				})

				describe("initiatives", function() {
					it("must count initiatives destined for parliament", function*() {
						var phases = _.without(PHASES, "edit")

						yield initiativesDb.create(
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

						var dom = parseDom(res.body)
						var el = dom.querySelector("#initiatives-statistic .count")
						el.textContent.must.equal(String(phases.length))
					})

					it("must not count initiatives destined for local", function*() {
						var phases = _.without(PHASES, "edit")

						yield initiativesDb.create(
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

						var dom = parseDom(res.body)
						var el = dom.querySelector("#initiatives-statistic .count")
						el.textContent.must.equal("0")
					})

					it("must not count external initiatives", function*() {
						yield initiativesDb.create(new ValidInitiative({
							phase: "parliament",
							external: true
						}))

						var res = yield this.request("/", {
							headers: {Host: PARLIAMENT_SITE_HOSTNAME}
						})

						res.statusCode.must.equal(200)

						var dom = parseDom(res.body), el
						el = dom.querySelector("#discussions-statistic .count")
						el.textContent.must.equal("0")
						el = dom.querySelector("#initiatives-statistic .count")
						el.textContent.must.equal("0")
					})
				})

				describe("signatures", function() {
					it("must count signatures of initiatives destined for parliament",
						function*() {
						var initiativeA = yield initiativesDb.create(new ValidInitiative({
							user_id: this.author.id,
							phase: "sign",
							signing_ends_at: new Date,
							destination: "parliament"
						}))

						yield citizenosSignaturesDb.create(_.times(5, () => (
							new ValidCitizenosSignature({initiative_uuid: initiativeA.uuid})
						)))

						var initiativeB = yield initiativesDb.create(new ValidInitiative({
							user_id: this.author.id,
							phase: "sign",
							signing_ends_at: new Date,
							destination: "parliament"
						}))

						yield signaturesDb.create(_.times(3, () => new ValidSignature({
							initiative_uuid: initiativeB.uuid
						})))

						var res = yield this.request("/", {
							headers: {Host: PARLIAMENT_SITE_HOSTNAME}
						})

						res.statusCode.must.equal(200)

						var dom = parseDom(res.body)
						var el = dom.querySelector("#signatures-statistic .count")
						el.textContent.must.equal("8")
					})

					it("must not count signatures of initiatives destined for local",
						function*() {
						var initiativeA = yield initiativesDb.create(new ValidInitiative({
							user_id: this.author.id,
							phase: "sign",
							signing_ends_at: new Date,
							destination: "muhu-vald"
						}))

						yield citizenosSignaturesDb.create(_.times(5, () => (
							new ValidCitizenosSignature({initiative_uuid: initiativeA.uuid})
						)))

						var initiativeB = yield initiativesDb.create(new ValidInitiative({
							user_id: this.author.id,
							phase: "sign",
							signing_ends_at: new Date,
							destination: "muhu-vald"
						}))

						yield signaturesDb.create(_.times(3, () => new ValidSignature({
							initiative_uuid: initiativeB.uuid
						})))

						var res = yield this.request("/", {
							headers: {Host: PARLIAMENT_SITE_HOSTNAME}
						})

						res.statusCode.must.equal(200)

						var dom = parseDom(res.body)
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

						var dom = parseDom(res.body)
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
						yield initiativesDb.create(new ValidInitiative({
							user_id: this.author.id,
							phase: "parliament"
						}))

						yield initiativesDb.create(new ValidInitiative({
							user_id: this.author.id,
							phase: "government"
						}))

						yield initiativesDb.create(new ValidInitiative({
							user_id: this.author.id,
							phase: "done"
						}))

						yield initiativesDb.create(new ValidInitiative({
							phase: "parliament",
							external: true
						}))

						var res = yield this.request("/", {
							headers: {Host: PARLIAMENT_SITE_HOSTNAME}
						})

						res.statusCode.must.equal(200)

						var dom = parseDom(res.body)
						var el = dom.querySelector("#parliament-statistic .count")
						el.textContent.must.equal("3+1")
					})

					it("must not count initiatives been to local government",
						function*() {
						yield initiativesDb.create(new ValidInitiative({
							user_id: this.author.id,
							destination: "muhu-vald",
							phase: "parliament"
						}))

						yield initiativesDb.create(new ValidInitiative({
							user_id: this.author.id,
							destination: "muhu-vald",
							phase: "government"
						}))

						yield initiativesDb.create(new ValidInitiative({
							user_id: this.author.id,
							destination: "muhu-vald",
							phase: "done"
						}))

						yield initiativesDb.create(new ValidInitiative({
							destination: "muhu-vald",
							phase: "parliament",
							external: true
						}))

						var res = yield this.request("/", {
							headers: {Host: PARLIAMENT_SITE_HOSTNAME}
						})

						res.statusCode.must.equal(200)

						var dom = parseDom(res.body)
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
				var dom = parseDom(res.body)
				demand(dom.querySelector("#statistics")).be.null()
			})
		})

		describe("when logged in", function() {
			require("root/test/fixtures").user()

			it("must render subscription form without email if person lacks one",
				function*() {
				var res = yield this.request("/")
				res.statusCode.must.equal(200)

				var dom = parseDom(res.body)
				var form = dom.querySelector("#initiatives-subscribe")
				form.querySelector("input[name=email]").value.must.equal("")
			})

			it("must render subscription form with person's confirmed email",
				function*() {
				yield usersDb.update(this.user, {
					email: "user@example.com",
					email_confirmed_at: new Date
				})

				var res = yield this.request("/")
				res.statusCode.must.equal(200)

				var dom = parseDom(res.body)
				var form = dom.querySelector("#initiatives-subscribe")
				var input = form.querySelector("input[name=email]")
				input.value.must.equal("user@example.com")
			})

			it("must render subscription form with person's unconfirmed email",
				function*() {
				yield usersDb.update(this.user, {
					unconfirmed_email: "user@example.com",
					email_confirmation_token: Crypto.randomBytes(12)
				})

				var res = yield this.request("/")
				res.statusCode.must.equal(200)

				var dom = parseDom(res.body)
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
			var initiativeA = yield initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				phase: "sign"
			}))

			yield citizenosSignaturesDb.create(_.times(5, () => (
				new ValidCitizenosSignature({initiative_uuid: initiativeA.uuid})
			)))

			var initiativeB = yield initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				phase: "sign"
			}))

			yield signaturesDb.create(_.times(3, () => new ValidSignature({
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
				yield initiativesDb.create(_.times(3, () => new ValidInitiative({
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

			yield _.times(5, (i) => initiativesDb.create(new ValidInitiative({
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

			yield _.times(5, (i) => initiativesDb.create(new ValidInitiative({
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
			yield initiativesDb.create(new ValidInitiative({
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
			yield initiativesDb.create(new ValidInitiative({
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
		describe(path, function() {
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
