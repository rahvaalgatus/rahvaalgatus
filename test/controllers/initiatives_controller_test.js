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
var ValidCitizenosSignature = require("root/test/valid_citizenos_signature")
var ValidComment = require("root/test/valid_comment")
var ValidText = require("root/test/valid_initiative_text")
var ValidFile = require("root/test/valid_event_file")
var ValidEvent = require("root/test/valid_db_initiative_event")
var Http = require("root/lib/http")
var I18n = require("root/lib/i18n")
var formatIsoDate = require("root/lib/i18n").formatDate.bind(null, "iso")
var sql = require("sqlate")
var t = require("root/lib/i18n").t.bind(null, "et")
var renderEmail = require("root/lib/i18n").email.bind(null, "et")
var tHtml = _.compose(_.escapeHtml, t)
var pseudoDateTime = require("root/lib/crypto").pseudoDateTime
var parseCookies = Http.parseCookies
var usersDb = require("root/db/users_db")
var textsDb = require("root/db/initiative_texts_db")
var filesDb = require("root/db/initiative_files_db")
var initiativesDb = require("root/db/initiatives_db")
var subscriptionsDb = require("root/db/initiative_subscriptions_db")
var imagesDb = require("root/db/initiative_images_db")
var eventsDb = require("root/db/initiative_events_db")
var messagesDb = require("root/db/initiative_messages_db")
var signaturesDb = require("root/db/initiative_signatures_db")
var citizenosSignaturesDb =
	require("root/db/initiative_citizenos_signatures_db")
var commentsDb = require("root/db/comments_db")
var encodeMime = require("nodemailer/lib/mime-funcs").encodeWord
var parseDom = require("root/lib/dom").parse
var outdent = require("root/lib/outdent")
var sha256 = require("root/lib/crypto").hash.bind(null, "sha256")
var concat = Array.prototype.concat.bind(Array.prototype)
var demand = require("must")
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

var BLOCK_BREAK = {
	"type": "string",
	"attributes": {"blockBreak": true},
	"string": "\n"
}

describe("InitiativesController", function() {
	require("root/test/web")()
	require("root/test/mitm")()
	require("root/test/db")()
	require("root/test/email")()
	require("root/test/fixtures").csrf()
	beforeEach(require("root/test/mitm").router)

	describe("GET /", function() {
		beforeEach(function*() {
			this.author = yield usersDb.create(new ValidUser)
		})

		it("must show initiatives in edit phase", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				phase: "edit",
				created_at: pseudoDateTime(),
				published_at: new Date,
				discussion_ends_at: DateFns.addSeconds(new Date, 1)
			}))

			var res = yield this.request("/initiatives")
			res.statusCode.must.equal(200)
			res.body.must.include(initiative.uuid)
			res.body.must.include(initiative.title)

			var dom = parseDom(res.body)
			dom.querySelector(".initiative time").textContent.must.equal(
				I18n.formatDate("numeric", initiative.created_at)
			)
		})

		it("must show initiatives in edit phase that have ended", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				destination: "parliament",
				published_at: new Date,
				discussion_ends_at: new Date
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
				discussion_ends_at: DateFns.addSeconds(new Date, 1),
				published_at: new Date,
				archived_at: new Date
			}))

			var res = yield this.request("/initiatives")
			res.statusCode.must.equal(200)
			res.body.must.include(initiative.uuid)
		})

		it("must show initiatives in sign phase", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				phase: "sign",
				signing_started_at: pseudoDateTime(),
				signing_ends_at: DateFns.addDays(new Date, 1)
			}))

			yield citizenosSignaturesDb.create(_.times(5, () => (
				new ValidCitizenosSignature({initiative_uuid: initiative.uuid})
			)))

			yield signaturesDb.create(_.times(3, () => new ValidSignature({
				initiative_uuid: initiative.uuid
			})))

			var res = yield this.request("/initiatives")
			res.statusCode.must.equal(200)
			res.body.must.include(initiative.uuid)
			res.body.must.include(t("N_SIGNATURES", {votes: 8}))

			var dom = parseDom(res.body)
			dom.querySelector(".initiative time").textContent.must.equal(
				I18n.formatDate("numeric", initiative.signing_started_at)
			)
		})

		it("must show initiatives in sign phase that failed", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				phase: "sign",
				signing_ends_at: new Date
			}))

			var res = yield this.request("/initiatives")
			res.statusCode.must.equal(200)
			res.body.must.include(initiative.uuid)
		})

		it("must show initiatives in sign phase that succeeded", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				phase: "sign",
				signing_ends_at: new Date
			}))

			yield signaturesDb.create(_.times(Config.votesRequired / 2, () => (
				new ValidSignature({initiative_uuid: initiative.uuid})
			)))

			yield citizenosSignaturesDb.create(_.times(
				Config.votesRequired / 2,
				() => new ValidCitizenosSignature({initiative_uuid: initiative.uuid})
			))

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
						destination: null,
						published_at: new Date
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
							destination: dest,
							published_at: new Date
						}))

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
							destination: dest == "parliament" ? "muhu-vald" : "parliament",
							published_at: new Date
						}))

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
						destination: dest,
						published_at: new Date
					}))

					var res = yield this.request("/initiatives", {
						headers: {Host: LOCAL_SITE_HOSTNAME}
					})

					res.statusCode.must.equal(200)
					res.body.must.include(initiative.uuid)
				})
			})

			mustShowInitiativesInPhases(LOCAL_SITE_HOSTNAME, "muhu-vald")
		})

		it("must not show unpublished initiatives", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				user_id: this.author.id
			}))

			var res = yield this.request("/initiatives")
			res.statusCode.must.equal(200)
			res.body.must.not.include(initiative.uuid)
		})

		it("must show initiatives by tag if given", function*() {
			var initiativeA = yield initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				published_at: new Date,
				tags: ["uuseakus"]
			}))

			var initiativeB = yield initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				published_at: new Date
			}))

			var res = yield this.request("/initiatives?category=uuseakus")
			res.statusCode.must.equal(200)
			res.body.must.include(initiativeA.uuid)
			res.body.must.not.include(initiativeB.uuid)
		})

		it("must include social media tags", function*() {
			var res = yield this.request("/initiatives")
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

					yield signaturesDb.create(new ValidSignature({
						initiative_uuid: initiative.uuid,
						created_at: DateFns.addMinutes(new Date, i * 2),
					}))

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
			this.author = yield usersDb.create(new ValidUser)
		})

		it("must not respond with unpublished initiatives", function*() {
			yield initiativesDb.create(new ValidInitiative({user_id: this.author.id}))

			var res = yield this.request("/initiatives", {
				headers: {Accept: INITIATIVE_TYPE}
			})

			res.statusCode.must.equal(200)
			res.body.must.eql([])
		})

		it("must respond with initiatives", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				phase: "edit",
				published_at: new Date
			}))

			var res = yield this.request("/initiatives", {
				headers: {Accept: INITIATIVE_TYPE}
			})

			res.statusCode.must.equal(200)
			res.headers["content-type"].must.equal(INITIATIVE_TYPE)
			res.headers["access-control-allow-origin"].must.equal("*")

			res.body.must.eql([{
				id: initiative.uuid,
				title: initiative.title,
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

			yield citizenosSignaturesDb.create(_.times(5, () => (
				new ValidCitizenosSignature({initiative_uuid: initiative.uuid})
			)))

			yield signaturesDb.create(_.times(3, () => new ValidSignature({
				initiative_uuid: initiative.uuid
			})))

			var res = yield this.request("/initiatives", {
				headers: {Accept: INITIATIVE_TYPE}
			})

			res.statusCode.must.equal(200)

			res.body.must.eql([{
				id: initiative.uuid,
				title: initiative.title,
				phase: "sign",
				signatureCount: 8
			}])
		})

		describe("given signedSince", function() {
			it("must return signature count since given date", function*() {
				var self = this

				var initiatives = yield _.times(10, function*(i) {
					var initiative = yield initiativesDb.create(new ValidInitiative({
						user_id: self.author.id,
						phase: "sign"
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
				it(`must respond with ${phase} initiatives if requested`, function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative({
						user_id: this.author.id,
						published_at: new Date,
						phase: phase
					}))

					yield initiativesDb.create(new ValidInitiative({
						user_id: this.author.id,
						published_at: new Date,
						phase: PHASES[(i + 1) % PHASES.length]
					}))

					var res = yield this.request("/initiatives?phase=" + phase, {
						headers: {Accept: INITIATIVE_TYPE}
					})

					res.statusCode.must.equal(200)

					res.body.must.eql([{
						id: initiative.uuid,
						title: initiative.title,
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
							user_id: self.author.id,
							phase: "sign"
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
							user_id: self.author.id,
							phase: "sign"
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

				var initiatives = yield initiativesDb.create(_.times(10, () =>
					new ValidInitiative({user_id: self.author.id, published_at: new Date})
				))

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
						user_id: self.author.id,
						published_at: new Date
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
				var res = yield this.request("/initiatives", {
					method: "POST",
					form: {
						_csrf_token: this.csrfToken,
						"accept-tos": true,
						title: "Hello, world!"
					}
				})

				res.statusCode.must.equal(303)

				var initiatives = yield initiativesDb.search(sql`
					SELECT * FROM initiatives
				`)

				var uuid = initiatives[0].uuid

				initiatives.must.eql([new ValidInitiative({
					uuid: uuid,
					user_id: this.user.id,
					parliament_token: initiatives[0].parliament_token,
					title: "Hello, world!",
					created_at: new Date,
					destination: null,
					published_at: null
				})])

				res.headers.location.must.equal("/initiatives/" + uuid + "/edit")
			})
		})
	})

	describe("GET /:id", function() {
		beforeEach(function*() {
			this.author = yield usersDb.create(new ValidUser)
		})

		describe("when not logged in", function() {
			require("root/test/time")(new Date(2015, 5, 18, 13, 37, 42))

			it("must respond with 401 for a unpublished initiative", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: this.author.id
				}))

				var res = yield this.request("/initiatives/" + initiative.uuid)
				res.statusCode.must.equal(401)
				res.statusMessage.must.equal("Initiative Not Public")
			})

			it("must respond with 404 for a non-existent initiative", function*() {
				var uuid = "b3c6f2c0-f671-4fc7-8064-d364f7792db9"
				var res = yield this.request("/initiatives/" + uuid)
				res.statusCode.must.equal(404)
			})

			it("must include social media tags", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					published_at: new Date
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
				metasByProp["og:title"].content.must.equal(initiative.title)
				metasByProp["og:url"].content.must.equal(url)
				metasByProp["og:image"].content.must.equal(url + ".png")
			})

			it("must show done phase by default", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					destination: "parliament",
					published_at: new Date
				}))

				var res = yield this.request("/initiatives/" + initiative.uuid)
				res.statusCode.must.equal(200)

				var dom = parseDom(res.body)
				var phases = queryPhases(dom)
				phases.must.have.property("done")
				phases.must.not.have.property("archived")
			})

			it("must render initiative with Trix text", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "edit",
					published_at: new Date
				}))

				yield textsDb.create(new ValidText({
					initiative_uuid: initiative.uuid,
					user_id: this.author.id,
					content_type: "application/vnd.basecamp.trix+json",

					content: [{
						"text": [{
							"type": "string",
							"attributes": {},
							"string": "Hello, world!"
						}, BLOCK_BREAK],

						"attributes": []
					}]
				}))

				var res = yield this.request("/initiatives/" + initiative.uuid)
				res.statusCode.must.equal(200)
				res.body.must.include(this.author.name)
				res.body.must.include(initiative.title)
				res.body.must.include("Hello, world!")
			})

			it("must render initiative with CitizenOS HTML", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "edit",
					published_at: new Date
				}))

				yield textsDb.create(new ValidText({
					initiative_uuid: initiative.uuid,
					user_id: this.author.id,
					content_type: "application/vnd.citizenos.etherpad+html",
					content: outdent`
						<!DOCTYPE HTML>
						<html>
							<body>
								<h1>Vote for Peace</h1>
								<p>Rest in peace!</p>
							</body>
						</html>
					`
				}))

				var res = yield this.request("/initiatives/" + initiative.uuid)
				res.statusCode.must.equal(200)
				res.body.must.include(this.author.name)
				res.body.must.include(initiative.title)
				res.body.must.not.include("Vote for Peace")
				res.body.must.include("Rest in peace!")
			})

			it("must render external initiative with latest PDF", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					phase: "parliament",
					external: true
				}))

				var file = yield filesDb.create(new ValidFile({
					initiative_uuid: initiative.uuid,
					content_type: "application/pdf"
				}))

				var path = "/initiatives/" + initiative.uuid
				var res = yield this.request(path)
				res.statusCode.must.equal(200)
				res.body.must.include(initiative.title)

				var dom = parseDom(res.body)
				var object = dom.querySelector("object")
				object.data.must.equal(path + "/files/" + file.id)
				object.type.must.equal(String(file.content_type))
			})

			it("must render external initiative if it has no PDF", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					phase: "parliament",
					external: true
				}))

				var path = "/initiatives/" + initiative.uuid
				var res = yield this.request(path)
				res.statusCode.must.equal(200)
				res.body.must.include(initiative.title)
			})

			it("must render initiative with latest text", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "edit",
					published_at: new Date
				}))

				var text = yield textsDb.create(new ValidText({
					initiative_uuid: initiative.uuid,
					user_id: this.author.id,
					created_at: new Date(2015, 5, 18, 13, 37, 42),
					content: "Latest and greatest.",
					content_type: "text/html"
				}))

				yield textsDb.create(new ValidText({
					initiative_uuid: initiative.uuid,
					user_id: this.author.id,
					created_at: new Date(2015, 5, 18, 13, 37, 41),
					content: "Old and dusty.",
					content_type: "text/html"
				}))

				var res = yield this.request("/initiatives/" + initiative.uuid)
				res.statusCode.must.equal(200)
				res.body.must.include(this.author.name)
				res.body.must.include(initiative.title)
				res.body.must.include(text.content)
			})

			it("must render initiative in edit phase", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					destination: "parliament",
					created_at: new Date,
					published_at: new Date,
					discussion_ends_at: DateFns.addDays(new Date, 5)
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
					archived_at: new Date,
					published_at: new Date
				}))

				var res = yield this.request("/initiatives/" + initiative.uuid)
				res.statusCode.must.equal(200)
				res.body.must.not.include(tHtml("INITIATIVE_IN_DISCUSSION"))
			})

			it("must render initiative in edit phase that has ended", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					destination: "parliament",
					published_at: new Date,
					discussion_ends_at: new Date
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
					phase: "sign",
					created_at: DateFns.addDays(new Date, -3),
					signing_started_at: DateFns.addDays(new Date, -1),
					signing_ends_at: DateFns.addDays(new Date, 1)
				}))

				yield citizenosSignaturesDb.create(_.times(
					Math.ceil(Config.votesRequired / 4),
					() => new ValidCitizenosSignature({initiative_uuid: initiative.uuid})
				))

				yield signaturesDb.create(_.times(Config.votesRequired / 4, () => (
					new ValidSignature({initiative_uuid: initiative.uuid})
				)))

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
					initiative.created_at,
					initiative.signing_started_at
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

				yield citizenosSignaturesDb.create(_.times(
					Config.votesRequired / 2,
					() => new ValidCitizenosSignature({initiative_uuid: initiative.uuid})
				))

				yield signaturesDb.create(_.times(Config.votesRequired / 3, () => (
					new ValidSignature({initiative_uuid: initiative.uuid})
				)))

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
					phase: "sign",
					signing_ends_at: new Date
				}))

				yield citizenosSignaturesDb.create(new ValidCitizenosSignature({
					initiative_uuid: initiative.uuid
				}))

				var signatureCount = Config.votesRequired - 1
				yield signaturesDb.create(_.times(signatureCount - 1, () => (
					new ValidSignature({initiative_uuid: initiative.uuid})
				)))

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
					archived_at: new Date,
					signing_ends_at: new Date
				}))

				yield citizenosSignaturesDb.create(new ValidCitizenosSignature({
					initiative_uuid: initiative.uuid
				}))

				var signatureCount = Config.votesRequired - 1
				yield signaturesDb.create(_.times(signatureCount - 1, () => (
					new ValidSignature({initiative_uuid: initiative.uuid})
				)))

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
					phase: "sign",
					signing_ends_at: new Date
				}))

				yield citizenosSignaturesDb.create(_.times(
					Config.votesRequired / 2,
					() => new ValidCitizenosSignature({initiative_uuid: initiative.uuid})
				))

				yield signaturesDb.create(_.times(Config.votesRequired / 2, () => (
					new ValidSignature({initiative_uuid: initiative.uuid})
				)))

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
					has_paper_signatures: true,
					signing_ends_at: DateFns.addDays(new Date, 1)
				}))

				yield citizenosSignaturesDb.create(new ValidCitizenosSignature({
					initiative_uuid: initiative.uuid
				}))

				yield signaturesDb.create(new ValidSignature({
					initiative_uuid: initiative.uuid
				}))

				var res = yield this.request("/initiatives/" + initiative.uuid)
				res.statusCode.must.equal(200)

				var dom = parseDom(res.body)
				var phases = queryPhases(dom)

				_.sum(_.map(phases, "past")).must.equal(1)
				_.sum(_.map(phases, "current")).must.equal(1)
				phases.edit.past.must.be.true()
				phases.sign.current.must.be.true()
				phases.sign.text.must.equal(t("N_SIGNATURES_WITH_PAPER", {votes: 2}))
				phases.must.not.have.property("government")
			})

			it("must render initiative in parliament and not received", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "parliament",
					sent_to_parliament_at: DateFns.addDays(new Date, -5)
				}))

				yield citizenosSignaturesDb.create(_.times(
					Config.votesRequired / 2,
					() => new ValidCitizenosSignature({initiative_uuid: initiative.uuid})
				))

				yield signaturesDb.create(_.times(Config.votesRequired / 2, () => (
					new ValidSignature({initiative_uuid: initiative.uuid})
				)))

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

				yield citizenosSignaturesDb.create(_.times(
					Config.votesRequired / 2,
					() => new ValidCitizenosSignature({initiative_uuid: initiative.uuid})
				))

				yield signaturesDb.create(_.times(Config.votesRequired / 2, () => (
					new ValidSignature({initiative_uuid: initiative.uuid})
				)))

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

				yield citizenosSignaturesDb.create(_.times(
					Config.votesRequired / 2,
					() => new ValidCitizenosSignature({initiative_uuid: initiative.uuid})
				))

				yield signaturesDb.create(_.times(Config.votesRequired / 2, () => (
					new ValidSignature({initiative_uuid: initiative.uuid})
				)))

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

				yield citizenosSignaturesDb.create(_.times(
					Config.votesRequired / 2,
					() => new ValidCitizenosSignature({initiative_uuid: initiative.uuid})
				))

				yield signaturesDb.create(_.times(Config.votesRequired / 2, () => (
					new ValidSignature({initiative_uuid: initiative.uuid})
				)))

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

				yield citizenosSignaturesDb.create(_.times(
					Config.votesRequired / 2,
					() => new ValidCitizenosSignature({initiative_uuid: initiative.uuid})
				))

				yield signaturesDb.create(_.times(Config.votesRequired / 2, () => (
					new ValidSignature({initiative_uuid: initiative.uuid})
				)))

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

				yield citizenosSignaturesDb.create(_.times(
					Config.votesRequired / 2,
					() => new ValidCitizenosSignature({initiative_uuid: initiative.uuid})
				))

				yield signaturesDb.create(_.times(Config.votesRequired / 2, () => (
					new ValidSignature({initiative_uuid: initiative.uuid})
				)))

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

				yield citizenosSignaturesDb.create(_.times(
					Config.votesRequired / 2,
					() => new ValidCitizenosSignature({initiative_uuid: initiative.uuid})
				))

				yield signaturesDb.create(_.times(Config.votesRequired / 2, () => (
					new ValidSignature({initiative_uuid: initiative.uuid})
				)))

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

			describe("subscription form", function() {
				it("must render initiative subscriber count", function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative({
						user_id: this.author.id,
						published_at: new Date
					}))

					yield subscriptionsDb.create(_.times(3, () => new ValidSubscription({
						initiative_uuid: initiative.uuid,
						confirmed_at: new Date
					})))

					var res = yield this.request("/initiatives/" + initiative.uuid)
					res.statusCode.must.equal(200)

					var dom = parseDom(res.body)
					var form = dom.querySelector(".initiative-subscribe-form")

					form.querySelector("p").innerHTML.must.equal(
						t("INITIATIVE_SUBSCRIBER_COUNT", {count: 3})
					)
				})

				it("must render initiatives subscriber count", function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative({
						user_id: this.author.id,
						published_at: new Date
					}))

					yield subscriptionsDb.create(_.times(3, () => new ValidSubscription({
						initiative_uuid: null,
						confirmed_at: new Date
					})))

					var res = yield this.request("/initiatives/" + initiative.uuid)
					res.statusCode.must.equal(200)

					var dom = parseDom(res.body)
					var form = dom.querySelector(".initiative-subscribe-form")

					form.querySelector("p").innerHTML.must.equal(
						t("INITIATIVE_SUBSCRIBER_COUNT_ALL", {allCount: 3})
					)
				})

				it("must render initiative and initiatives subscriber count",
					function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative({
						user_id: this.author.id,
						published_at: new Date
					}))

					yield subscriptionsDb.create(_.times(3, () => new ValidSubscription({
						initiative_uuid: initiative.uuid,
						confirmed_at: new Date
					})))

					yield subscriptionsDb.create(_.times(5, () => new ValidSubscription({
						initiative_uuid: null,
						confirmed_at: new Date
					})))

					var res = yield this.request("/initiatives/" + initiative.uuid)
					res.statusCode.must.equal(200)

					var dom = parseDom(res.body)
					var form = dom.querySelector(".initiative-subscribe-form")

					form.querySelector("p").innerHTML.must.equal(
						t("INITIATIVE_SUBSCRIBER_COUNT_BOTH", {count: 3, allCount: 5})
					)
				})

				it("must not render subscriber counts if none", function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative({
						user_id: this.author.id,
						published_at: new Date
					}))

					var res = yield this.request("/initiatives/" + initiative.uuid)
					res.statusCode.must.equal(200)

					var dom = parseDom(res.body)
					var form = dom.querySelector(".initiative-subscribe-form")
					demand(form.querySelector("p")).be.null()
				})
			})

			describe("comments", function() {
				it("must render initiative comments", function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative({
						user_id: this.author.id,
						published_at: new Date
					}))

					var author = yield usersDb.create(new ValidUser({
						name: "Johnny Lang"
					}))

					var replier = yield usersDb.create(new ValidUser({
						name: "Kenny Loggins"
					}))

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
						user_id: this.author.id,
						published_at: new Date
					}))

					var author = yield usersDb.create(new ValidUser({
						name: "Johnny Lang"
					}))

					var replier = yield usersDb.create(new ValidUser({
						name: "Kenny Loggins"
					}))

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
						user_id: this.author.id,
						published_at: new Date
					}))

					var other = yield initiativesDb.create(new ValidInitiative({
						user_id: this.author.id
					}))

					var author = yield usersDb.create(new ValidUser)

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
			})

			// This was a bug noticed on Mar 24, 2017 where the UI translation strings
			// were not rendered on the page. They were used only for ID-card errors.
			it("must render UI strings when voting", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "sign",
					signing_ends_at: DateFns.addDays(new Date, 1)
				}))

				var res = yield this.request("/initiatives/" + initiative.uuid)
				res.statusCode.must.equal(200)
				res.body.must.include("MSG_ERROR_HWCRYPTO_NO_CERTIFICATES")
			})

			it("must not show thanks if not signed", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "sign",
					signing_ends_at: DateFns.addDays(new Date, 1)
				}))

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
						destination: null,
						published_at: new Date
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
						destination: "muhu-vald",
						published_at: new Date
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
							destination: dest,
							published_at: new Date
						}))

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
						destination: null,
						published_at: new Date
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
						destination: "parliament",
						published_at: new Date
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

			it("must render unpublished initiative if creator", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: this.user.id
				}))

				var res = yield this.request("/initiatives/" + initiative.uuid)
				res.statusCode.must.equal(200)
			})

			it("must respond with 403 for unpublished discussion of other user",
				function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					published_at: null
				}))

				var res = yield this.request("/initiatives/" + initiative.uuid)
				res.statusCode.must.equal(403)
				res.statusMessage.must.equal("Initiative Not Public")
			})

			it("must render initiative in edit phase", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					destination: "parliament",
					created_at: new Date,
					published_at: new Date,
					discussion_ends_at: DateFns.addDays(new Date, 5)
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

			describe("subscription form", function() {
				it("must render subscription form without email if person lacks one",
					function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative({
						user_id: this.author.id,
						published_at: new Date
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
						user_id: this.author.id,
						published_at: new Date
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
						user_id: this.author.id,
						published_at: new Date
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
			})

			describe("comment form", function() {
				it("must render comment form mentioning missing email", function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative({
						user_id: this.author.id,
						published_at: new Date
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
						user_id: this.author.id,
						published_at: new Date
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
						user_id: this.author.id,
						published_at: new Date
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

					form.textContent.must.not.include(
						t("SUBSCRIBE_TO_COMMENTS_SET_EMAIL")
					)

					form.textContent.must.not.include(
						t("SUBSCRIBE_TO_COMMENTS_CONFIRM_EMAIL")
					)
				})

				it("must render subscribe checkbox if subscribed to initiative comments", function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative({
						user_id: this.author.id,
						published_at: new Date
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
						user_id: this.author.id,
						published_at: new Date
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
						user_id: this.author.id,
						published_at: new Date
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
			})

			it("must not show event creation button if in edit phase", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "edit",
					published_at: new Date
				}))

				var res = yield this.request("/initiatives/" + initiative.uuid)
				res.statusCode.must.equal(200)
				res.body.must.not.include(t("CREATE_INITIATIVE_EVENT_BUTTON"))
			})

			EVENTABLE_PHASES.forEach(function(phase) {
				it(`must show event creation button if in ${phase} phase`, function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative({
						user_id: this.user.id,
						phase: phase
					}))

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

				var res = yield this.request("/initiatives/" + initiative.uuid)
				res.statusCode.must.equal(200)
				res.body.must.not.include(t("CREATE_INITIATIVE_EVENT_BUTTON"))
			})

			it("must not show thanks if signed another initiative", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "sign",
					signing_ends_at: DateFns.addDays(new Date, 1)
				}))

				var other = yield initiativesDb.create(new ValidInitiative({
					user_id: this.author.id
				}))

				yield signaturesDb.create(new ValidSignature({
					initiative_uuid: other.uuid,
					country: this.user.country,
					personal_id: this.user.personal_id
				}))

				var res = yield this.request("/initiatives/" + initiative.uuid)
				res.statusCode.must.equal(200)
				res.body.must.not.include(t("REVOKE_SIGNATURE"))
				res.body.must.not.include(t("THANKS_FOR_SIGNING"))
				res.body.must.not.include(t("THANKS_FOR_SIGNING_AGAIN"))
				res.body.must.not.include("donate-form")
			})

			it("must not show thanks if someone from different country signed",
				function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "sign",
					signing_ends_at: DateFns.addDays(new Date, 1)
				}))

				yield signaturesDb.create(new ValidSignature({
					initiative_uuid: initiative.uuid,
					country: "LT",
					personal_id: this.user.personal_id
				}))

				var res = yield this.request("/initiatives/" + initiative.uuid)
				res.statusCode.must.equal(200)
				res.body.must.not.include(t("REVOKE_SIGNATURE"))
				res.body.must.not.include(t("THANKS_FOR_SIGNING"))
				res.body.must.not.include(t("THANKS_FOR_SIGNING_AGAIN"))
				res.body.must.not.include("donate-form")
			})

			it("must not show thanks if someone with different personal id signed",
				function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "sign",
					signing_ends_at: DateFns.addDays(new Date, 1)
				}))

				yield signaturesDb.create(new ValidSignature({
					initiative_uuid: initiative.uuid,
					country: this.user.country,
					personal_id: "38706181337"
				}))

				var res = yield this.request("/initiatives/" + initiative.uuid)
				res.statusCode.must.equal(200)
				res.body.must.not.include(t("REVOKE_SIGNATURE"))
				res.body.must.not.include(t("THANKS_FOR_SIGNING"))
				res.body.must.not.include(t("THANKS_FOR_SIGNING_AGAIN"))
				res.body.must.not.include("donate-form")
			})

			it("must show authoring controls if author", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: this.user.id
				}))

				var res = yield this.request("/initiatives/" + initiative.uuid)
				res.statusCode.must.equal(200)
				res.body.must.include(t("EDIT_INITIATIVE_TEXT"))
			})

			it("must not show authoring controls if not author", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					published_at: new Date
				}))

				var res = yield this.request("/initiatives/" + initiative.uuid)
				res.statusCode.must.equal(200)
				res.body.must.not.include(t("EDIT_INITIATIVE_TEXT"))
			})

			it("must show publish button if text exists", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: this.user.id
				}))

				yield textsDb.create(new ValidText({
					initiative_uuid: initiative.uuid,
					user_id: this.user.id
				}))

				var res = yield this.request("/initiatives/" + initiative.uuid)
				res.statusCode.must.equal(200)
				res.body.must.include(t("PUBLISH_TOPIC"))
			})

			it("must not show publish button if text doesn't exist", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: this.user.id
				}))

				var res = yield this.request("/initiatives/" + initiative.uuid)
				res.statusCode.must.equal(200)
				res.body.must.not.include(t("PUBLISH_TOPIC"))
			})
			
			it("must show delete signature button if signed", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "sign",
					signing_ends_at: DateFns.addDays(new Date, 1)
				}))

				yield signaturesDb.create(new ValidSignature({
					initiative_uuid: initiative.uuid,
					country: this.user.country,
					personal_id: this.user.personal_id
				}))

				var res = yield this.request("/initiatives/" + initiative.uuid)
				res.statusCode.must.equal(200)
				res.body.must.include(t("REVOKE_SIGNATURE"))
				res.body.must.include(t("THANKS_FOR_SIGNING"))
				res.body.must.not.include(t("THANKS_FOR_SIGNING_AGAIN"))
				res.body.must.not.include("donate-form")
			})

			describe("author buttons", function() {
				it("must not render delete initiative button if not initiative author",
					function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative({
						user_id: this.author.id,
						phase: "edit",
						published_at: new Date
					}))

					var res = yield this.request("/initiatives/" + initiative.uuid)
					res.statusCode.must.equal(200)
					res.body.must.not.include(t("DELETE_DISCUSSION"))
				})

				it("must render delete initiative button if in edit phase and unpublished", function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative({
						user_id: this.user.id,
						phase: "edit"
					}))

					var res = yield this.request("/initiatives/" + initiative.uuid)
					res.statusCode.must.equal(200)
					res.body.must.include(t("DELETE_DISCUSSION"))
				})

				it("must render delete initiative button if in edit phase and published", function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative({
						user_id: this.user.id,
						phase: "edit",
						published_at: new Date
					}))

					var res = yield this.request("/initiatives/" + initiative.uuid)
					res.statusCode.must.equal(200)
					res.body.must.include(t("DELETE_DISCUSSION"))
				})

				it("must render delete initiative button if unpublished and with comments",
					function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative({
						user_id: this.user.id,
						phase: "edit"
					}))

					yield commentsDb.create(new ValidComment({
						initiative_uuid: initiative.uuid,
						user_id: this.user.id,
						user_uuid: _.serializeUuid(this.user.uuid)
					}))

					var res = yield this.request("/initiatives/" + initiative.uuid)
					res.statusCode.must.equal(200)
					res.body.must.include(t("DELETE_DISCUSSION"))
				})

				it("must not render delete initiative button if published and with comments",
					function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative({
						user_id: this.user.id,
						phase: "edit",
						published_at: new Date
					}))

					yield commentsDb.create(new ValidComment({
						initiative_uuid: initiative.uuid,
						user_id: this.user.id,
						user_uuid: _.serializeUuid(this.user.uuid)
					}))

					var res = yield this.request("/initiatives/" + initiative.uuid)
					res.statusCode.must.equal(200)
					res.body.must.not.include(t("DELETE_DISCUSSION"))
				})

				_.without(PHASES, "edit").forEach(function(phase) {
					it(`must not render delete initiative button if in ${phase} phase`,
						function*() {
						var initiative = yield initiativesDb.create(new ValidInitiative({
							user_id: this.user.id,
							phase: phase
						}))

						var res = yield this.request("/initiatives/" + initiative.uuid)
						res.statusCode.must.equal(200)
						res.body.must.not.include(t("DELETE_DISCUSSION"))
					})
				})

				describe(`on ${PARLIAMENT_SITE_HOSTNAME}`, function() {
					it("must not render send to parliament button if not enough signatures",
						function*() {
						var initiative = yield initiativesDb.create(new ValidInitiative({
							user_id: this.user.id,
							phase: "sign"
						}))

						yield citizenosSignaturesDb.create(new ValidCitizenosSignature({
							initiative_uuid: initiative.uuid
						}))

						yield signaturesDb.create(_.times(Config.votesRequired - 2, () => (
							new ValidSignature({initiative_uuid: initiative.uuid})
						)))

						var res = yield this.request("/initiatives/" + initiative.uuid)
						res.statusCode.must.equal(200)
						res.body.must.not.include(t("SEND_TO_PARLIAMENT"))
					})

					it("must render send to parliament button if enough signatures",
						function*() {
						var initiative = yield initiativesDb.create(new ValidInitiative({
							user_id: this.user.id,
							phase: "sign"
						}))

						yield citizenosSignaturesDb.create(_.times(
							Config.votesRequired / 2,
							() => new ValidCitizenosSignature({initiative_uuid: initiative.uuid})
						))

						yield signaturesDb.create(_.times(Config.votesRequired / 2, () => (
							new ValidSignature({initiative_uuid: initiative.uuid})
						)))

						var res = yield this.request("/initiatives/" + initiative.uuid)
						res.statusCode.must.equal(200)
						res.body.must.include(t("SEND_TO_PARLIAMENT"))
					})

					it("must render send to parliament button if has paper signatures and only undersigned signatures",
						function*() {
						var initiative = yield initiativesDb.create(new ValidInitiative({
							user_id: this.user.id,
							phase: "sign",
							has_paper_signatures: true
						}))

						yield signaturesDb.create(new ValidSignature({
							initiative_uuid: initiative.uuid
						}))

						var res = yield this.request("/initiatives/" + initiative.uuid)
						res.statusCode.must.equal(200)
						res.body.must.include(t("SEND_TO_PARLIAMENT"))
					})

					it("must render send to parliament button if has paper signatures and only CitizenOS signatures", function*() {
						var initiative = yield initiativesDb.create(new ValidInitiative({
							user_id: this.user.id,
							phase: "sign",
							has_paper_signatures: true
						}))

						yield citizenosSignaturesDb.create(new ValidCitizenosSignature({
							initiative_uuid: initiative.uuid
						}))

						var res = yield this.request("/initiatives/" + initiative.uuid)
						res.statusCode.must.equal(200)
						res.body.must.include(t("SEND_TO_PARLIAMENT"))
					})

					it("must not render send to parliament button if only has paper signatures", function*() {
						var initiative = yield initiativesDb.create(new ValidInitiative({
							user_id: this.user.id,
							phase: "sign",
							has_paper_signatures: true
						}))

						var res = yield this.request("/initiatives/" + initiative.uuid)
						res.statusCode.must.equal(200)
						res.body.must.not.include(t("SEND_TO_PARLIAMENT"))
					})
				})

				describe(`on ${LOCAL_SITE_HOSTNAME}`, function() {
					it("must not render send to government button if not enough signatures",
						function*() {
						var initiative = yield initiativesDb.create(new ValidInitiative({
							user_id: this.user.id,
							phase: "sign",
							destination: "muhu-vald"
						}))

						var threshold = LOCAL_GOVERNMENTS["muhu-vald"].population * 0.01

						yield signaturesDb.create(_.times(Math.round(threshold) - 1, () => (
							new ValidSignature({initiative_uuid: initiative.uuid})
						)))

						var res = yield this.request("/initiatives/" + initiative.uuid, {
							headers: {Host: LOCAL_SITE_HOSTNAME}
						})

						res.statusCode.must.equal(200)
						res.body.must.not.include(t("SEND_TO_PARLIAMENT"))
					})

					it("must not render send to government button if enough signatures",
						function*() {
						var initiative = yield initiativesDb.create(new ValidInitiative({
							user_id: this.user.id,
							phase: "sign",
							destination: "muhu-vald"
						}))

						var threshold = LOCAL_GOVERNMENTS["muhu-vald"].population * 0.01

						yield signaturesDb.create(_.times(Math.round(threshold), () => (
							new ValidSignature({initiative_uuid: initiative.uuid})
						)))

						var res = yield this.request("/initiatives/" + initiative.uuid, {
							headers: {Host: LOCAL_SITE_HOSTNAME}
						})

						res.statusCode.must.equal(200)
						res.body.must.not.include(t("SEND_TO_PARLIAMENT"))
					})
				})
			})
		})
	})

	describe(`GET /:id for image/*`, function() {
		beforeEach(function*() {
			this.author = yield usersDb.create(new ValidUser)

			this.initiative = yield initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				published_at: new Date
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
			this.author = yield usersDb.create(new ValidUser)
		})

		it("must respond with 401 for a unpublished initiative", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				user_id: this.author.id
			}))

			var res = yield this.request("/initiatives/" + initiative.uuid, {
				headers: {Accept: INITIATIVE_TYPE}
			})

			res.statusCode.must.equal(401)
			res.statusMessage.must.equal("Initiative Not Public")
		})

		it("must respond with 404 for non-existent initiative", function*() {
			var uuid = "b3c6f2c0-f671-4fc7-8064-d364f7792db9"
			var res = yield this.request("/initiatives/" + uuid)
			res.statusCode.must.equal(404)
		})

		it("must respond with initiative", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				published_at: new Date
			}))

			var res = yield this.request("/initiatives/" + initiative.uuid, {
				headers: {Accept: INITIATIVE_TYPE}
			})

			res.statusCode.must.equal(200)
			res.headers["content-type"].must.equal(INITIATIVE_TYPE)
			res.headers["access-control-allow-origin"].must.equal("*")

			res.body.must.eql({
				id: initiative.uuid,
				title: initiative.title,
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

			yield citizenosSignaturesDb.create(_.times(5, () => (
				new ValidCitizenosSignature({initiative_uuid: initiative.uuid})
			)))

			yield signaturesDb.create(_.times(3, () => new ValidSignature({
				initiative_uuid: initiative.uuid
			})))

			var res = yield this.request("/initiatives/" + initiative.uuid, {
				headers: {Accept: INITIATIVE_TYPE}
			})

			res.statusCode.must.equal(200)

			res.body.must.eql({
				id: initiative.uuid,
				title: initiative.title,
				phase: "sign",
				signatureCount: 8
			})
		})
	})

	describe(`GET /:id for ${ATOM_TYPE}`, function() {
		beforeEach(function*() {
			this.author = yield usersDb.create(new ValidUser)
		})

		it("must respond with Atom feed", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				title: "Better life for everyone.",
				published_at: new Date
			}))

			var path = `/initiatives/${initiative.uuid}`
			var res = yield this.request(path, {headers: {Accept: ATOM_TYPE}})
			res.statusCode.must.equal(200)
			res.headers["content-type"].must.equal(ATOM_TYPE)

			var feed = Atom.parse(res.body).feed
			feed.id.$.must.equal(Config.url + path)
			feed.updated.$.must.equal(initiative.created_at.toJSON())

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
				user_id: this.author.id,
				published_at: new Date
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
				phase: "parliament",
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
				user_id: this.author.id,
				published_at: new Date
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

		it("must use initiative creation time if no events", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				published_at: new Date
			}))

			var res = yield this.request(`/initiatives/${initiative.uuid}.atom`)
			res.statusCode.must.equal(200)
			var feed = Atom.parse(res.body).feed
			feed.updated.$.must.equal(initiative.created_at.toJSON())
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
				user_id: this.author.id,
				phase: "parliament",
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
				user_id: this.author.id,
				phase: "parliament"
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
				user_id: this.author.id,
				phase: "parliament"
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
				user_id: this.author.id,
				phase: "parliament"
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
				user_id: this.author.id,
				phase: "parliament"
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
					user_id: this.author.id,
					phase: "parliament"
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
				user_id: this.author.id,
				phase: "parliament"
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
				user_id: this.author.id,
				phase: "parliament"
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
				user_id: this.author.id,
				phase: "parliament"
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
				user_id: this.author.id,
				phase: "parliament"
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
				user_id: this.author.id,
				phase: "parliament"
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
				user_id: this.author.id,
				phase: "parliament"
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
				user_id: this.author.id,
				phase: "parliament",
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
				user_id: this.author.id,
				phase: "parliament",
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
				user_id: this.author.id,
				phase: "parliament"
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

		describe("when logged in", function() {
			require("root/test/fixtures").user()

			describe("given destination", function() {
				it("must set destination to null given empty string", function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative({
						user_id: this.user.id,
						destination: "tallinn"
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

					yield textsDb.create(new ValidText({
						initiative_uuid: initiative.uuid,
						user_id: this.user.id,
					}))

					var res = yield this.request("/initiatives/" + initiative.uuid, {
						method: "PUT",
						form: {_csrf_token: this.csrfToken, visibility: "public"}
					})

					res.statusCode.must.equal(200)
					res.body.must.include(t("DEADLINE_EXPLANATION"))
					res.body.must.include(t("PUBLISH_TOPIC"))
				})

				it("must respond with 403 if not author", function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative({
						user_id: (yield usersDb.create(new ValidUser)).id,
						published_at: new Date
					}))

					var res = yield this.request("/initiatives/" + initiative.uuid, {
						method: "PUT",
						form: {_csrf_token: this.csrfToken, visibility: "public"}
					})

					res.statusCode.must.equal(403)
					res.statusMessage.must.equal("No Permission to Edit")
				})

				it("must update initiative", function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative({
						user_id: this.user.id
					}))

					yield textsDb.create(new ValidText({
						initiative_uuid: initiative.uuid,
						user_id: this.user.id,
					}))

					var endsAt = DateFns.addDays(
						DateFns.endOfDay(new Date),
						Config.minDeadlineDays
					)

					var res = yield this.request(`/initiatives/${initiative.uuid}`, {
						method: "PUT",
						form: {
							_csrf_token: this.csrfToken,
							visibility: "public",
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
					res.body.must.include(t("PUBLISHED_INITIATIVE"))

					yield initiativesDb.read(initiative).must.then.eql({
						__proto__: initiative,
						published_at: new Date,
						discussion_ends_at: endsAt
					})
				})

				it("must not update initiative if no text created", function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative({
						user_id: this.user.id
					}))

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

					res.statusCode.must.equal(422)
					res.statusMessage.must.equal("No Text")
					yield initiativesDb.read(initiative).must.then.eql(initiative)
				})

				it("must clear end email when setting discussion end time",
					function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative({
						user_id: this.user.id,
						published_at: pseudoDateTime(),
						discussion_end_email_sent_at: pseudoDateTime()
					}))

					yield textsDb.create(new ValidText({
						initiative_uuid: initiative.uuid,
						user_id: this.user.id,
					}))

					var endsAt = DateFns.addDays(DateFns.endOfDay(new Date), 5)
					var res = yield this.request(`/initiatives/${initiative.uuid}`, {
						method: "PUT",
						form: {
							_csrf_token: this.csrfToken,
							visibility: "public",
							endsAt: formatIsoDate(endsAt)
						}
					})

					res.statusCode.must.equal(303)

					yield initiativesDb.read(initiative).must.then.eql({
						__proto__: initiative,
						discussion_ends_at: endsAt,
						discussion_end_email_sent_at: null
					})
				})

				it("must respond with 422 if setting a short deadline", function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative({
						user_id: this.user.id,
						discussion_end_email_sent_at: new Date,
						published_at: new Date
					}))

					yield textsDb.create(new ValidText({
						initiative_uuid: initiative.uuid,
						user_id: this.user.id,
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
					res.statusMessage.must.equal("Deadline Too Near or Too Far")
					yield initiativesDb.read(initiative).must.then.eql(initiative)
				})
			})

			describe("given status=voting", function() {
				it("must render update status for voting page", function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative({
						user_id: this.user.id,
						destination: "parliament",
						created_at: DateFns.addDays(new Date, -Config.minDeadlineDays),
						published_at: new Date
					}))

					var res = yield this.request("/initiatives/" + initiative.uuid, {
						method: "PUT",
						form: {_csrf_token: this.csrfToken, status: "voting"}
					})

					res.statusCode.must.equal(200)
					res.body.must.include(t("VOTE_DEADLINE_EXPLANATION"))
				})

				it("must update initiative given Trix text", function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative({
						user_id: this.user.id,
						destination: "parliament",
						created_at: DateFns.addDays(new Date, -Config.minDeadlineDays),
						published_at: new Date
					}))

					var text = yield textsDb.create(new ValidText({
						initiative_uuid: initiative.uuid,
						user_id: this.user.id,
						content_type: "application/vnd.basecamp.trix+json",

						content: [{
							"text": [{
								"type": "string",
								"attributes": {},
								"string": "Hello, world!"
							}, BLOCK_BREAK],

							"attributes": []
						}]
					}))

					var endsAt = DateFns.addDays(
						DateFns.endOfDay(new Date),
						Config.minDeadlineDays
					)

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

					var html = Initiative.renderForParliament(initiative, text)
					html.must.include("Hello, world!")

					yield initiativesDb.search(sql`
						SELECT * FROM initiatives
					`).must.then.eql([{
						__proto__: initiative,
						phase: "sign",
						signing_started_at: new Date,
						signing_ends_at: endsAt,
						text: html,
						text_type: new MediaType("text/html"),
						text_sha256: sha256(html)
					}])
				})

				it("must update initiative given CitizenOS HTML", function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative({
						user_id: this.user.id,
						destination: "parliament",
						created_at: DateFns.addDays(new Date, -Config.minDeadlineDays),
						published_at: new Date
					}))

					var text = yield textsDb.create(new ValidText({
						initiative_uuid: initiative.uuid,
						user_id: this.user.id,
						content_type: "application/vnd.citizenos.etherpad+html",
						content: outdent`
							<!DOCTYPE HTML>
							<html>
								<body>
									<h1>Vote for Peace</h1>
									<p>Rest in peace!</p>
								</body>
							</html>
						`
					}))

					var endsAt = DateFns.addDays(
						DateFns.endOfDay(new Date),
						Config.minDeadlineDays
					)

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

					var html = Initiative.renderForParliament(initiative, text)
					html.must.include("Rest in peace!")

					yield initiativesDb.search(sql`
						SELECT * FROM initiatives
					`).must.then.eql([{
						__proto__: initiative,
						phase: "sign",
						signing_started_at: new Date,
						signing_ends_at: endsAt,
						text: html,
						text_type: new MediaType("text/html"),
						text_sha256: sha256(html)
					}])
				})

				it("must use the latest text", function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative({
						user_id: this.user.id,
						destination: "parliament",
						created_at: DateFns.addDays(new Date, -Config.minDeadlineDays),
						published_at: new Date
					}))

					var text = yield textsDb.create(new ValidText({
						initiative_uuid: initiative.uuid,
						user_id: this.user.id,
						created_at: new Date(2015, 5, 18, 13, 37, 42),
						content_type: "application/vnd.basecamp.trix+json",
						content: []
					}))

					yield textsDb.create(new ValidText({
						initiative_uuid: initiative.uuid,
						user_id: this.user.id,
						created_at: new Date(2015, 5, 18, 13, 37, 40),
					}))

					var endsAt = DateFns.addDays(DateFns.endOfDay(new Date), 30)
					var res = yield this.request(`/initiatives/${initiative.uuid}`, {
						method: "PUT",
						form: {
							_csrf_token: this.csrfToken,
							status: "voting",
							endsAt: formatIsoDate(endsAt)
						}
					})

					res.statusCode.must.equal(303)
					var html = Initiative.renderForParliament(initiative, text)

					yield initiativesDb.search(sql`
						SELECT * FROM initiatives
					`).must.then.eql([{
						__proto__: initiative,
						phase: "sign",
						signing_started_at: new Date,
						signing_ends_at: endsAt,
						text: html,
						text_type: new MediaType("text/html"),
						text_sha256: sha256(html)
					}])
				})

				it("must update only deadline and clear end email if in sign phase",
					function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative({
						user_id: this.user.id,
						phase: "sign",
						signing_started_at: pseudoDateTime(),
						discussion_end_email_sent_at: new Date,
						signing_end_email_sent_at: new Date
					}))

					var endsAt = DateFns.addDays(DateFns.endOfDay(new Date), 30)
					var res = yield this.request(`/initiatives/${initiative.uuid}`, {
						method: "PUT",
						form: {
							_csrf_token: this.csrfToken,
							status: "voting",
							endsAt: formatIsoDate(endsAt)
						}
					})

					res.statusCode.must.equal(303)

					var cookies = parseCookies(res.headers["set-cookie"])
					res = yield this.request(res.headers.location, {
						headers: {Cookie: Http.serializeCookies(cookies)}
					})

					res.statusCode.must.equal(200)
					res.body.must.include(t("INITIATIVE_SIGNING_DEADLINE_UPDATED"))

					yield initiativesDb.search(sql`
						SELECT * FROM initiatives
					`).must.then.eql([{
						__proto__: initiative,
						signing_ends_at: endsAt,
						signing_end_email_sent_at: null
					}])
				})

				it("must not update text if updating deadline", function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative({
						user_id: this.user.id,
						phase: "sign",
						signing_started_at: pseudoDateTime(),
						text: "Hello, world!",
						text_type: "text/plain",
						text_sha256: sha256("Hello, world!")
					}))

					var endsAt = DateFns.addDays(
						DateFns.endOfDay(new Date),
						Config.minDeadlineDays
					)

					var res = yield this.request(`/initiatives/${initiative.uuid}`, {
						method: "PUT",
						form: {
							_csrf_token: this.csrfToken,
							status: "voting",
							endsAt: formatIsoDate(endsAt)
						}
					})

					res.statusCode.must.equal(303)

					yield initiativesDb.search(sql`
						SELECT * FROM initiatives
					`).must.then.eql([{
						__proto__: initiative,
						signing_ends_at: endsAt,
						signing_end_email_sent_at: null
					}])
				})

				it("must update initiative if on fast-track", function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative({
						user_id: this.user.id,
						destination: "parliament",
						created_at: DateFns.addDays(new Date, 1 - Config.minDeadlineDays),
						published_at: new Date,
						tags: ["fast-track"]
					}))

					yield textsDb.create(new ValidText({
						initiative_uuid: initiative.uuid,
						user_id: this.user.id,
						content_type: "application/vnd.basecamp.trix+json",
						content: []
					}))

					var endsAt = DateFns.addDays(DateFns.endOfDay(new Date), 30)

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

					initiative = yield initiativesDb.read(initiative)
					initiative.phase.must.equal("sign")
				})

				it("must respond with 403 if not author", function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative({
						user_id: (yield usersDb.create(new ValidUser)).id,
						published_at: new Date
					}))

					var res = yield this.request("/initiatives/" + initiative.uuid, {
						method: "PUT",
						form: {_csrf_token: this.csrfToken, status: "voting"}
					})

					res.statusCode.must.equal(403)
					res.statusMessage.must.equal("No Permission to Edit")
				})

				it("must respond with 403 if less than 3 days passed", function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative({
						user_id: this.user.id,
						destination: "parliament",
						created_at: DateFns.addDays(new Date, -Config.minDeadlineDays + 1),
						published_at: new Date
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
					res.statusMessage.must.equal("Cannot Update to Sign Phase")
					yield initiativesDb.read(initiative).must.then.eql(initiative)
				})

				it("must respond with 422 if setting a short deadline", function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative({
						user_id: this.user.id,
						created_at: DateFns.addDays(new Date, -Config.minDeadlineDays),
						published_at: new Date
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

				it("must email subscribers", function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative({
						user_id: this.user.id,
						destination: "parliament",
						published_at: new Date
					}))

					yield textsDb.create(new ValidText({
						initiative_uuid: initiative.uuid,
						user_id: this.user.id,
						content_type: "application/vnd.basecamp.trix+json",
						content: []
					}))

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
							initiativeTitle: initiative.title
						}),

						text: renderEmail("SENT_TO_SIGNING_MESSAGE_BODY", {
							initiativeTitle: initiative.title,
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

					yield citizenosSignaturesDb.create(_.times(
						Config.votesRequired / 2,
						() => new ValidCitizenosSignature({
							initiative_uuid: initiative.uuid
						})
					))

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

					yield citizenosSignaturesDb.create(_.times(
						Config.votesRequired / 2 - 1,
						() => new ValidCitizenosSignature({
							initiative_uuid: initiative.uuid
						})
					))

					yield signaturesDb.create(_.times(
						Config.votesRequired / 2 - 1,
						() => new ValidSignature({initiative_uuid: initiative.uuid})
					))

					var res = yield this.request("/initiatives/" + initiative.uuid, {
						method: "PUT",
						form: {_csrf_token: this.csrfToken, status: "followUp"}
					})

					res.statusCode.must.equal(403)
					res.statusMessage.must.equal("Cannot Send to Parliament")
				})

				it("must respond with 403 if only has paper signatures", function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative({
						user_id: this.user.id,
						phase: "sign",
						has_paper_signatures: true
					}))

					var res = yield this.request("/initiatives/" + initiative.uuid, {
						method: "PUT",
						form: {_csrf_token: this.csrfToken, status: "followUp"}
					})

					res.statusCode.must.equal(403)
					res.statusMessage.must.equal("Cannot Send to Parliament")
				})

				it("must respond with 403 if not author", function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative({
						user_id: (yield usersDb.create(new ValidUser)).id,
						published_at: new Date
					}))

					var res = yield this.request("/initiatives/" + initiative.uuid, {
						method: "PUT",
						form: {_csrf_token: this.csrfToken, status: "followUp"}
					})

					res.statusCode.must.equal(403)
					res.statusMessage.must.equal("No Permission to Edit")
				})

				it("must update initiative and email parliament", function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative({
						user_id: this.user.id,
						phase: "sign"
					}))

					yield signaturesDb.create(_.times(Config.votesRequired, () => (
						new ValidSignature({initiative_uuid: initiative.uuid})
					)))

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

					this.emails.length.must.equal(1)
					var email = this.emails[0]
					email.envelope.to.must.eql([Config.parliamentEmail])

					email.headers.subject.must.equal(t(
						"EMAIL_INITIATIVE_TO_PARLIAMENT_TITLE",
						{initiativeTitle: initiative.title}
					))

					var initiativeUrl = `${Config.url}/initiatives/${initiative.uuid}`
					var signaturesUrl = initiativeUrl + "/signatures.asice"
					signaturesUrl += "?parliament-token="
					signaturesUrl += updatedInitiative.parliament_token.toString("hex")

					email.body.must.equal(t("EMAIL_INITIATIVE_TO_PARLIAMENT_BODY", {
						initiativeUuid: initiative.uuid,
						initiativeTitle: initiative.title,
						initiativeUrl: initiativeUrl,
						signatureCount: Config.votesRequired,
						undersignedSignaturesUrl: signaturesUrl,
						authorName: "John",
						authorEmail: "john@example.com",
						authorPhone: "42",
						siteUrl: Config.url,
						facebookUrl: Config.facebookUrl,
						twitterUrl: Config.twitterUrl
					}))
				})

				it("must email subscribers", function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative({
						user_id: this.user.id,
						phase: "sign"
					}))

					yield citizenosSignaturesDb.create(_.times(
						Config.votesRequired / 2 + 3,
						() => new ValidCitizenosSignature({
							initiative_uuid: initiative.uuid
						})
					))

					yield signaturesDb.create(_.times(Config.votesRequired / 2, () => (
						new ValidSignature({initiative_uuid: initiative.uuid})
					)))

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
							initiativeTitle: initiative.title
						}),

						text: renderEmail("SENT_TO_PARLIAMENT_MESSAGE_BODY", {
							authorName: "John",
							initiativeTitle: initiative.title,
							initiativeUrl: `${Config.url}/initiatives/${initiative.uuid}`,
							signatureCount: Config.votesRequired + 3
						}),

						sent_at: new Date,
						sent_to: emails
					}])

					this.emails.length.must.equal(2)
					var email = this.emails[1]
					email.envelope.to.must.eql(emails)

					email.headers.subject.must.equal(t(
						"SENT_TO_PARLIAMENT_MESSAGE_TITLE",
						{initiativeTitle: initiative.title}
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
						initiativeTitle: initiative.title,
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

				it("must throw 403 when not author", function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative({
						user_id: (yield usersDb.create(new ValidUser)).id,
						published_at: new Date
					}))

					var res = yield this.request(`/initiatives/${initiative.uuid}`, {
						method: "PUT",
						form: {_csrf_token: this.csrfToken, notes: "Hello, world"}
					})

					res.statusCode.must.equal(403)
					res.statusMessage.must.equal("No Permission to Edit")
					yield initiativesDb.read(initiative).must.then.eql(initiative)
				})
			})
		})
	})

	describe("DELETE /:id", function() {
		describe("when not logged in", function() {
			it("must respond with 401", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: (yield usersDb.create(new ValidUser)).id,
					published_at: new Date
				}))

				var res = yield this.request(`/initiatives/${initiative.uuid}`, {
					method: "POST",
					form: {_csrf_token: this.csrfToken, _method: "delete"}
				})

				res.statusCode.must.equal(401)
				res.statusMessage.must.equal("Unauthorized")
			})
		})

		describe("when logged in", function() {
			require("root/test/fixtures").user()

			it("must delete unpublished initiative in edit phase", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: this.user.id,
					published_at: null
				}))

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

				yield initiativesDb.search(sql`
					SELECT * FROM initiatives
				`).must.then.be.empty()
			})

			it("must delete published initiative in edit phase", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: this.user.id,
					published_at: new Date
				}))

				var res = yield this.request("/initiatives/" + initiative.uuid, {
					method: "POST",
					form: {_csrf_token: this.csrfToken, _method: "delete"}
				})

				res.statusCode.must.equal(302)
				res.headers.location.must.equal(`/initiatives`)

				yield initiativesDb.search(sql`
					SELECT * FROM initiatives
				`).must.then.be.empty()
			})

			it("must delete if initiative is unpublished and has comments",
				function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: this.user.id,
					published_at: null
				}))

				yield commentsDb.create(new ValidComment({
					initiative_uuid: initiative.uuid,
					user_id: this.user.id,
					user_uuid: _.serializeUuid(this.user.uuid)
				}))

				var res = yield this.request("/initiatives/" + initiative.uuid, {
					method: "POST",
					form: {_csrf_token: this.csrfToken, _method: "delete"}
				})

				res.statusCode.must.equal(302)
				res.headers.location.must.equal(`/initiatives`)

				yield initiativesDb.search(sql`
					SELECT * FROM initiatives
				`).must.then.be.empty()
			})

			it("must not delete if initiative is published and has comments",
				function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: this.user.id,
					published_at: new Date
				}))

				yield commentsDb.create(new ValidComment({
					initiative_uuid: initiative.uuid,
					user_id: this.user.id,
					user_uuid: _.serializeUuid(this.user.uuid)
				}))

				var path = "/initiatives/" + initiative.uuid
				var res = yield this.request(path, {
					method: "POST",
					form: {_csrf_token: this.csrfToken, _method: "delete"}
				})

				res.statusCode.must.equal(302)
				res.headers.location.must.equal(path)

				var cookies = parseCookies(res.headers["set-cookie"])
				res = yield this.request(res.headers.location, {
					headers: {Cookie: Http.serializeCookies(cookies)}
				})

				res.statusCode.must.equal(200)
				res.body.must.include(t("INITIATIVE_CANNOT_BE_DELETED_HAS_COMMENTS"))

				yield initiativesDb.read(sql`
					SELECT * FROM initiatives
				`).must.then.eql(initiative)
			})

			it("must delete subscribers of unpublished initiative", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: this.user.id,
					published_at: null
				}))

				yield subscriptionsDb.create(new ValidSubscription({
					initiative_uuid: initiative.uuid
				}))

				var res = yield this.request("/initiatives/" + initiative.uuid, {
					method: "POST",
					form: {_csrf_token: this.csrfToken, _method: "delete"}
				})

				res.statusCode.must.equal(302)
				res.headers.location.must.equal(`/initiatives`)

				yield initiativesDb.search(sql`
					SELECT * FROM initiatives
				`).must.then.be.empty()

				yield subscriptionsDb.search(sql`
					SELECT * FROM initiative_subscriptions
				`).must.then.be.empty()
			})

			it("must not delete subscribers of other initiatives", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: this.user.id,
					published_at: null
				}))

				var other = yield initiativesDb.create(new ValidInitiative({
					user_id: this.user.id
				}))

				var subscription = yield subscriptionsDb.create(new ValidSubscription({
					initiative_uuid: other.uuid
				}))

				var res = yield this.request("/initiatives/" + initiative.uuid, {
					method: "POST",
					form: {_csrf_token: this.csrfToken, _method: "delete"}
				})

				res.statusCode.must.equal(302)
				res.headers.location.must.equal(`/initiatives`)

				yield initiativesDb.search(sql`
					SELECT * FROM initiatives
				`).must.then.eql([other])

				yield subscriptionsDb.read(sql`
					SELECT * FROM initiative_subscriptions
				`).must.then.eql(subscription)
			})

			it("must respond with 405 given initiative in sign phase", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: this.user.id,
					phase: "sign"
				}))

				var res = yield this.request("/initiatives/" + initiative.uuid, {
					method: "POST",
					form: {_csrf_token: this.csrfToken, _method: "delete"}
				})

				res.statusCode.must.equal(405)
				res.statusMessage.must.must.equal("Can Only Delete Discussions")
			})

			it("must respond with 405 if not author", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: (yield usersDb.create(new ValidUser)).id,
					published_at: new Date
				}))

				var res = yield this.request("/initiatives/" + initiative.uuid, {
					method: "POST",
					form: {_csrf_token: this.csrfToken, _method: "delete"}
				})

				res.statusCode.must.equal(403)
				res.statusMessage.must.must.equal("No Permission to Delete")
			})
		})
	})

	describe("GET /:id/edit", function() {
		describe("when not logged in", function() {
			it("must respond with 401 if not published", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: (yield usersDb.create(new ValidUser)).id
				}))

				var res = yield this.request(`/initiatives/${initiative.uuid}/edit`)
				res.statusCode.must.equal(401)
				res.statusMessage.must.equal("Initiative Not Public")
			})

			it("must respond with 401 if published", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: (yield usersDb.create(new ValidUser)).id,
					published_at: new Date
				}))

				var res = yield this.request(`/initiatives/${initiative.uuid}/edit`)
				res.statusCode.must.equal(401)
				res.statusMessage.must.equal("Unauthorized")
			})
		})

		describe("when logged in", function() {
			require("root/test/fixtures").user()

			it("must respond with 403 if not the author", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: (yield usersDb.create(new ValidUser)).id,
					published_at: new Date
				}))

				var res = yield this.request(`/initiatives/${initiative.uuid}/edit`)
				res.statusCode.must.equal(403)
				res.statusMessage.must.equal("No Permission to Edit")
			})

			it("must show error if no longer in edit phase", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: this.user.id,
					phase: "sign"
				}))

				var res = yield this.request(`/initiatives/${initiative.uuid}/edit`)
				res.statusCode.must.equal(200)
				res.body.must.include(t("CANNOT_EDIT_INITIATIVE_TEXT"))
			})

			it("must render page if no existing texts", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: this.user.id
				}))
				
				var res = yield this.request(`/initiatives/${initiative.uuid}/edit`)
				res.statusCode.must.equal(200)
			})

			it("must render page with latest text", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: this.user.id
				}))

				var text = yield textsDb.create(new ValidText({
					initiative_uuid: initiative.uuid,
					user_id: this.user.id,
					created_at: new Date(2015, 5, 18, 13, 37, 42),
					content_type: "application/vnd.basecamp.trix+json",

					content: [{
						"text": [{
							"type": "string",
							"attributes": {},
							"string": "Latest and greatest."
						}, BLOCK_BREAK],

						"attributes": []
					}]
				}))

				yield textsDb.create(new ValidText({
					initiative_uuid: initiative.uuid,
					user_id: this.user.id,
					created_at: new Date(2015, 5, 18, 13, 37, 41),
					content: "Old and dusty.",
					content_type: "text/html"
				}))
				
				var res = yield this.request(`/initiatives/${initiative.uuid}/edit`)
				res.statusCode.must.equal(200)
				var dom = parseDom(res.body)
				var input = dom.querySelector("input[name=content]")
				input.value.must.equal(JSON.stringify(text.content))
			})

			describe("given CitizenOS HTML", function() {
				function forEachHeader(fn) { _.times(6, (i) => fn(`h${i + 1}`)) }

				// Initiative with id 1f821c9e-1b93-4ef5-947f-fe0be45855c5 has the main
				// title with <h2>, not <h1>.
				forEachHeader(function(tagName) {
					it(`must remove title from first <${tagName}>`, function*() {
						var initiative = yield initiativesDb.create(new ValidInitiative({
							user_id: this.user.id
						}))

						yield textsDb.create(new ValidText({
							initiative_uuid: initiative.uuid,
							user_id: this.user.id,
							content_type: "application/vnd.citizenos.etherpad+html",
							content: outdent`
								<!DOCTYPE HTML>
								<html>
									<body>
										<${tagName}>Vote for Peace</${tagName}>
										<p>Rest in peace!</p>
									</body>
								</html>
							`
						}))

						var res = yield this.request(`/initiatives/${initiative.uuid}/edit`)
						res.statusCode.must.equal(200)

						var dom = parseDom(res.body)
						var input = dom.querySelector("input[name=content]")

						JSON.parse(input.value).must.equal(outdent`
							<!DOCTYPE HTML>
							<html>
								<body><p>Rest in peace!</p></body>
							</html>
						`)
					})
				})

				it("must remove title from multiline <h1>", function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative({
						user_id: this.user.id
					}))

					yield textsDb.create(new ValidText({
						initiative_uuid: initiative.uuid,
						user_id: this.user.id,
						content_type: "application/vnd.citizenos.etherpad+html",
						content: outdent`
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
					}))

					var res = yield this.request(`/initiatives/${initiative.uuid}/edit`)
					res.statusCode.must.equal(200)

					var dom = parseDom(res.body)
					var input = dom.querySelector("input[name=content]")

					JSON.parse(input.value).must.equal(outdent`
						<!DOCTYPE HTML>
						<html>
							<body><p>Rest in peace!</p></body>
						</html>
					`)
				})

				it("must remove single title given multiple <h1>", function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative({
						user_id: this.user.id
					}))

					yield textsDb.create(new ValidText({
						initiative_uuid: initiative.uuid,
						user_id: this.user.id,
						content_type: "application/vnd.citizenos.etherpad+html",
						content: outdent`
							<!DOCTYPE HTML>
							<html>
								<body>
									<h1>Vote for Peace</h1>
									<h1>Vote for Terror</h1>
									<p>Rest in peace!</p>
								</body>
							</html>
						`
					}))

					var res = yield this.request(`/initiatives/${initiative.uuid}/edit`)
					res.statusCode.must.equal(200)

					var dom = parseDom(res.body)
					var input = dom.querySelector("input[name=content]")

					JSON.parse(input.value).must.equal(outdent`
						<!DOCTYPE HTML>
						<html>
							<body><h1>Vote for Terror</h1>
							\t<p>Rest in peace!</p></body>
						</html>
					`)
				})

				it("must remove title given multiple empty and blank <h1>s",
					function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative({
						user_id: this.user.id
					}))

					yield textsDb.create(new ValidText({
						initiative_uuid: initiative.uuid,
						user_id: this.user.id,
						content_type: "application/vnd.citizenos.etherpad+html",
						content: outdent`
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
					}))

					var res = yield this.request(`/initiatives/${initiative.uuid}/edit`)
					res.statusCode.must.equal(200)

					var dom = parseDom(res.body)
					var input = dom.querySelector("input[name=content]")

					JSON.parse(input.value).must.equal(outdent`
						<!DOCTYPE HTML>
						<html>
							<body><p>Rest in peace!</p></body>
						</html>
					`)
				})

				it("must remove title given multiple empty and blank <h2>s",
					function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative({
						user_id: this.user.id
					}))

					yield textsDb.create(new ValidText({
						initiative_uuid: initiative.uuid,
						user_id: this.user.id,
						content_type: "application/vnd.citizenos.etherpad+html",
						content: outdent`
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
					}))

					var res = yield this.request(`/initiatives/${initiative.uuid}/edit`)
					res.statusCode.must.equal(200)

					var dom = parseDom(res.body)
					var input = dom.querySelector("input[name=content]")

					JSON.parse(input.value).must.equal(outdent`
						<!DOCTYPE HTML>
						<html>
							<body><p>Rest in peace!</p></body>
						</html>
					`)
				})

				it("must strip leading and trailing <br>s", function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative({
						user_id: this.user.id
					}))

					yield textsDb.create(new ValidText({
						initiative_uuid: initiative.uuid,
						user_id: this.user.id,
						content_type: "application/vnd.citizenos.etherpad+html",
						content: outdent`
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
					}))

					var res = yield this.request(`/initiatives/${initiative.uuid}/edit`)
					res.statusCode.must.equal(200)

					var dom = parseDom(res.body)
					var input = dom.querySelector("input[name=content]")

					JSON.parse(input.value).must.equal(outdent`
						<!DOCTYPE HTML>
						<html>
							<body><p>Rest in peace!</p></body>
						</html>
					`)
				})

				forEachHeader(function(tagName) {
					it(`must strip <br>s around <${tagName}>s`, function*() {
						var initiative = yield initiativesDb.create(new ValidInitiative({
							user_id: this.user.id
						}))

						yield textsDb.create(new ValidText({
							initiative_uuid: initiative.uuid,
							user_id: this.user.id,
							content_type: "application/vnd.citizenos.etherpad+html",
							content: outdent`
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
						}))

						var res = yield this.request(`/initiatives/${initiative.uuid}/edit`)
						res.statusCode.must.equal(200)

						var dom = parseDom(res.body)
						var input = dom.querySelector("input[name=content]")

						JSON.parse(input.value).must.equal(outdent`
							<!DOCTYPE HTML>
							<html>
								<body><p>Indeed</p>
									<${tagName}>Reasons</${tagName}>
									<p>Because.</p></body>
							</html>
						`)
					})
				})
			})
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
