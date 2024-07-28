var _ = require("root/lib/underscore")
var Qs = require("qs")
var Url = require("url")
var Csv = require("root/lib/csv")
var Atom = require("root/lib/atom")
var DateFns = require("date-fns")
var Config = require("root").config
var Crypto = require("crypto")
var MediaType = require("medium-type")
var Initiative = require("root/lib/initiative")
var ValidUser = require("root/test/valid_user")
var ValidCoauthor = require("root/test/valid_initiative_coauthor")
var ValidInitiative = require("root/test/valid_initiative")
var ValidSubscription = require("root/test/valid_subscription")
var ValidSignature = require("root/test/valid_signature")
var ValidCitizenosSignature = require("root/test/valid_citizenos_signature")
var ValidComment = require("root/test/valid_comment")
var ValidText = require("root/test/valid_initiative_text")
var ValidFile = require("root/test/valid_event_file")
var ValidEvent = require("root/test/valid_initiative_event")
var I18n = require("root/lib/i18n")
var formatIsoDate = require("root/lib/i18n").formatDate.bind(null, "iso")
var sql = require("sqlate")
var t = require("root/lib/i18n").t.bind(null, "et")
var renderEmail = require("root/lib/i18n").email.bind(null, "et")
var tHtml = _.compose(_.escapeHtml, t)
var {pseudoDateTime} = require("root/lib/crypto")
var {parseCookies} = require("root/test/web")
var {serializeCookies} = require("root/test/web")
var usersDb = require("root/db/users_db")
var coauthorsDb = require("root/db/initiative_coauthors_db")
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
var parseHtml = require("root/test/html").parse
var outdent = require("root/lib/outdent")
var sha256 = require("root/lib/crypto").hash.bind(null, "sha256")
var concat = Array.prototype.concat.bind(Array.prototype)
var demand = require("must")
var {newTrixDocument} = require("root/test/fixtures")
var {serializePersonalId} = require("root/lib/user")
var {serializeMailgunVariables} = require("root/lib/subscription")
var {serializeCsvInitiative} =
	require("root/controllers/initiatives_controller")
var {TRIX_BLANK_DOCUMENT} = require("root/test/fixtures")
var INITIATIVE_TYPE = "application/vnd.rahvaalgatus.initiative+json; v=1"
var ATOM_TYPE = "application/atom+xml"
var {PHASES} = require("root/lib/initiative")
var EVENTABLE_PHASES = _.without(PHASES, "edit")
var NONEVENTABLE_PHASES = _.difference(Initiative.PHASES, EVENTABLE_PHASES)
var LOCAL_PHASES = _.without(PHASES, "parliament")
var {PARLIAMENT_DECISIONS} = Initiative
var {COMMITTEE_MEETING_DECISIONS} = Initiative
var {SITE_URLS} = require("root/test/fixtures")
var PNG = Buffer.from("89504e470d0a1a0a1337", "hex")
var PNG_PREVIEW = Buffer.from("89504e470d0a1a0a4269", "hex")
var LOCAL_GOVERNMENTS = require("root/lib/local_governments")
var {SUMMARY_MAX_LENGTH} =
	require("root/controllers/initiatives/texts_controller")
var HTML_TYPE = "text/html; charset=utf-8"
var TRIX_TYPE = new MediaType("application/vnd.basecamp.trix+json")
var TRIX_SECTIONS_TYPE =
	new MediaType("application/vnd.rahvaalgatus.trix-sections+json")
var CSV_TYPE = "text/csv; charset=utf-8"
var TWITTER_NAME = Config.twitterUrl.replace(/^.*\//, "")
var MAX_URL_LENGTH = 1024
var INITIATIVES_URL = `${Config.url}/initiatives`
var INITIATIVE_RATE = 10
var COAUTHOR_STATUSES =
	require("root/controllers/initiatives/coauthors_controller").STATUSES

var serializeApiInitiative = _.compose(
  JSON.parse,
  JSON.stringify,
	require("root/controllers/initiatives_controller").serializeApiInitiative
)

var PARLIAMENT_MEETING_DECISION_TEXTS = {
	"continue": t("PARLIAMENT_MEETING_DECISION_CONTINUE"),
	"hold-public-hearing": t("PARLIAMENT_MEETING_DECISION_HOLD_PUBLIC_HEARING"),
	"reject": t("PARLIAMENT_MEETING_DECISION_REJECT"),
	"forward": t("PARLIAMENT_MEETING_DECISION_FORWARD"),

	"forward-to-government":
		t("PARLIAMENT_MEETING_DECISION_FORWARD_TO_GOVERNMENT"),
	"solve-differently":
		t("PARLIAMENT_MEETING_DECISION_SOLVE_DIFFERENTLY"),
	"draft-act-or-national-matter":
		t("PARLIAMENT_MEETING_DECISION_DRAFT_ACT_OR_NATIONAL_MATTER"),
}

var PARLIAMENT_DECISION_TEXTS = {
	"continue": t("PARLIAMENT_DECISION_CONTINUE"),
	"return": t("PARLIAMENT_DECISION_RETURN"),
	"reject": t("PARLIAMENT_DECISION_REJECT"),
	"forward": t("PARLIAMENT_DECISION_FORWARD"),
	"forward-to-government": t("PARLIAMENT_DECISION_FORWARD_TO_GOVERNMENT"),
	"solve-differently": t("PARLIAMENT_DECISION_SOLVE_DIFFERENTLY"),

	"draft-act-or-national-matter":
		t("PARLIAMENT_DECISION_DRAFT_ACT_OR_NATIONAL_MATTER"),
}

describe("InitiativesController", function() {
	require("root/test/web")()
	require("root/test/mitm")()
	require("root/test/db")()
	require("root/test/email")()
	require("root/test/fixtures").csrf()
	beforeEach(require("root/test/mitm").router)

	describe("GET /", function() {
		beforeEach(function() { this.author = usersDb.create(new ValidUser) })

		it("must include metadata tags", function*() {
			var res = yield this.request("/initiatives")
			res.statusCode.must.equal(200)

			var dom = parseHtml(res.body)
			var links = dom.head.querySelectorAll("link")
			var linksByType = _.indexBy(links, (el) => el.getAttribute("type"))

			var atomLink = linksByType[ATOM_TYPE]
			atomLink.rel.must.equal("alternate")
			atomLink.href.must.equal("/initiative-events.atom")
			atomLink.title.must.equal(t("ATOM_INITIATIVE_EVENTS_FEED_TITLE"))

			var metas = dom.head.querySelectorAll("meta")
			var metasByName = _.indexBy(metas, (el) => el.getAttribute("name"))
			var metasByProp = _.indexBy(metas, (el) => el.getAttribute("property"))

			metasByName["twitter:site"].content.must.equal("@" + TWITTER_NAME)
			metasByName["twitter:card"].content.must.equal("summary")

			metasByProp["og:title"].content.must.equal(t("initiatives_page.title"))
			var imageUrl = `${Config.url}/assets/rahvaalgatus-description.png`
			metasByProp["og:image"].content.must.equal(imageUrl)
		})

		describe("filters", function() {
			it("must show filters at default if all empty", function*() {
				var res = yield this.request("/initiatives?" + Qs.stringify({
					destination: "",
					phase: "",
					"published-on>": "",
					"published-on<": "",
					"signing-started-on>": "",
					"signing-started-on<": "",
					"last-signed-on>": "",
					"proceedings-started-on>": "",
					"proceedings-started-on<": "",
					"proceedings-ended-on>": "",
					"proceedings-ended-on<": "",
					"proceedings-handler": ""
				}))

				res.statusCode.must.equal(200)

				var dom = parseHtml(res.body)

				var form = dom.querySelector("#filters form")
				form.elements.destination.value.must.equal("")
				form.elements.phase.value.must.equal("")
				form.elements["published-on>"].value.must.equal("")
				form.elements["published-on<"].value.must.equal("")
				form.elements["signing-started-on>"].value.must.equal("")
				form.elements["signing-started-on<"].value.must.equal("")
				form.elements["last-signed-on>"].value.must.equal("")
				form.elements["proceedings-started-on>"].value.must.equal("")
				form.elements["proceedings-started-on<"].value.must.equal("")
				form.elements["proceedings-ended-on>"].value.must.equal("")
				form.elements["proceedings-ended-on<"].value.must.equal("")
				form.elements["proceedings-handler"].value.must.equal("")
				demand(form.querySelector(".reset-filters-button")).be.null()

				var table = dom.body.querySelector("#initiatives")
				var heading = table.tHead.querySelector("th .column-name")
				heading.textContent.trim().must.equal("Pealkiri")
				heading.href.must.startWith("/initiatives?")
				Qs.parse(Url.parse(heading.href).query).must.eql({order: "title"})
			})

			it("must show set filters and include them in sort buttons", function*() {
				var query = {
					destination: "parliament",
					phase: "sign",
					"published-on>": "2015-06-18",
					"published-on<": "2015-06-20",
					"signing-started-on>": "2015-06-22",
					"signing-started-on<": "2015-06-24",
					"last-signed-on>": "2015-05-12",
					"proceedings-started-on>": "2015-06-25",
					"proceedings-started-on<": "2015-06-27",
					"proceedings-ended-on>": "2015-06-28",
					"proceedings-ended-on<": "2015-06-30",
					"proceedings-handler": "local"
				}

				var res = yield this.request("/initiatives?" + Qs.stringify(query))
				res.statusCode.must.equal(200)

				var dom = parseHtml(res.body)
				var form = dom.querySelector("#filters form")
				form.elements.destination.value.must.equal("parliament")
				form.elements.phase.value.must.equal("sign")
				form.elements["published-on>"].value.must.equal("2015-06-18")
				form.elements["published-on<"].value.must.equal("2015-06-20")
				form.elements["signing-started-on>"].value.must.equal("2015-06-22")
				form.elements["signing-started-on<"].value.must.equal("2015-06-24")
				form.elements["last-signed-on>"].value.must.equal("2015-05-12")
				form.elements["proceedings-started-on>"].value.must.equal("2015-06-25")
				form.elements["proceedings-started-on<"].value.must.equal("2015-06-27")
				form.elements["proceedings-ended-on>"].value.must.equal("2015-06-28")
				form.elements["proceedings-ended-on<"].value.must.equal("2015-06-30")
				form.elements["proceedings-handler"].value.must.equal("local")
				form.querySelector(".reset-filters-button").must.exist()

				var table = dom.body.querySelector("#initiatives")
				var heading = table.tHead.querySelector("th .column-name")
				heading.textContent.trim().must.equal("Pealkiri")
				heading.href.must.startWith("/initiatives?")

				Qs.parse(Url.parse(heading.href).query).must.eql(_.defaults({
					order: "title"
				}, query))
			})

			// This internally uses a external=false value — easily ignorable being
			// falsy.
			it("must show reset filters button if filtering for non-external initiatives", function*() {
				var query = {external: "false"}
				var res = yield this.request("/initiatives?" + Qs.stringify(query))
				res.statusCode.must.equal(200)

				var dom = parseHtml(res.body)

				var filters = dom.querySelector("#filters")
				filters.querySelector(".reset-filters-button").must.exist()

				var table = dom.body.querySelector("#initiatives")
				var heading = table.tHead.querySelector("th .column-name")
				heading.textContent.trim().must.equal("Pealkiri")
				heading.href.must.startWith("/initiatives?")

				Qs.parse(Url.parse(heading.href).query).must.eql(_.defaults({
					order: "title"
				}, query))
			})

			it("must show set destination filter if filtering by all local governments", function*() {
				var res = yield this.request("/initiatives?" + Qs.stringify({
					destination: "local"
				}))

				res.statusCode.must.equal(200)

				var dom = parseHtml(res.body)
				var form = dom.querySelector("#filters form")
				form.elements.destination.value.must.equal("local")
			})

			it("must show set destination filter if filtering by a local government", function*() {
				var res = yield this.request("/initiatives?" + Qs.stringify({
					destination: "tallinn"
				}))

				res.statusCode.must.equal(200)

				var dom = parseHtml(res.body)
				var form = dom.querySelector("#filters form")
				form.elements.destination.value.must.equal("tallinn")
			})
		})

		it("must show initiatives in edit phase", function*() {
			var initiative = initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				phase: "edit",
				created_at: pseudoDateTime(),
				published_at: new Date,
				discussion_ends_at: DateFns.addSeconds(new Date, 1),
				author_name: "Freedom Organization"
			}))

			var res = yield this.request("/initiatives")
			res.statusCode.must.equal(200)

			var dom = parseHtml(res.body)
			var el = dom.querySelector(".initiative")
			el.getAttribute("data-id").must.equal(String(initiative.id))
			el.getAttribute("data-uuid").must.equal(initiative.uuid)
			el.querySelector("h3").textContent.must.equal(initiative.title)

			el.querySelector(".authors").textContent.must.equal(
				"Freedom Organization, " + this.author.name
			)
		})

		it("must not show duplicate author names", function*() {
			initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				phase: "edit",
				created_at: pseudoDateTime(),
				published_at: new Date,
				discussion_ends_at: DateFns.addSeconds(new Date, 1),
				author_name: this.author.name
			}))

			var res = yield this.request("/initiatives")
			res.statusCode.must.equal(200)

			var dom = parseHtml(res.body)
			var el = dom.body.querySelector("#initiatives .initiative")
			el.querySelector(".authors").textContent.must.equal(this.author.name)
		})

		it(`must not show coauthor name from another initiative`, function*() {
			initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				phase: "edit",
				published_at: new Date
			}))

			var other = initiativesDb.create(new ValidInitiative({
				user_id: this.author.id
			}))

			coauthorsDb.create(new ValidCoauthor({
				initiative: other,
				user: usersDb.create(new ValidUser),
				status: "accepted"
			}))

			var res = yield this.request("/initiatives")
			res.statusCode.must.equal(200)

			var dom = parseHtml(res.body)
			var el = dom.body.querySelector("#initiatives .initiative")
			el.querySelector(".authors").textContent.must.equal(this.author.name)
		})

		it("must not show accepted coauthor names", function*() {
			var initiative = initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				phase: "edit",
				published_at: new Date
			}))

			coauthorsDb.create(new ValidCoauthor({
				initiative: initiative,
				user: usersDb.create(new ValidUser),
				status: "accepted"
			}))

			var res = yield this.request("/initiatives")
			res.statusCode.must.equal(200)

			var dom = parseHtml(res.body)
			var el = dom.body.querySelector("#initiatives .initiative")
			el.querySelector(".authors").textContent.must.equal(this.author.name)
		})

		_.without(COAUTHOR_STATUSES, "accepted").forEach(function(status) {
			it(`must not show ${status} coauthor name`, function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "edit",
					published_at: new Date
				}))

				coauthorsDb.create(new ValidCoauthor({
					initiative: initiative,
					user: usersDb.create(new ValidUser),
					status: status
				}))

				var res = yield this.request("/initiatives")
				res.statusCode.must.equal(200)

				var dom = parseHtml(res.body)
				var el = dom.body.querySelector("#initiatives .initiative")
				el.querySelector(".authors").textContent.must.equal(this.author.name)
			})
		})

		it("must show initiatives in edit phase that have ended", function*() {
			var initiative = initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				destination: "parliament",
				published_at: new Date,
				discussion_ends_at: new Date
			}))

			var res = yield this.request("/initiatives")
			res.statusCode.must.equal(200)

			var dom = parseHtml(res.body)
			var els = dom.body.querySelectorAll("#initiatives .initiative")
			var ids = _.map(els, (el) => Number(el.getAttribute("data-id")))
			ids.must.eql([initiative.id])
		})

		it("must show archived initiatives in edit phase", function*() {
			var initiative = initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				phase: "edit",
				destination: "parliament",
				discussion_ends_at: DateFns.addSeconds(new Date, 1),
				published_at: new Date,
				archived_at: new Date
			}))

			var res = yield this.request("/initiatives")
			res.statusCode.must.equal(200)

			var dom = parseHtml(res.body)
			var els = dom.body.querySelectorAll("#initiatives .initiative")
			var ids = _.map(els, (el) => Number(el.getAttribute("data-id")))
			ids.must.eql([initiative.id])
		})

		it("must show initiatives in sign phase", function*() {
			var initiative = initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				phase: "sign",
				signing_started_at: pseudoDateTime(),
				signing_ends_at: DateFns.addDays(new Date, 1)
			}))

			citizenosSignaturesDb.create(_.times(5, () => (
				new ValidCitizenosSignature({initiative_uuid: initiative.uuid})
			)))

			signaturesDb.create(_.times(3, () => new ValidSignature({
				initiative_uuid: initiative.uuid
			})))

			var res = yield this.request("/initiatives")
			res.statusCode.must.equal(200)

			var dom = parseHtml(res.body)
			var els = dom.body.querySelectorAll("#initiatives .initiative")
			var ids = _.map(els, (el) => Number(el.getAttribute("data-id")))
			ids.must.eql([initiative.id])

			els[0].querySelector(".signature-progress").textContent.must.equal(
				t("initiatives_page.table.signature_count.progress", {
					signatureCount: 8
				})
			)
		})

		it("must show initiatives in sign phase that failed", function*() {
			var initiative = initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				phase: "sign",
				signing_ends_at: new Date
			}))

			var res = yield this.request("/initiatives")
			res.statusCode.must.equal(200)

			var dom = parseHtml(res.body)
			var els = dom.body.querySelectorAll("#initiatives .initiative")
			var ids = _.map(els, (el) => Number(el.getAttribute("data-id")))
			ids.must.eql([initiative.id])
		})

		it("must show initiatives in sign phase that succeeded", function*() {
			var initiative = initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				phase: "sign",
				signing_ends_at: new Date
			}))

			signaturesDb.create(_.times(Config.votesRequired / 2, () => (
				new ValidSignature({initiative_uuid: initiative.uuid})
			)))

			citizenosSignaturesDb.create(_.times(
				Config.votesRequired / 2,
				() => new ValidCitizenosSignature({initiative_uuid: initiative.uuid})
			))

			var res = yield this.request("/initiatives")
			res.statusCode.must.equal(200)

			var dom = parseHtml(res.body)
			var els = dom.body.querySelectorAll("#initiatives .initiative")
			var ids = _.map(els, (el) => Number(el.getAttribute("data-id")))
			ids.must.eql([initiative.id])
		})

		it("must show initiatives in parliament", function*() {
			var initiative = initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				phase: "parliament",
				sent_to_parliament_at: pseudoDateTime()
			}))

			var res = yield this.request("/initiatives")
			res.statusCode.must.equal(200)
			res.body.must.include(initiative.uuid)

			var dom = parseHtml(res.body)
			var els = dom.body.querySelectorAll("#initiatives .initiative")
			var ids = _.map(els, (el) => Number(el.getAttribute("data-id")))
			ids.must.eql([initiative.id])
		})

		it("must show initiatives in parliament received by parliament",
			function*() {
			var initiative = initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				phase: "parliament",
				sent_to_parliament_at: pseudoDateTime(),
				received_by_parliament_at: pseudoDateTime()
			}))

			var res = yield this.request("/initiatives")
			res.statusCode.must.equal(200)

			var dom = parseHtml(res.body)
			var els = dom.body.querySelectorAll("#initiatives .initiative")
			var ids = _.map(els, (el) => Number(el.getAttribute("data-id")))
			ids.must.eql([initiative.id])
		})

		it("must show external initiatives in parliament", function*() {
			var initiative = initiativesDb.create(new ValidInitiative({
				phase: "parliament",
				received_by_parliament_at: pseudoDateTime(),
				external: true
			}))

			var res = yield this.request("/initiatives")
			res.statusCode.must.equal(200)
			res.body.must.include(initiative.uuid)

			var dom = parseHtml(res.body)
			var els = dom.body.querySelectorAll("#initiatives .initiative")
			var ids = _.map(els, (el) => Number(el.getAttribute("data-id")))
			ids.must.eql([initiative.id])
		})

		it("must show initiatives in government", function*() {
			var initiative = initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				phase: "government",
				sent_to_government_at: pseudoDateTime()
			}))

			var res = yield this.request("/initiatives")
			res.statusCode.must.equal(200)

			var dom = parseHtml(res.body)
			var els = dom.body.querySelectorAll("#initiatives .initiative")
			var ids = _.map(els, (el) => Number(el.getAttribute("data-id")))
			ids.must.eql([initiative.id])
		})

		it("must show external initiatives in government", function*() {
			var initiative = initiativesDb.create(new ValidInitiative({
				phase: "government",
				external: true
			}))

			var res = yield this.request("/initiatives")
			res.statusCode.must.equal(200)

			var dom = parseHtml(res.body)
			var els = dom.body.querySelectorAll("#initiatives .initiative")
			var ids = _.map(els, (el) => Number(el.getAttribute("data-id")))
			ids.must.eql([initiative.id])
		})

		it("must show initiatives in done phase", function*() {
			var initiative = initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				phase: "done",
				finished_in_parliament_at: pseudoDateTime(),
				finished_in_government_at: pseudoDateTime()
			}))

			var res = yield this.request("/initiatives")
			res.statusCode.must.equal(200)
			res.body.must.include(initiative.uuid)

			var dom = parseHtml(res.body)
			var els = dom.body.querySelectorAll("#initiatives .initiative")
			var ids = _.map(els, (el) => Number(el.getAttribute("data-id")))
			ids.must.eql([initiative.id])
		})

		it("must show initiatives in done phase that never went to government",
			function*() {
			var initiative = initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				phase: "done",
				finished_in_parliament_at: pseudoDateTime()
			}))

			var res = yield this.request("/initiatives")
			res.statusCode.must.equal(200)
			res.body.must.include(initiative.uuid)

			var dom = parseHtml(res.body)
			var els = dom.body.querySelectorAll("#initiatives .initiative")
			var ids = _.map(els, (el) => Number(el.getAttribute("data-id")))
			ids.must.eql([initiative.id])
		})

		it("must show external initiatives in done phase", function*() {
			var initiative = initiativesDb.create(new ValidInitiative({
				phase: "done",
				external: true
			}))

			var res = yield this.request("/initiatives")
			res.statusCode.must.equal(200)

			var dom = parseHtml(res.body)
			var els = dom.body.querySelectorAll("#initiatives .initiative")
			var ids = _.map(els, (el) => Number(el.getAttribute("data-id")))
			ids.must.eql([initiative.id])
		})

		it("must show archived external initiatives in done phase", function*() {
			var initiative = initiativesDb.create(new ValidInitiative({
				phase: "done",
				external: true,
				archived_at: new Date
			}))

			var res = yield this.request("/initiatives")
			res.statusCode.must.equal(200)

			var dom = parseHtml(res.body)
			var els = dom.body.querySelectorAll("#initiatives .initiative")
			var ids = _.map(els, (el) => Number(el.getAttribute("data-id")))
			ids.must.eql([initiative.id])
		})

		it("must show initiatives in edit phase with no destination",
			function*() {
			var initiative = initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				phase: "edit",
				destination: null,
				published_at: new Date
			}))

			var res = yield this.request("/initiatives")
			res.statusCode.must.equal(200)

			var dom = parseHtml(res.body)
			var els = dom.body.querySelectorAll("#initiatives .initiative")
			var ids = _.map(els, (el) => Number(el.getAttribute("data-id")))
			ids.must.eql([initiative.id])
		})

		;["parliament", "muhu-vald"].forEach(function(dest) {
			var phases = dest == "parliament" ? PHASES : LOCAL_PHASES
			phases.forEach(function(phase) {
				it(`must show initiatives in ${phase} phase destined for ${dest}`,
					function*() {
					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: this.author.id,
						phase,
						destination: dest,
						published_at: new Date
					}))

					var res = yield this.request("/initiatives")
					res.statusCode.must.equal(200)

					var dom = parseHtml(res.body)
					var els = dom.body.querySelectorAll("#initiatives .initiative")
					var ids = _.map(els, (el) => Number(el.getAttribute("data-id")))
					ids.must.eql([initiative.id])
				})
			})
		})

		it("must not show unpublished initiatives", function*() {
			initiativesDb.create(new ValidInitiative({user_id: this.author.id}))
			var res = yield this.request("/initiatives")
			res.statusCode.must.equal(200)
			var dom = parseHtml(res.body)
			dom.body.querySelectorAll("#initiatives .initiative").length.must.be(0)
		})

		it("must show initiatives by tag if given", function*() {
			var initiative = initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				published_at: new Date,
				tags: ["foo", "uuseakus", "bar"]
			}))

			initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				published_at: new Date
			}))

			var res = yield this.request("/initiatives?category=uuseakus")
			var dom = parseHtml(res.body)
			var els = dom.body.querySelectorAll("#initiatives .initiative")
			var ids = _.map(els, (el) => Number(el.getAttribute("data-id")))
			ids.must.eql([initiative.id])
		})

		testFilters(function* request(query, expected) {
			var res = yield this.request(
				"/initiatives?" + Qs.stringify(_.defaults({order: "id"}, query))
			)

			res.statusCode.must.equal(200)
			res.headers["content-type"].must.equal(HTML_TYPE)

			var dom = parseHtml(res.body)
			var els = dom.body.querySelectorAll("#initiatives .initiative")
			var ids = _.map(els, (el) => Number(el.getAttribute("data-id")))
			ids.must.eql(expected.map((initiative) => initiative.id))
		})

		describe("given order", function() {
			_.each({
				"title": _.id,
				"+title": _.id,
				"-title": _.reverse,
			}, (sort, order) => it(`must sort by ${order}`, function*() {
				var initiatives = initiativesDb.create([
					new ValidInitiative({
						user_id: this.author.id,
						phase: "edit",
						published_at: new Date,
						title: "B"
					}),

					new ValidInitiative({
						user_id: this.author.id,
						phase: "sign",
						title: "C"
					}),

					new ValidInitiative({
						user_id: this.author.id,
						phase: "parliament",
						title: "A"
					})
				])

				var res = yield this.request("/initiatives?" + Qs.stringify({order}))
				res.statusCode.must.equal(200)

				var dom = parseHtml(res.body)
				var els = dom.body.querySelectorAll("#initiatives .initiative")
				var ids = _.map(els, (el) => Number(el.getAttribute("data-id")))
				ids.must.eql(sort(_.map(_.sortBy(initiatives, "title"), "id")))
			}))

			_.each({
				"author": _.id,
				"+author": _.id,
				"-author": _.reverse,
			}, (sort, order) => it(`must sort by ${order}`, function*() {
				var a = usersDb.create(new ValidUser({name: "A"}))
				var b = usersDb.create(new ValidUser({name: "B"}))
				var c = usersDb.create(new ValidUser({name: "C"}))

				var initiatives = initiativesDb.create([
					new ValidInitiative({user_id: b.id, phase: "sign"}),
					new ValidInitiative({user_id: c.id, phase: "sign"}),
					new ValidInitiative({user_id: a.id, phase: "sign"})
				])

				var res = yield this.request("/initiatives?" + Qs.stringify({order}))
				res.statusCode.must.equal(200)

				var dom = parseHtml(res.body)
				var els = dom.body.querySelectorAll("#initiatives .initiative")
				var ids = _.map(els, (el) => Number(el.getAttribute("data-id")))
				ids.must.eql(sort(_.map(_.sortBy(initiatives, "user_id"), "id")))
			}))

			_.each({
				"phase": _.id,
				"+phase": _.id,
				"-phase": _.reverse,
			}, (sort, order) => it(`must sort by ${order}`, function*() {
				var initiatives = _.reverse(initiativesDb.create(PHASES.map((phase) =>
					new ValidInitiative({
						user_id: this.author.id,
						phase,
						published_at: new Date
					})
				).reverse()))

				var res = yield this.request("/initiatives?" + Qs.stringify({order}))
				res.statusCode.must.equal(200)

				var dom = parseHtml(res.body)
				var els = dom.body.querySelectorAll("#initiatives .initiative")
				var ids = _.map(els, (el) => Number(el.getAttribute("data-id")))
				ids.must.eql(sort(_.map(initiatives, "id")))
			}))

			_.each({
				"destination": _.id,
				"+destination": _.id,
				"-destination": _.reverse,
			}, (sort, order) => it(`must sort by ${order}`, function*() {
				var initiatives = initiativesDb.create([
					new ValidInitiative({
						user_id: this.author.id,
						phase: "sign",
						destination: "tallinn"
					}),

					new ValidInitiative({
						user_id: this.author.id,
						phase: "sign",
						destination: "anija-vald"
					}),

					new ValidInitiative({
						user_id: this.author.id,
						phase: "sign",
						destination: "setomaa-vald"
					})
				])

				var res = yield this.request("/initiatives?" + Qs.stringify({order}))
				res.statusCode.must.equal(200)

				var dom = parseHtml(res.body)
				var els = dom.body.querySelectorAll("#initiatives .initiative")
				var ids = _.map(els, (el) => Number(el.getAttribute("data-id")))
				ids.must.eql(sort(_.map(_.sortBy(initiatives, "destination"), "id")))
			}))

			it(`must sort no destination and parliament first`, function*() {
				var initiatives = initiativesDb.create([
					new ValidInitiative({
						user_id: this.author.id,
						phase: "edit",
						published_at: new Date
					}),

					new ValidInitiative({
						user_id: this.author.id,
						phase: "sign",
						destination: "parliament"
					}),

					new ValidInitiative({
						user_id: this.author.id,
						phase: "sign",
						destination: "anija-vald"
					})
				])

				var res = yield this.request("/initiatives?order=destination")
				res.statusCode.must.equal(200)

				var dom = parseHtml(res.body)
				var els = dom.body.querySelectorAll("#initiatives .initiative")
				var ids = _.map(els, (el) => Number(el.getAttribute("data-id")))
				ids.must.eql(_.map(initiatives, "id"))
			})

			_.each({
				"published-at": _.id,
				"+published-at": _.id,
				"-published-at": _.reverse,
			}, (sort, order) => it(`must sort by ${order}`, function*() {
				var initiatives = initiativesDb.create([
					new ValidInitiative({
						user_id: this.author.id,
						published_at: DateFns.addDays(new Date, -2),
					}),

					new ValidInitiative({
						user_id: this.author.id,
						published_at: DateFns.addDays(new Date, -1),
					}),

					new ValidInitiative({
						user_id: this.author.id,
						published_at: DateFns.addDays(new Date, -3)
					})
				])

				var res = yield this.request("/initiatives?" + Qs.stringify({order}))
				res.statusCode.must.equal(200)

				var dom = parseHtml(res.body)
				var els = dom.body.querySelectorAll("#initiatives .initiative")
				var ids = _.map(els, (el) => Number(el.getAttribute("data-id")))
				ids.must.eql(sort(_.map(_.sortBy(initiatives, "published_at"), "id")))
			}))

			_.each({
				"signing-started-at": _.id,
				"+signing-started-at": _.id,
				"-signing-started-at": _.reverse,
			}, (sort, order) => it(`must sort by ${order}`, function*() {
				var initiatives = initiativesDb.create([
					new ValidInitiative({
						user_id: this.author.id,
						phase: "sign",
						signing_started_at: DateFns.addDays(new Date, -2),
					}),

					new ValidInitiative({
						user_id: this.author.id,
						phase: "sign",
						signing_started_at: DateFns.addDays(new Date, -1),
					}),

					new ValidInitiative({
						user_id: this.author.id,
						phase: "sign",
						signing_started_at: DateFns.addDays(new Date, -3)
					})
				])

				var res = yield this.request("/initiatives?" + Qs.stringify({order}))
				res.statusCode.must.equal(200)

				var dom = parseHtml(res.body)
				var els = dom.body.querySelectorAll("#initiatives .initiative")

				_.map(els, (el) => Number(el.getAttribute("data-id"))).must.eql(
					sort(_.map(_.sortBy(initiatives, "signing_started_at"), "id"))
				)
			}))

			it(`must sort by initiatives in edit before others when sorting by signing-started-at`, function*() {
				var inEditA = initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "edit",
					published_at: DateFns.addDays(new Date, -1)
				}))

				var inSign = initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "sign",
					signing_started_at: DateFns.addDays(new Date, -2),
				}))

				var inEditB = initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "edit",
					published_at: DateFns.addDays(new Date, -3)
				}))

				var res = yield this.request("/initiatives?order=signing-started-at")
				res.statusCode.must.equal(200)

				var dom = parseHtml(res.body)
				var els = dom.body.querySelectorAll("#initiatives .initiative")

				_.map(els, (el) => Number(el.getAttribute("data-id"))).must.eql([
					inEditB.id,
					inEditA.id,
					inSign.id
				])
			})

			_.each({
				"signing-ended-at": _.id,
				"+signing-ended-at": _.id,
				"-signing-ended-at": _.reverse,
			}, (sort, order) => it(`must sort by ${order}`, function*() {
				var initiatives = initiativesDb.create([
					new ValidInitiative({
						user_id: this.author.id,
						phase: "sign",
						signing_ends_at: DateFns.addDays(new Date, -2),
					}),

					new ValidInitiative({
						user_id: this.author.id,
						phase: "sign",
						signing_ends_at: DateFns.addDays(new Date, -1),
					}),

					new ValidInitiative({
						user_id: this.author.id,
						phase: "sign",
						signing_ends_at: DateFns.addDays(new Date, -3)
					})
				])

				var res = yield this.request("/initiatives?" + Qs.stringify({order}))
				res.statusCode.must.equal(200)

				var dom = parseHtml(res.body)
				var els = dom.body.querySelectorAll("#initiatives .initiative")

				_.map(els, (el) => Number(el.getAttribute("data-id"))).must.eql(
					sort(_.map(_.sortBy(initiatives, "signing_ends_at"), "id"))
				)
			}))

			it(`must sort by initiatives in edit before others when sorting by signing-ended-at`, function*() {
				var inEditA = initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "edit",
					published_at: DateFns.addDays(new Date, -1)
				}))

				var inSign = initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "sign",
					signing_ends_at: DateFns.addDays(new Date, -2),
				}))

				var inEditB = initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "edit",
					published_at: DateFns.addDays(new Date, -3)
				}))

				var res = yield this.request("/initiatives?order=signing-ended-at")
				res.statusCode.must.equal(200)

				var dom = parseHtml(res.body)
				var els = dom.body.querySelectorAll("#initiatives .initiative")

				_.map(els, (el) => Number(el.getAttribute("data-id"))).must.eql([
					inEditB.id,
					inEditA.id,
					inSign.id
				])
			})

			_.each({
				"signature-count": _.id,
				"+signature-count": _.id,
				"-signature-count": _.reverse,
			}, (sort, order) => it(`must sort by ${order}`, function*() {
				var initiatives = _.times(5, (i) => {
					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: this.author.id,
						phase: "sign"
					}))

					// Create signatures in descending order to ensure their default
					// order doesn't match initiative creation order.
					signaturesDb.create(_.times(4 - i, () => new ValidSignature({
						initiative_uuid: initiative.uuid
					})))

					return initiative
				})

				var res = yield this.request("/initiatives?" + Qs.stringify({order}))
				res.statusCode.must.equal(200)

				var dom = parseHtml(res.body)
				var els = dom.body.querySelectorAll("#initiatives .initiative")

				_.map(els, (el) => Number(el.getAttribute("data-id"))).must.eql(
					sort(_.map(initiatives, "id").reverse())
				)
			}))

			_.each({
				"last-signed-at": _.id,
				"+last-signed-at": _.id,
				"-last-signed-at": _.reverse,
			}, (sort, order) => it(`must sort by ${order}`, function*() {
				var initiatives = _.times(5, (i) => {
					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: this.author.id,
						phase: "sign"
					}))

					// Create signatures in descending order to ensure their default
					// order doesn't match initiative creation order.
					signaturesDb.create(_.times(4 - i, () => new ValidSignature({
						initiative_uuid: initiative.uuid,
						created_at: DateFns.addMinutes(new Date, -i * 2)
					})))

					return initiative
				})

				var res = yield this.request("/initiatives?" + Qs.stringify({order}))
				res.statusCode.must.equal(200)

				var dom = parseHtml(res.body)
				var els = dom.body.querySelectorAll("#initiatives .initiative")

				_.map(els, (el) => Number(el.getAttribute("data-id"))).must.eql(
					sort(_.map(initiatives, "id").reverse())
				)
			}))

			_.each({
				"proceedings-started-at": _.id,
				"+proceedings-started-at": _.id,
				"-proceedings-started-at": _.reverse,
			}, (sort, order) => it(`must sort by ${order}`, function*() {
				var initiatives = initiativesDb.create([
					new ValidInitiative({
						user_id: this.author.id,
						phase: "sign",
						accepted_by_parliament_at: DateFns.addDays(new Date, -2),
					}),

					new ValidInitiative({
						user_id: this.author.id,
						phase: "sign",
						accepted_by_parliament_at: DateFns.addDays(new Date, -1),
					}),

					new ValidInitiative({
						user_id: this.author.id,
						phase: "sign",
						accepted_by_parliament_at: DateFns.addDays(new Date, -3)
					}),

					new ValidInitiative({
						user_id: this.author.id,
						destination: "tallinn",
						phase: "sign",
						accepted_by_government_at: DateFns.addDays(new Date, -6),
					}),

					new ValidInitiative({
						user_id: this.author.id,
						destination: "tallinn",
						phase: "sign",
						accepted_by_government_at: DateFns.addDays(new Date, -5),
					}),

					new ValidInitiative({
						user_id: this.author.id,
						destination: "tallinn",
						phase: "sign",
						accepted_by_government_at: DateFns.addDays(new Date, -7)
					})
				])

				var res = yield this.request("/initiatives?" + Qs.stringify({order}))
				res.statusCode.must.equal(200)

				var dom = parseHtml(res.body)
				var els = dom.body.querySelectorAll("#initiatives .initiative")

				_.map(els, (el) => Number(el.getAttribute("data-id"))).must.eql(
					sort(_.map(_.sortBy(initiatives, (initiative) => (
						initiative.accepted_by_parliament_at ||
						initiative.accepted_by_government_at
					)), "id"))
				)
			}))

			it(`must sort based on accepted by parliament if in government when sorting by proceedings-started-at`, function*() {
				var initiatives = initiativesDb.create([
					new ValidInitiative({
						user_id: this.author.id,
						phase: "government",
						accepted_by_parliament_at: DateFns.addDays(new Date, -4),
						accepted_by_government_at: DateFns.addDays(new Date, -3)
					}),

					new ValidInitiative({
						user_id: this.author.id,
						phase: "government",
						accepted_by_parliament_at: DateFns.addDays(new Date, -3),
						accepted_by_government_at: DateFns.addDays(new Date, -2)
					}),

					new ValidInitiative({
						user_id: this.author.id,
						phase: "government",
						accepted_by_parliament_at: DateFns.addDays(new Date, -5),
						accepted_by_government_at: DateFns.addDays(new Date, -1)
					})
				])

				var res = yield this.request(
					"/initiatives?order=proceedings-started-at"
				)

				res.statusCode.must.equal(200)

				var dom = parseHtml(res.body)
				var els = dom.body.querySelectorAll("#initiatives .initiative")

				_.map(els, (el) => Number(el.getAttribute("data-id"))).must.eql(
					_.map(_.sortBy(initiatives, "accepted_by_parliament_at"), "id")
				)
			})

			_.each({
				"proceedings-ended-at": _.id,
				"+proceedings-ended-at": _.id,
				"-proceedings-ended-at": _.reverse,
			}, (sort, order) => it(`must sort by ${order}`, function*() {
				var initiatives = initiativesDb.create([
					new ValidInitiative({
						user_id: this.author.id,
						phase: "sign",
						finished_in_parliament_at: DateFns.addDays(new Date, -2),
					}),

					new ValidInitiative({
						user_id: this.author.id,
						phase: "sign",
						finished_in_parliament_at: DateFns.addDays(new Date, -1),
					}),

					new ValidInitiative({
						user_id: this.author.id,
						phase: "sign",
						finished_in_parliament_at: DateFns.addDays(new Date, -3)
					}),

					new ValidInitiative({
						user_id: this.author.id,
						destination: "tallinn",
						phase: "sign",
						finished_in_government_at: DateFns.addDays(new Date, -6),
					}),

					new ValidInitiative({
						user_id: this.author.id,
						destination: "tallinn",
						phase: "sign",
						finished_in_government_at: DateFns.addDays(new Date, -5),
					}),

					new ValidInitiative({
						user_id: this.author.id,
						destination: "tallinn",
						phase: "sign",
						finished_in_government_at: DateFns.addDays(new Date, -7)
					})
				])

				var res = yield this.request("/initiatives?" + Qs.stringify({order}))
				res.statusCode.must.equal(200)

				var dom = parseHtml(res.body)
				var els = dom.body.querySelectorAll("#initiatives .initiative")

				_.map(els, (el) => Number(el.getAttribute("data-id"))).must.eql(
					sort(_.map(_.sortBy(initiatives, (initiative) => (
						initiative.finished_in_parliament_at ||
						initiative.finished_in_government_at
					)), "id"))
				)
			}))

			it(`must sort based on finishing in government if also finished in parliament when sorting by proceedings-ended-at`, function*() {
				var initiatives = initiativesDb.create([
					new ValidInitiative({
						user_id: this.author.id,
						phase: "government",
						finished_in_parliament_at: DateFns.addDays(new Date, -7),
						finished_in_government_at: DateFns.addDays(new Date, -2)
					}),

					new ValidInitiative({
						user_id: this.author.id,
						phase: "government",
						finished_in_parliament_at: DateFns.addDays(new Date, -6),
						finished_in_government_at: DateFns.addDays(new Date, -1)
					}),

					new ValidInitiative({
						user_id: this.author.id,
						phase: "government",
						finished_in_parliament_at: DateFns.addDays(new Date, -5),
						finished_in_government_at: DateFns.addDays(new Date, -3)
					})
				])

				var res = yield this.request("/initiatives?order=proceedings-ended-at")
				res.statusCode.must.equal(200)

				var dom = parseHtml(res.body)
				var els = dom.body.querySelectorAll("#initiatives .initiative")

				_.map(els, (el) => Number(el.getAttribute("data-id"))).must.eql(
					_.map(_.sortBy(initiatives, "finished_in_government_at"), "id")
				)
			})

			_.each({
				"proceedings-handler": _.id,
				"+proceedings-handler": _.id,
				"-proceedings-handler": _.reverse,
			}, (sort, order) => it(`must sort by ${order}`, function*() {
				var initiatives = initiativesDb.create([
					new ValidInitiative({
						user_id: this.author.id,
						phase: "parliament",
						parliament_committee: "Majanduskomisjon"
					}),

					new ValidInitiative({
						user_id: this.author.id,
						phase: "parliament",
						parliament_committee: "Sotsiaalkomisjon"
					}),

					new ValidInitiative({
						user_id: this.author.id,
						destination: "tallinn",
						phase: "government"
					})
				])

				var res = yield this.request("/initiatives?" + Qs.stringify({order}))
				res.statusCode.must.equal(200)

				var dom = parseHtml(res.body)
				var els = dom.body.querySelectorAll("#initiatives .initiative")

				_.map(els, (el) => Number(el.getAttribute("data-id"))).must.eql(
					sort(_.map(_.sortBy(initiatives, (initiative) => (
						initiative.parliament_committee ||
						initiative.destination
					)), "id"))
				)
			}))
		})
	})

	function testFilters(request) { describe("as filterable", function() {
		describe("given id", function() {
			it("must filter initiatives by id", function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					published_at: new Date
				}))

				initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					published_at: new Date
				}))

				yield request.call(this, {id: initiative.id}, [initiative])
			})

			it("must filter initiatives by ids", function*() {
				var a = initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					published_at: new Date
				}))

				initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					published_at: new Date
				}))

				var b = initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					published_at: new Date
				}))

				yield request.call(this, {id: [a.id, b.id]}, [a, b])
			})
		})

		describe("given phase", function() {
			it("must respond with no initiatives given invalid phase", function*() {
				initiativesDb.create(PHASES.map((phase) => new ValidInitiative({
					user_id: this.author.id,
					destination: "parliament",
					published_at: new Date,
					phase
				})))

				yield request.call(this, {phase: "foo"}, [])
			})

			PHASES.forEach(function(phase, i) {
				it(`must respond with ${phase} initiatives if requested`, function*() {
					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: this.author.id,
						destination: "parliament",
						published_at: new Date,
						phase
					}))

					initiativesDb.create(new ValidInitiative({
						user_id: this.author.id,
						published_at: new Date,
						phase: PHASES[(i + 1) % PHASES.length]
					}))

					yield request.call(this, {phase}, [initiative])
				})
			})

			it("must respond with multiple selected phases", function*() {
				var initiatives = initiativesDb.create(PHASES.map((phase) => (
					new ValidInitiative({
						user_id: this.author.id,
						destination: "parliament",
						published_at: new Date,
						phase
					})
				)))

				yield request.call(this, {
					phase: [initiatives[0].phase, initiatives[2].phase]
				}, [initiatives[0], initiatives[2]])
			})
		})

		describe("given destination", function() {
			it("must return no initiatives given invalid destination", function*() {
				createInitiativesForAllDestinations(this.author)
				yield request.call(this, {destination: "foo"}, [])
			})

			it("must return no initiatives given Object.prototype destination",
				function*() {
				createInitiativesForAllDestinations(this.author)
				yield request.call(this, {destination: "hasOwnProperty"}, [])
			})

			it("must filter initiatives destined for parliament", function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "sign",
					destination: "parliament"
				}))

				initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "edit",
					destination: null,
					published_at: new Date
				}))

				initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "sign",
					destination: "muhu-vald"
				}))

				yield request.call(this, {destination: "parliament"}, [initiative])
			})

			Object.keys(LOCAL_GOVERNMENTS).forEach(function(dest) {
				it(`must filter initiatives destined for ${dest}`, function*() {
					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: this.author.id,
						phase: "sign",
						destination: dest
					}))

					initiativesDb.create(new ValidInitiative({
						user_id: this.author.id,
						phase: "edit",
						destination: null,
						published_at: new Date
					}))

					initiativesDb.create(new ValidInitiative({
						user_id: this.author.id,
						phase: "sign",
						destination: "parliament"
					}))

					yield request.call(this, {destination: dest}, [initiative])
				})
			})

			it("must filter initiatives destined for multiple places", function*() {
				initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "sign",
					destination: "parliament"
				}))

				var a = initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "sign",
					destination: "muhu-vald"
				}))

				var b = initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "sign",
					destination: "tallinn"
				}))

				initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "sign",
					destination: "pärnu-linn"
				}))

				yield request.call(this, {
					destination: ["muhu-vald", "tallinn"]
				}, [a, b])
			})

			it("must filter initiatives destined local", function*() {
				initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "sign",
					destination: "parliament"
				}))

				var a = initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "sign",
					destination: "muhu-vald"
				}))

				var b = initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "sign",
					destination: "tallinn"
				}))

				initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "edit",
					destination: null,
					published_at: new Date
				}))

				yield request.call(this, {destination: "local"}, [a, b])
			})

			it("must filter initiatives destined local and parliament",
				function*() {
				var a = initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "sign",
					destination: "parliament"
				}))

				var b = initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "sign",
					destination: "muhu-vald"
				}))

				var c = initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "sign",
					destination: "tallinn"
				}))

				initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "edit",
					destination: null,
					published_at: new Date
				}))

				yield request.call(this, {
					destination: ["local", "parliament"]
				}, [a, b, c])
			})
		})

		describe("given for", function() {
			it("must be an alias for destination", function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "sign",
					destination: "parliament"
				}))

				initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "sign",
					destination: "muhu-vald"
				}))

				yield request.call(this, {destination: "parliament"}, [initiative])
			})
		})

		describe("given published-on", function() {
			it("must include initiatives published on and after date", function*() {
				initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,

					published_at: DateFns.addSeconds(
						DateFns.addDays(DateFns.startOfDay(new Date), -1),
						-1
					)
				}))

				var initiatives = initiativesDb.create([
					new ValidInitiative({
						user_id: this.author.id,
						published_at: DateFns.addDays(DateFns.startOfDay(new Date), -1)
					}),

					new ValidInitiative({
						user_id: this.author.id,
						published_at: DateFns.startOfDay(new Date)
					})
				])

				yield request.call(this, {
					"published-on>": formatIsoDate(DateFns.addDays(new Date, -1))
				}, initiatives)
			})

			it("must include initiatives published between given dates", function*() {
				initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,

					published_at: DateFns.addSeconds(
						DateFns.addDays(DateFns.startOfDay(new Date), -2),
						-1
					)
				}))

				var initiatives = initiativesDb.create([
					new ValidInitiative({
						user_id: this.author.id,
						published_at: DateFns.addDays(DateFns.startOfDay(new Date), -2)
					}),

					new ValidInitiative({
						user_id: this.author.id,
						published_at: DateFns.addSeconds(DateFns.startOfDay(new Date), -1)
					})
				])

				initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					published_at: DateFns.startOfDay(new Date)
				}))

				yield request.call(this, {
					"published-on>": formatIsoDate(DateFns.addDays(new Date, -2)),
					"published-on<": formatIsoDate(DateFns.addDays(new Date, -1))
				}, initiatives)
			})

			it("must include initiatives published on and before date", function*() {
				var initiatives = initiativesDb.create([
					new ValidInitiative({
						user_id: this.author.id,
						published_at: DateFns.addDays(DateFns.startOfDay(new Date), -2)
					}),

					new ValidInitiative({
						user_id: this.author.id,
						published_at: DateFns.addSeconds(DateFns.startOfDay(new Date), -1)
					})
				])

				initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					published_at: DateFns.startOfDay(new Date)
				}))

				yield request.call(this, {
					"published-on<": formatIsoDate(DateFns.addDays(new Date, -1))
				}, initiatives)
			})
		})

		describe("given signing-started-on", function() {
			it("must include initiatives where signing started on and after date", function*() {
				initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "sign",

					signing_started_at: DateFns.addSeconds(
						DateFns.addDays(DateFns.startOfDay(new Date), -1),
						-1
					)
				}))

				var initiatives = initiativesDb.create([
					new ValidInitiative({
						user_id: this.author.id,
						phase: "sign",

						signing_started_at:
							DateFns.addDays(DateFns.startOfDay(new Date), -1)
					}),

					new ValidInitiative({
						user_id: this.author.id,
						phase: "sign",
						signing_started_at: DateFns.startOfDay(new Date)
					})
				])

				yield request.call(this, {
					"signing-started-on>": formatIsoDate(DateFns.addDays(new Date, -1))
				}, initiatives)
			})

			it("must include initiatives where signing started on and before date", function*() {
				var initiatives = initiativesDb.create([
					new ValidInitiative({
						user_id: this.author.id,
						phase: "sign",

						signing_started_at:
							DateFns.addDays(DateFns.startOfDay(new Date), -2)
					}),

					new ValidInitiative({
						user_id: this.author.id,
						phase: "sign",

						signing_started_at:
							DateFns.addSeconds(DateFns.startOfDay(new Date), -1)
					})
				])

				initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "sign",
					signing_started_at: DateFns.startOfDay(new Date)
				}))

				yield request.call(this, {
					"signing-started-on<": formatIsoDate(DateFns.addDays(new Date, -1))
				}, initiatives)
			})
		})

		describe("given signing-ended-on", function() {
			it("must include initiatives where signing ended on and after date", function*() {
				initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "sign",

					signing_ends_at: DateFns.addSeconds(
						DateFns.addDays(DateFns.startOfDay(new Date), -1),
						-1
					)
				}))

				var initiatives = initiativesDb.create([
					new ValidInitiative({
						user_id: this.author.id,
						phase: "sign",

						signing_ends_at:
							DateFns.addDays(DateFns.startOfDay(new Date), -1)
					}),

					new ValidInitiative({
						user_id: this.author.id,
						phase: "sign",
						signing_ends_at: DateFns.startOfDay(new Date)
					})
				])

				yield request.call(this, {
					"signing-ended-on>": formatIsoDate(DateFns.addDays(new Date, -1))
				}, initiatives)
			})

			it("must include initiatives where signing ended on and before date", function*() {
				var initiatives = initiativesDb.create([
					new ValidInitiative({
						user_id: this.author.id,
						phase: "sign",

						signing_ends_at:
							DateFns.addDays(DateFns.startOfDay(new Date), -2)
					}),

					new ValidInitiative({
						user_id: this.author.id,
						phase: "sign",

						signing_ends_at:
							DateFns.addSeconds(DateFns.startOfDay(new Date), -1)
					})
				])

				initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "sign",
					signing_ends_at: DateFns.startOfDay(new Date)
				}))

				yield request.call(this, {
					"signing-ended-on<": formatIsoDate(DateFns.addDays(new Date, -1))
				}, initiatives)
			})
		})

		describe("given signing-ends-at", function() {
			it("must include initiatives where signing ends at and after time",
				function*() {
				var now = new Date

				var initiatives = initiativesDb.create([
					new ValidInitiative({
						user_id: this.author.id,
						signing_ends_at: DateFns.addSeconds(now, -1),
						phase: "sign"
					}),

					new ValidInitiative({
						user_id: this.author.id,
						signing_ends_at: now,
						phase: "sign"
					}),

					new ValidInitiative({
						user_id: this.author.id,
						signing_ends_at: DateFns.addSeconds(now, 1),
						phase: "sign"
					})
				])

				yield request.call(this, {
					"signing-ends-at>": now.toJSON()
				}, initiatives.slice(1))
			})

			it("must include initiatives where signing ends at and before time",
				function*() {
				var now = new Date

				var initiatives = initiativesDb.create([
					new ValidInitiative({
						user_id: this.author.id,
						signing_ends_at: DateFns.addSeconds(now, -1),
						phase: "sign"
					}),

					new ValidInitiative({
						user_id: this.author.id,
						signing_ends_at: now,
						phase: "sign"
					}),

					new ValidInitiative({
						user_id: this.author.id,
						signing_ends_at: DateFns.addSeconds(now, 1),
						phase: "sign"
					})
				])

				yield request.call(this, {
					"signing-ends-at<": now.toJSON()
				}, initiatives.slice(0, 2))
			})
		})

		describe("given signingEndsAt", function() {
			it("must be an alias for signing-ends-at", function*() {
				var now = new Date

				var initiatives = initiativesDb.create([
					new ValidInitiative({
						user_id: this.author.id,
						signing_ends_at: DateFns.addSeconds(now, -1),
						phase: "sign"
					}),

					new ValidInitiative({
						user_id: this.author.id,
						signing_ends_at: now,
						phase: "sign"
					}),

					new ValidInitiative({
						user_id: this.author.id,
						signing_ends_at: DateFns.addSeconds(now, 1),
						phase: "sign"
					})
				])

				yield request.call(this, {
					"signingEndsAt>": now.toJSON()
				}, initiatives.slice(1))
			})
		})

		describe("given last-signed-on", function() {
			it("must include initiatives signed last on and after date", function*() {
				var initiativeA = initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "sign"
				}))

				signaturesDb.create(new ValidSignature({
					initiative_uuid: initiativeA.uuid,

					created_at: DateFns.addSeconds(
						DateFns.addDays(DateFns.startOfDay(new Date), -1),
						-1
					)
				}))

				var initiativeB = initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "sign"
				}))

				var signatureA = signaturesDb.create(new ValidSignature({
					initiative_uuid: initiativeB.uuid,
					created_at: DateFns.addDays(DateFns.startOfDay(new Date), -1)
				}))

				var initiativeC = initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "sign"
				}))

				var signatureB = signaturesDb.create(new ValidSignature({
					initiative_uuid: initiativeC.uuid,
					created_at: DateFns.startOfDay(new Date)
				}))

				yield request.call(this, {
					"last-signed-on>": formatIsoDate(DateFns.addDays(new Date, -1))
				}, [_.assign(initiativeB, {
					signature_count: 1,
					last_signed_at: signatureA.created_at
				}), _.assign(initiativeC, {
					signature_count: 1,
					last_signed_at: signatureB.created_at
				})])
			})

			it("must include initiatives signed last on and before date", function*() {
				var initiativeA = initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "sign"
				}))

				var signatureA = signaturesDb.create(new ValidSignature({
					initiative_uuid: initiativeA.uuid,
					created_at: DateFns.addDays(DateFns.startOfDay(new Date), -2)
				}))

				var initiativeB = initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "sign"
				}))

				var signatureB = signaturesDb.create(new ValidSignature({
					initiative_uuid: initiativeB.uuid,
					created_at: DateFns.addSeconds(DateFns.startOfDay(new Date), -1)
				}))

				var initiativeC = initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "sign"
				}))

				signaturesDb.create(new ValidSignature({
					initiative_uuid: initiativeC.uuid,
					created_at: DateFns.startOfDay(new Date)
				}))

				yield request.call(this, {
					"last-signed-on<": formatIsoDate(DateFns.addDays(new Date, -1))
				}, [_.assign(initiativeA, {
					signature_count: 1,
					last_signed_at: signatureA.created_at
				}), _.assign(initiativeB, {
					signature_count: 1,
					last_signed_at: signatureB.created_at
				})])
			})
		})

		describe("given proceedings-started-on", function() {
			it("must include initiatives where proceedings started on and after date", function*() {
				initiativesDb.create([
					new ValidInitiative({
						user_id: this.author.id,
						phase: "parliament",

						accepted_by_parliament_at: DateFns.addSeconds(
							DateFns.addDays(DateFns.startOfDay(new Date), -1),
							-1
						)
					}),

					new ValidInitiative({
						user_id: this.author.id,
						phase: "government",
						destination: "tallinn",

						accepted_by_government_at: DateFns.addSeconds(
							DateFns.addDays(DateFns.startOfDay(new Date), -1),
							-1
						)
					})
				])

				var initiatives = initiativesDb.create([
					new ValidInitiative({
						user_id: this.author.id,
						phase: "parliament",

						accepted_by_parliament_at:
							DateFns.addDays(DateFns.startOfDay(new Date), -1)
					}),

					new ValidInitiative({
						user_id: this.author.id,
						phase: "parliament",
						accepted_by_parliament_at: DateFns.startOfDay(new Date)
					}),

					new ValidInitiative({
						user_id: this.author.id,
						phase: "government",
						destination: "tallinn",

						accepted_by_government_at:
							DateFns.addDays(DateFns.startOfDay(new Date), -1)
					}),

					new ValidInitiative({
						user_id: this.author.id,
						phase: "government",
						destination: "tallinn",
						accepted_by_government_at: DateFns.startOfDay(new Date)
					})
				])

				yield request.call(this, {
					"proceedings-started-on>":
						formatIsoDate(DateFns.addDays(new Date, -1))
				}, initiatives)
			})

			it("must include initiatives where proceedings started on and before date", function*() {
				var initiatives = initiativesDb.create([
					new ValidInitiative({
						user_id: this.author.id,
						phase: "parliament",

						accepted_by_parliament_at:
							DateFns.addDays(DateFns.startOfDay(new Date), -2)
					}),

					new ValidInitiative({
						user_id: this.author.id,
						phase: "parliament",

						accepted_by_parliament_at:
							DateFns.addSeconds(DateFns.startOfDay(new Date), -1)
					}),

					new ValidInitiative({
						user_id: this.author.id,
						phase: "government",
						destination: "tallinn",

						accepted_by_government_at:
							DateFns.addDays(DateFns.startOfDay(new Date), -2)
					}),

					new ValidInitiative({
						user_id: this.author.id,
						phase: "government",
						destination: "tallinn",

						accepted_by_government_at:
							DateFns.addSeconds(DateFns.startOfDay(new Date), -1)
					})
				])

				initiativesDb.create([
					new ValidInitiative({
						user_id: this.author.id,
						phase: "parliament",
						accepted_by_parliament_at: DateFns.startOfDay(new Date)
					}),

					new ValidInitiative({
						user_id: this.author.id,
						phase: "government",
						destination: "tallinn",
						accepted_by_government_at: DateFns.startOfDay(new Date)
					})
				])

				yield request.call(this, {
					"proceedings-started-on<":
						formatIsoDate(DateFns.addDays(new Date, -1))
				}, initiatives)
			})
		})

		describe("given proceedings-ended-on", function() {
			it("must include initiatives where proceedings ended on and after date", function*() {
				initiativesDb.create([
					new ValidInitiative({
						user_id: this.author.id,
						phase: "parliament",

						finished_in_parliament_at: DateFns.addSeconds(
							DateFns.addDays(DateFns.startOfDay(new Date), -1),
							-1
						)
					}),

					new ValidInitiative({
						user_id: this.author.id,
						phase: "government",
						destination: "tallinn",

						finished_in_government_at: DateFns.addSeconds(
							DateFns.addDays(DateFns.startOfDay(new Date), -1),
							-1
						)
					})
				])

				var initiatives = initiativesDb.create([
					new ValidInitiative({
						user_id: this.author.id,
						phase: "parliament",

						finished_in_parliament_at:
							DateFns.addDays(DateFns.startOfDay(new Date), -1)
					}),

					new ValidInitiative({
						user_id: this.author.id,
						phase: "parliament",
						finished_in_parliament_at: DateFns.startOfDay(new Date)
					}),

					new ValidInitiative({
						user_id: this.author.id,
						phase: "government",
						destination: "tallinn",

						finished_in_government_at:
							DateFns.addDays(DateFns.startOfDay(new Date), -1)
					}),

					new ValidInitiative({
						user_id: this.author.id,
						phase: "government",
						destination: "tallinn",
						finished_in_government_at: DateFns.startOfDay(new Date)
					})
				])

				yield request.call(this, {
					"proceedings-ended-on>": formatIsoDate(DateFns.addDays(new Date, -1))
				}, initiatives)
			})

			it("must include initiatives where proceedings ended on and before date", function*() {
				var initiatives = initiativesDb.create([
					new ValidInitiative({
						user_id: this.author.id,
						phase: "parliament",

						finished_in_parliament_at:
							DateFns.addDays(DateFns.startOfDay(new Date), -2)
					}),

					new ValidInitiative({
						user_id: this.author.id,
						phase: "parliament",

						finished_in_parliament_at:
							DateFns.addSeconds(DateFns.startOfDay(new Date), -1)
					}),

					new ValidInitiative({
						user_id: this.author.id,
						phase: "government",
						destination: "tallinn",

						finished_in_government_at:
							DateFns.addDays(DateFns.startOfDay(new Date), -2)
					}),

					new ValidInitiative({
						user_id: this.author.id,
						phase: "government",
						destination: "tallinn",

						finished_in_government_at:
							DateFns.addSeconds(DateFns.startOfDay(new Date), -1)
					})
				])

				initiativesDb.create([
					new ValidInitiative({
						user_id: this.author.id,
						phase: "parliament",
						finished_in_parliament_at: DateFns.startOfDay(new Date)
					}),

					new ValidInitiative({
						user_id: this.author.id,
						phase: "government",
						destination: "tallinn",
						finished_in_government_at: DateFns.startOfDay(new Date)
					})
				])

				yield request.call(this, {
					"proceedings-ended-on<": formatIsoDate(DateFns.addDays(new Date, -1))
				}, initiatives)
			})
		})

		describe("given proceedings-handler", function() {
			it("must filter initiatives in parliament committees", function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "parliament",
					parliament_committee: "Sotsiaalkomisjon"
				}))

				initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "parliament",
					parliament_committee: "Keskkonnakomisjon"
				}))

				initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "parliament"
				}))

				yield request.call(this, {
					"proceedings-handler": "Sotsiaalkomisjon"
				}, [initiative])
			})

			it("must filter initiatives destined for local government", function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "government",
					destination: "tallinn",
				}))

				initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "government",
					destination: "muhu-vald"
				}))

				yield request.call(this, {
					"proceedings-handler": "tallinn"
				}, [initiative])
			})

			it("must filter initiatives destined for all local governments",
				function*() {
				initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "sign",
					destination: "parliament"
				}))

				var a = initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "sign",
					destination: "muhu-vald"
				}))

				var b = initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "sign",
					destination: "tallinn"
				}))

				initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "edit",
					destination: null,
					published_at: new Date
				}))

				yield request.call(this, {"proceedings-handler": "local"}, [a, b])
			})
		})

		describe("given external", function() {
			it("must filter for non-external initiatives if invalid boolean",
				function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "sign",
				}))

				initiativesDb.create(new ValidInitiative({
					phase: "sign",
					external: true
				}))

				yield request.call(this, {external: "yahoo"}, [initiative])
			})

			it("must filter for external initiatives", function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					phase: "sign",
					external: true
				}))

				initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "sign"
				}))

				yield request.call(this, {external: true}, [initiative])
			})

			it("must filter for non-external initiatives", function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "sign"
				}))

				initiativesDb.create(new ValidInitiative({
					phase: "sign",
					external: true
				}))

				yield request.call(this, {external: false}, [initiative])
			})
		})
	}) }

	describe(`GET / for ${INITIATIVE_TYPE}`, function() {
		beforeEach(function() { this.author = usersDb.create(new ValidUser) })

		testFilters(function* request(query, expected) {
			var res = yield this.request(
				"/initiatives?" + Qs.stringify(_.defaults({order: "id"}, query)),
				{headers: {Accept: INITIATIVE_TYPE}}
			)

			res.statusCode.must.equal(200)
			res.headers["content-type"].must.equal(INITIATIVE_TYPE)
			res.headers["access-control-allow-origin"].must.equal("*")
			res.body.must.eql(expected.map(serializeApiInitiative))
		})

		it("must not respond with unpublished initiatives", function*() {
			initiativesDb.create(new ValidInitiative({user_id: this.author.id}))

			var res = yield this.request("/initiatives", {
				headers: {Accept: INITIATIVE_TYPE}
			})

			res.statusCode.must.equal(200)
			res.body.must.eql([])
		})

		it("must respond with initiatives without destination", function*() {
			var initiative = initiativesDb.create(new ValidInitiative({
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
			res.body.must.eql([serializeApiInitiative(initiative)])
		})

		it("must respond with initiatives destined for parliament", function*() {
			var initiative = initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				phase: "edit",
				destination: "parliament",
				published_at: new Date
			}))

			var res = yield this.request("/initiatives", {
				headers: {Accept: INITIATIVE_TYPE}
			})

			res.statusCode.must.equal(200)

			res.body.must.eql([_.assign(serializeApiInitiative(initiative), {
				signatureThreshold: Config.votesRequired
			})])
		})

		it("must respond with initiatives destined for local", function*() {
			var initiative = initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				phase: "edit",
				destination: "muhu-vald",
				published_at: new Date
			}))

			var res = yield this.request("/initiatives", {
				headers: {Accept: INITIATIVE_TYPE}
			})

			res.statusCode.must.equal(200)

			res.body.must.eql([_.assign(serializeApiInitiative(initiative), {
				signatureThreshold: LOCAL_GOVERNMENTS["muhu-vald"].signatureThreshold
			})])
		})

		it("must respond with external initiatives in parliament", function*() {
			var initiative = initiativesDb.create(new ValidInitiative({
				phase: "parliament",
				received_by_parliament_at: pseudoDateTime(),
				external: true
			}))

			var res = yield this.request("/initiatives", {
				headers: {Accept: INITIATIVE_TYPE}
			})

			res.statusCode.must.equal(200)

			res.body.must.eql([_.assign(serializeApiInitiative(initiative), {
				signatureCount: null,
				signatureThreshold: Config.votesRequired
			})])
		})

		it("must respond with signature count", function*() {
			var initiative = initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				phase: "sign"
			}))

			citizenosSignaturesDb.create(_.times(5, () => (
				new ValidCitizenosSignature({initiative_uuid: initiative.uuid})
			)))

			signaturesDb.create(_.times(3, () => new ValidSignature({
				initiative_uuid: initiative.uuid
			})))

			var res = yield this.request("/initiatives", {
				headers: {Accept: INITIATIVE_TYPE}
			})

			res.statusCode.must.equal(200)

			res.body.must.eql([_.assign(serializeApiInitiative(initiative), {
				signatureCount: 8,
				signatureThreshold: Config.votesRequired
			})])
		})

		describe("given signedSince", function() {
			it("must return signature count since given date", function*() {
				var self = this

				var initiatives = _.times(10, function(i) {
					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: self.author.id,
						phase: "sign"
					}))

					signaturesDb.create(_.times(i, () => new ValidSignature({
						initiative_uuid: initiative.uuid,
						created_at: new Date(2015, 5, 18 + i, 13, 37, 42)
					})))

					return initiative
				})

				var res = yield this.request("/initiatives?signedSince=2015-06-23", {
					headers: {Accept: INITIATIVE_TYPE}
				})

				res.statusCode.must.equal(200)

				var obj = _.sortBy(res.body, "signaturesSinceCount")
				_.map(obj, "id").must.eql(_.map(initiatives.slice(5), "uuid"))
				_.map(obj, "signaturesSinceCount").must.eql([5, 6, 7, 8, 9])
			})

			// This was a bug noticed on Mar 17, 2021 where an invalid `signedSince`
			// threw "Invalid time value".
			it("must not return signature count if signedSince invalid",
				function*() {
				initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "sign"
				}))

				var res = yield this.request("/initiatives?signedSince=invalid", {
					headers: {Accept: INITIATIVE_TYPE}
				})

				res.statusCode.must.equal(200)
				res.body[0].must.not.have.property("signaturesSinceCount")
			})
		})

		describe("given order", function() {
			it("must respond with 400 given invalid order", function*() {
				var res = yield this.request("/initiatives?order=foo", {
					headers: {Accept: INITIATIVE_TYPE}
				})

				res.statusCode.must.equal(400)
				res.statusMessage.must.equal("Invalid Order")
				res.body.must.eql({code: 400, message: "Invalid Order"})
			})

			_.each({
				"signature-count": _.id,
				"+signature-count": _.id,
				"-signature-count": _.reverse,
				"signatureCount": _.id,
				"+signatureCount": _.id,
				"-signatureCount": _.reverse,
			}, (sort, order) => it(`must sort by ${order}`, function*() {
				var initiatives = _.times(5, (i) => {
					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: this.author.id,
						phase: "sign"
					}))

					// Create signatures in descending order to ensure their default
					// order doesn't match initiative creation order.
					signaturesDb.create(_.times(4 - i, () => new ValidSignature({
						initiative_uuid: initiative.uuid
					})))

					return initiative
				})

				var res = yield this.request("/initiatives?" + Qs.stringify({order}), {
					headers: {Accept: INITIATIVE_TYPE}
				})

				res.statusCode.must.equal(200)
				var uuids = _.map(initiatives, "uuid").reverse()
				_.map(res.body, "id").must.eql(sort(uuids))
			}))

			_.each({
				"signaturesSinceCount": _.id,
				"+signaturesSinceCount": _.id,
				"-signaturesSinceCount": _.reverse,
			}, function(sort, order) {
				it("must return signature count since given date", function*() {
					var initiatives = _.times(10, (i) => {
						var initiative = initiativesDb.create(new ValidInitiative({
							user_id: this.author.id,
							phase: "sign"
						}))

						// Create signatures in descending order to ensure their default
						// order doesn't match initiative creation order.
						signaturesDb.create(_.times(9 - i, () => new ValidSignature({
							initiative_uuid: initiative.uuid,
							created_at: new Date(2015, 5, 27 - i, 13, 37, 42)
						})))

						return initiative
					})

					var initiativePath = "/initiatives?signedSince=2015-06-23"
					initiativePath += "&order=" + encodeURIComponent(order)
					var res = yield this.request(initiativePath, {
						headers: {Accept: INITIATIVE_TYPE}
					})

					res.statusCode.must.equal(200)
					var uuids = _.map(initiatives.slice(0, 5).reverse(), "uuid")
					_.map(res.body, "id").must.eql(sort(uuids))
					var counts = sort([5, 6, 7, 8, 9])
					_.map(res.body, "signaturesSinceCount").must.eql(counts)
				})

				// This was a bug noticed on Mar 17, 2021 where an empty `signedSince`
				// caused an error due to the order by signaturesSinceCount referenced
				// a column that wasn't included.
				it("must not order if signedSince missing", function*() {
					initiativesDb.create(new ValidInitiative({
						user_id: this.author.id,
						phase: "sign"
					}))

					var initiativePath = "/initiatives?order=" + encodeURIComponent(order)
					var res = yield this.request(initiativePath, {
						headers: {Accept: INITIATIVE_TYPE}
					})

					res.statusCode.must.equal(200)
					res.body[0].must.not.have.property("signaturesSinceCount")
				})
			})
		})

		describe("given limit", function() {
			it("must limit initiatives", function*() {
				var initiatives = initiativesDb.create(_.times(10, () =>
					new ValidInitiative({user_id: this.author.id, published_at: new Date})
				))

				var res = yield this.request("/initiatives?limit=5", {
					headers: {Accept: INITIATIVE_TYPE}
				})

				res.statusCode.must.equal(200)
				var existing = new Set(_.map(initiatives, "uuid"))
				res.body.length.must.equal(5)
				res.body.forEach((i) => existing.has(i.uuid))
				_.map(res.body, "id").every(existing.has.bind(existing)).must.be.true()
			})

			it("must limit initiatives after sorting", function*() {
				var initiatives = _.times(10, (i) => {
					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: this.author.id,
						published_at: new Date
					}))

					signaturesDb.create(_.times(i, () => new ValidSignature({
						initiative_uuid: initiative.uuid
					})))

					return initiative
				})

				var initiativePath = "/initiatives?order=-signatureCount&limit=5"
				var res = yield this.request(initiativePath, {
					headers: {Accept: INITIATIVE_TYPE}
				})

				res.statusCode.must.equal(200)
				var last5 = _.map(initiatives.slice(5), "uuid")
				_.map(res.body, "id").must.eql(last5.reverse())
			})

			it("must return nothing given zero", function*() {
				initiativesDb.create(_.times(5, () =>
					new ValidInitiative({user_id: this.author.id})
				))

				var res = yield this.request("/initiatives?limit=0", {
					headers: {Accept: INITIATIVE_TYPE}
				})

				res.statusCode.must.equal(200)
				res.body.must.be.empty()
			})

			it("must respond with 400 given non-number", function*() {
				initiativesDb.create(_.times(5, () =>
					new ValidInitiative({user_id: this.author.id})
				))

				var res = yield this.request("/initiatives?limit=foo", {
					headers: {Accept: INITIATIVE_TYPE}
				})

				res.statusCode.must.equal(400)
				res.statusMessage.must.equal("Invalid Limit")
				res.body.must.eql({code: 400, message: "Invalid Limit"})
			})

			it("must respond with 400 given a negative number", function*() {
				initiativesDb.create(_.times(5, () =>
					new ValidInitiative({user_id: this.author.id})
				))

				var res = yield this.request("/initiatives?limit=-5", {
					headers: {Accept: INITIATIVE_TYPE}
				})

				res.statusCode.must.equal(400)
				res.statusMessage.must.equal("Invalid Limit")
				res.body.must.eql({code: 400, message: "Invalid Limit"})
			})

			it("must respond with 400 given Infinity", function*() {
				initiativesDb.create(_.times(5, () =>
					new ValidInitiative({user_id: this.author.id})
				))

				var res = yield this.request("/initiatives?limit=Infinity", {
					headers: {Accept: INITIATIVE_TYPE}
				})

				res.statusCode.must.equal(400)
				res.statusMessage.must.equal("Invalid Limit")
				res.body.must.eql({code: 400, message: "Invalid Limit"})
			})
		})
	})

	describe(`GET / for text/csv`, function() {
		beforeEach(function() { this.author = usersDb.create(new ValidUser) })

		var CSV_HEADER = Csv.serialize([
			"id",
			"uuid",
			"title",
			"authors",
			"destination",
			"phase",
			"published_at",
			"signing_started_at",
			"signing_ends_at",
			"signature_count",
			"last_signed_at",
			"sent_to_parliament_at",
			"parliament_committees",
			"finished_in_parliament_at",
			"sent_to_government_at",
			"finished_in_government_at"
		])

		it("must respond with CSV header if no initiatives", function*() {
			var res = yield this.request("/initiatives.csv")
			res.statusCode.must.equal(200)
			res.headers["content-type"].must.equal(CSV_TYPE)
			res.body.must.equal(CSV_HEADER + "\n")
		})

		testFilters(function* request(query, expected) {
			var res = yield this.request(
				"/initiatives.csv?" + Qs.stringify(_.defaults({order: "id"}, query))
			)

			res.statusCode.must.equal(200)
			res.headers["content-type"].must.equal(CSV_TYPE)
			res.headers["access-control-allow-origin"].must.equal("*")

			res.body.must.equal(CSV_HEADER + "\n" + expected.map((initiative) => (
				serializeCsvInitiative(_.defaults({
					user_name: initiative.external ? null : this.author.name
				}, initiative))
			)).join("\n"))
		})

		it("must not respond with unpublished initiatives", function*() {
			initiativesDb.create(new ValidInitiative({user_id: this.author.id}))
			var res = yield this.request("/initiatives.csv")
			res.statusCode.must.equal(200)
			res.body.must.equal(CSV_HEADER + "\n")
		})

		it("must respond with initiatives without destination", function*() {
			var initiative = initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				phase: "edit",
				published_at: new Date
			}))

			var res = yield this.request("/initiatives.csv")
			res.statusCode.must.equal(200)
			res.headers["content-type"].must.equal(CSV_TYPE)
			res.headers["access-control-allow-origin"].must.equal("*")

			res.body.must.eql(_.concat(CSV_HEADER, serializeCsvInitiative(_.defaults({
				user_name: this.author.name
			}, initiative))).join("\n"))
		})

		it("must respond with initiatives destined for parliament", function*() {
			var initiative = initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				phase: "edit",
				destination: "parliament",
				published_at: new Date
			}))

			var res = yield this.request("/initiatives.csv")
			res.statusCode.must.equal(200)

			res.body.must.eql(_.concat(CSV_HEADER, serializeCsvInitiative(_.defaults({
				user_name: this.author.name
			}, initiative))).join("\n"))
		})

		it("must respond with initiatives destined for local", function*() {
			var initiative = initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				phase: "edit",
				destination: "muhu-vald",
				published_at: new Date
			}))

			var res = yield this.request("/initiatives.csv")
			res.statusCode.must.equal(200)

			res.body.must.eql(_.concat(CSV_HEADER, serializeCsvInitiative(_.defaults({
				user_name: this.author.name
			}, initiative))).join("\n"))
		})

		it("must respond with external initiatives in parliament", function*() {
			var initiative = initiativesDb.create(new ValidInitiative({
				phase: "parliament",
				received_by_parliament_at: pseudoDateTime(),
				external: true
			}))

			var res = yield this.request("/initiatives.csv")
			res.statusCode.must.equal(200)

			res.body.must.eql(_.concat(
				CSV_HEADER,
				serializeCsvInitiative(initiative)
			).join("\n"))
		})

		it("must respond with signature count", function*() {
			var initiative = initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				phase: "sign"
			}))

			citizenosSignaturesDb.create(_.times(5, (i) => (
				new ValidCitizenosSignature({
					initiative_uuid: initiative.uuid,
					created_at: DateFns.addMinutes(new Date, -(i - 3) * 2)
				})
			)))

			var signatures = signaturesDb.create(_.times(3, (i) => new ValidSignature({
				initiative_uuid: initiative.uuid,
				created_at: DateFns.addMinutes(new Date, -i * 2)
			})))

			var res = yield this.request("/initiatives.csv")
			res.statusCode.must.equal(200)

			res.body.must.eql(_.concat(CSV_HEADER, serializeCsvInitiative(_.defaults({
				user_name: this.author.name,
				signature_count: 8,
				last_signed_at: signatures[0].created_at
			}, initiative))).join("\n"))
		})

		it("must respond with initiatives with author name", function*() {
			var initiative = initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				phase: "edit",
				published_at: new Date,
				author_name: "Freedom Organization"
			}))

			var res = yield this.request("/initiatives.csv")
			res.statusCode.must.equal(200)

			res.body.must.eql(_.concat(CSV_HEADER, serializeCsvInitiative(_.defaults({
				user_name: this.author.name
			}, initiative))).join("\n"))
		})
	})

	describe("GET /new", function() {
		describe("when not logged in", function() {
			it("must respond with 401", function*() {
				var res = yield this.request("/initiatives/new")
				res.statusCode.must.equal(401)
			})
		})

		describe("when logged in", function() {
			require("root/test/fixtures").user()

			it("must render", function*() {
				var res = yield this.request("/initiatives/new")
				res.statusCode.must.equal(200)
			})

			it("must render Trix text sections form", function*() {
				var res = yield this.request("/initiatives/new")
				res.statusCode.must.equal(200)

				var dom = parseHtml(res.body)
				var form = dom.getElementById("initiative-form")

				form.elements.title.value.must.equal("")
				form.elements["content[summary]"].value.must.equal("")
				form.elements["content[problem]"].value.must.equal("")
				form.elements["content[solution]"].value.must.equal("")
			})
		})
	})

	describe("POST /", function() {
		describe("when not logged in", function() {
			it("must respond with 401", function*() {
				var content = newTrixDocument("Hello, world")

				var res = yield this.request("/initiatives", {
					method: "POST",
					form: {
						title: "Hello, world!",
						content: JSON.stringify(content),
						language: "en"
					}
				})

				res.statusCode.must.equal(401)
			})
		})

		describe("when logged in", function() {
			require("root/test/fixtures").user()
			require("root/test/time")()

			it("must create initiative with text", function*() {
				var content = newTrixDocument("Hello, world")

				var res = yield this.request("/initiatives", {
					method: "POST",
					form: {
						title: "Hello, world!",
						content: JSON.stringify(content),
						language: "en"
					}
				})

				res.statusCode.must.equal(303)
				res.statusMessage.must.equal("Initiative Created")

				var initiatives = initiativesDb.search(sql`SELECT * FROM initiatives`)
				initiatives.length.must.equal(1)
				var initiative = initiatives[0]

				initiative.must.eql(new ValidInitiative({
					id: initiative.id,
					uuid: initiative.uuid,
					slug: "hello-world",
					user_id: this.user.id,
					parliament_token: initiative.parliament_token,
					title: "Hello, world!",
					language: "en",
					created_at: new Date
				}))

				textsDb.search(sql`
					SELECT * FROM initiative_texts
				`).must.eql([new ValidText({
					id: 1,
					initiative_uuid: initiative.uuid,
					user_id: this.user.id,
					created_at: new Date,
					title: "Hello, world!",
					language: "en",
					content: content,
					content_type: TRIX_TYPE
				})])

				res.headers.location.must.equal(
					"/initiatives/" + initiative.id + "-hello-world"
				)
			})

			it("must create initiative with text sections", function*() {
				var summary = newTrixDocument("World.")
				var problem = newTrixDocument("Bad world.")
				var solution = newTrixDocument("Make better.")

				var res = yield this.request("/initiatives", {
					method: "POST",
					form: {
						title: "Hello, world!",
						"content[summary]": JSON.stringify(summary),
						"content[problem]": JSON.stringify(problem),
						"content[solution]": JSON.stringify(solution),
						language: "en"
					}
				})

				res.statusCode.must.equal(303)
				res.statusMessage.must.equal("Initiative Created")

				var initiatives = initiativesDb.search(sql`SELECT * FROM initiatives`)
				initiatives.length.must.equal(1)
				var initiative = initiatives[0]

				initiative.must.eql(new ValidInitiative({
					id: initiative.id,
					uuid: initiative.uuid,
					slug: "hello-world",
					user_id: this.user.id,
					parliament_token: initiative.parliament_token,
					title: "Hello, world!",
					language: "en",
					created_at: new Date
				}))

				textsDb.search(sql`
					SELECT * FROM initiative_texts
				`).must.eql([new ValidText({
					id: 1,
					initiative_uuid: initiative.uuid,
					user_id: this.user.id,
					created_at: new Date,
					title: "Hello, world!",
					language: "en",
					content: {summary, problem, solution},
					content_type: TRIX_SECTIONS_TYPE
				})])

				res.headers.location.must.equal(
					"/initiatives/" + initiative.id + "-hello-world"
				)
			})

			it("must err given empty title", function*() {
				var res = yield this.request("/initiatives", {
					method: "POST",
					form: {title: "", content: []}
				})

				res.statusCode.must.equal(422)
				res.statusMessage.must.equal("Invalid Attributes")
				res.headers["content-type"].must.equal("text/html; charset=utf-8")

				var dom = parseHtml(res.body)
				var form = dom.getElementById("initiative-form")
				form.elements.title.value.must.equal("")

				initiativesDb.search(sql`SELECT * FROM initiatives`).must.be.empty()
			})

			it("must err given too long summary and prefill form", function*() {
				var summary = newTrixDocument(_.repeat("a", SUMMARY_MAX_LENGTH + 1))
				var problem = newTrixDocument("")
				var solution = newTrixDocument("")

				var res = yield this.request("/initiatives", {
					method: "POST",
					form: {
						title: "Hello, world!",
						"content[summary]": JSON.stringify(summary),
						"content[problem]": JSON.stringify(problem),
						"content[solution]": JSON.stringify(solution),
						language: "en"
					}
				})

				res.statusCode.must.equal(422)
				res.statusMessage.must.equal("Invalid Attributes")
				res.headers["content-type"].must.equal("text/html; charset=utf-8")

				var dom = parseHtml(res.body)
				var form = dom.getElementById("initiative-form")
				form.elements.title.value.must.equal("Hello, world!")

				form.elements["content[summary]"].value.must.equal(
					JSON.stringify(summary)
				)

				form.elements["content[problem]"].value.must.equal(
					JSON.stringify(problem)
				)

				form.elements["content[solution]"].value.must.equal(
					JSON.stringify(solution)
				)

				var langEl = form.querySelector("input[name='language'][value='en']")
				langEl.checked.must.be.true()

				initiativesDb.search(sql`SELECT * FROM initiatives`).must.be.empty()
			})

			it("must create initiative without slug if nothing remains", function*() {
				var res = yield this.request("/initiatives", {
					method: "POST",
					form: {title: "!?", content: ""}
				})

				res.statusCode.must.equal(303)
				res.statusMessage.must.equal("Initiative Created")

				var initiative = initiativesDb.read(sql`SELECT * FROM initiatives`)

				initiative.must.eql(new ValidInitiative({
					id: initiative.id,
					uuid: initiative.uuid,
					slug: null,
					user_id: this.user.id,
					parliament_token: initiative.parliament_token,
					title: "!?",
					created_at: new Date
				}))

				textsDb.search(sql`
					SELECT * FROM initiative_texts
				`).must.eql([new ValidText({
					id: 1,
					initiative_uuid: initiative.uuid,
					user_id: this.user.id,
					created_at: new Date,
					title: "!?",
					content: [],
					content_type: TRIX_TYPE
				})])

				res.headers.location.must.equal("/initiatives/" + initiative.id)
			})

			it("must err given invalid language", function*() {
				var res = yield this.request("/initiatives", {
					method: "POST",
					form: {
						title: "Hello, world!",
						content: JSON.stringify(newTrixDocument("Hello, world")),
						language: "xx"
					}
				})

				res.statusCode.must.equal(422)
				res.statusMessage.must.equal("Invalid Attributes")
				res.headers["content-type"].must.equal("text/html; charset=utf-8")

				var dom = parseHtml(res.body)
				var form = dom.getElementById("initiative-form")
				form.elements.title.value.must.equal("Hello, world!")

				initiativesDb.search(sql`SELECT * FROM initiatives`).must.be.empty()
			})

			Config.languages.forEach(function(lang) {
				it(`must create initiative with language ${lang}`, function*() {
					var res = yield this.request("/initiatives", {
						method: "POST",
						form: {
							title: "Hello, world!",
							content: JSON.stringify(newTrixDocument("Hello, world")),
							language: lang
						}
					})

					res.statusCode.must.equal(303)
					res.statusMessage.must.equal("Initiative Created")

					var initiatives = initiativesDb.search(sql`SELECT * FROM initiatives`)
					initiatives.length.must.equal(1)
					var initiative = initiatives[0]

					initiative.must.eql(new ValidInitiative({
						id: initiative.id,
						uuid: initiative.uuid,
						slug: "hello-world",
						user_id: this.user.id,
						parliament_token: initiative.parliament_token,
						title: "Hello, world!",
						language: lang,
						created_at: new Date
					}))
				})
			})

			it("must not update other attributes", function*() {
				var content = newTrixDocument("Hello, world")

				var res = yield this.request("/initiatives", {
					method: "POST",
					form: {
						title: "Hello, world!",
						content: JSON.stringify(content),
						phase: "sign",
						user_id: 42
					}
				})

				res.statusCode.must.equal(303)
				res.statusMessage.must.equal("Initiative Created")

				var initiatives = initiativesDb.search(sql`SELECT * FROM initiatives`)
				initiatives.length.must.equal(1)
				var initiative = initiatives[0]

				initiative.must.eql(new ValidInitiative({
					id: initiative.id,
					uuid: initiative.uuid,
					slug: "hello-world",
					user_id: this.user.id,
					parliament_token: initiative.parliament_token,
					title: "Hello, world!",
					created_at: new Date
				}))

				textsDb.search(sql`
					SELECT * FROM initiative_texts
				`).must.eql([new ValidText({
					id: 1,
					initiative_uuid: initiative.uuid,
					user_id: this.user.id,
					created_at: new Date,
					title: "Hello, world!",
					content: content
				})])
			})

			describe("as a rate limited endpoint", function() {
				var INITIATIVE_FORM = {
					title: "Hello, world!",
					content: JSON.stringify(newTrixDocument("Hello, world"))
				}

				it(`must respond with 429 if created ${INITIATIVE_RATE} initiatives in the last 15m`, function*() {
					initiativesDb.create(_.times(INITIATIVE_RATE, (_i) => (
						new ValidInitiative({
							user_id: this.user.id,

							created_at:
								DateFns.addSeconds(DateFns.addMinutes(new Date, -15), 1),
						})
					)))

					var res = yield this.request("/initiatives", {
						method: "POST",
						form: INITIATIVE_FORM
					})

					res.statusCode.must.equal(429)
					res.statusMessage.must.equal("Too Many Initiatives")
				})

				it(`must not respond with 429 if created <${INITIATIVE_RATE} initiatives in the last 15m`, function*() {
					initiativesDb.create(_.times(INITIATIVE_RATE - 1, (_i) => (
						new ValidInitiative({
							user_id: this.user.id,

							created_at:
								DateFns.addSeconds(DateFns.addMinutes(new Date, -15), 1),
						})
					)))

					var res = yield this.request("/initiatives", {
						method: "POST",
						form: INITIATIVE_FORM
					})

					res.statusCode.must.equal(303)
					res.statusMessage.must.equal("Initiative Created")
				})

				it(`must not respond with 429 if created ${INITIATIVE_RATE} initiatives earlier than 15m`, function*() {
					initiativesDb.create(_.times(INITIATIVE_RATE, (_i) => (
						new ValidInitiative({
							user_id: this.user.id,
							created_at: DateFns.addMinutes(new Date, -15),
						})
					)))

					var res = yield this.request("/initiatives", {
						method: "POST",
						form: INITIATIVE_FORM
					})

					res.statusCode.must.equal(303)
					res.statusMessage.must.equal("Initiative Created")
				})
			})
		})
	})

	describe("GET /:id", function() {
		beforeEach(function() { this.author = usersDb.create(new ValidUser) })

		describe("when not logged in", function() {
			require("root/test/time")(new Date(2015, 5, 18, 13, 37, 42))

			it("must respond with 401 for a unpublished initiative", function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.author.id
				}))

				var res = yield this.request("/initiatives/" + initiative.id)
				res.statusCode.must.equal(401)
				res.statusMessage.must.equal("Initiative Not Public")
			})

			it("must respond with 404 for a non-existent initiative", function*() {
				var uuid = "b3c6f2c0-f671-4fc7-8064-d364f7792db9"
				var res = yield this.request("/initiatives/" + uuid)
				res.statusCode.must.equal(404)
			})

			it("must include metadata tags", function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					published_at: new Date,
					title: "Hello, world!",
				}))

				imagesDb.create({
					initiative_uuid: initiative.uuid,
					data: PNG,
					type: "image/png",
					preview: PNG_PREVIEW
				})

				var res = yield this.request("/initiatives/" + initiative.id)
				res.statusCode.must.equal(200)

				var dom = parseHtml(res.body)
				var links = dom.head.querySelectorAll("link")
				var linksByType = _.indexBy(links, (el) => el.getAttribute("type"))
				var atomLink = linksByType[ATOM_TYPE]
				atomLink.rel.must.equal("alternate")
				atomLink.href.must.equal("/initiatives/" + initiative.id + ".atom")

				atomLink.title.must.equal(t("ATOM_INITIATIVE_FEED_TITLE", {
					title: initiative.title
				}))

				var metas = dom.head.querySelectorAll("meta")
				var metasByName = _.indexBy(metas, (el) => el.getAttribute("name"))
				var metasByProp = _.indexBy(metas, (el) => el.getAttribute("property"))

				metasByName["twitter:site"].content.must.equal("@" + TWITTER_NAME)
				metasByName["twitter:card"].content.must.equal("summary_large_image")

				var url = `${Config.url}/initiatives/${initiative.id}`
				metasByProp["og:title"].content.must.equal(initiative.title)
				metasByProp["og:url"].content.must.equal(url + "-hello-world")
				metasByProp["og:image"].content.must.equal(url + ".png")
			})

			it("must show done phase by default", function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					destination: "parliament",
					published_at: new Date
				}))

				var res = yield this.request("/initiatives/" + initiative.id)
				res.statusCode.must.equal(200)

				var dom = parseHtml(res.body)
				var phases = queryPhases(dom)
				phases.must.have.property("done")
				phases.must.not.have.property("archived")
			})

			it("must render initiative header", function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "edit",
					published_at: new Date,
					author_name: "Freedom Organization"
				}))

				var res = yield this.request("/initiatives/" + initiative.id)
				res.statusCode.must.equal(200)
				var dom = parseHtml(res.body)

				var title = dom.querySelector("#initiative-header h1")
				title.textContent.must.include(initiative.title)

				dom.querySelector("#initiative-header .authors").textContent.must.equal(
					"Freedom Organization, " + this.author.name
				)
			})

			it("must render initiative with Trix text", function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "edit",
					published_at: new Date
				}))

				var text = textsDb.create(new ValidText({
					initiative_uuid: initiative.uuid,
					user_id: this.author.id,
					content_type: "application/vnd.basecamp.trix+json",
					content: newTrixDocument("Hello, world!")
				}))

				var res = yield this.request("/initiatives/" + initiative.id)
				res.statusCode.must.equal(200)

				var dom = parseHtml(res.body)

				var title = dom.querySelector("#initiative-header h1")
				title.textContent.must.include(text.title)

				res.body.must.include("Hello, world!")
			})

			it("must render initiative with Trix text sections", function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "edit",
					published_at: new Date
				}))

				var text = textsDb.create(new ValidText({
					initiative_uuid: initiative.uuid,
					user_id: this.author.id,
					content_type: TRIX_SECTIONS_TYPE,

					content: {
						summary: newTrixDocument("World."),
						problem: newTrixDocument("Bad world."),
						solution: newTrixDocument("Make better.")
					}
				}))

				var res = yield this.request("/initiatives/" + initiative.id)
				res.statusCode.must.equal(200)

				var dom = parseHtml(res.body)

				var title = dom.querySelector("#initiative-header h1")
				title.textContent.must.include(text.title)

				var article = dom.querySelector("#initiative-sheet article")
				article.textContent.must.include("World.")
				article.textContent.must.include("Bad world.")
				article.textContent.must.include("Make better.")
			})

			it("must render initiative with Trix text sections when some unknown",
				function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "edit",
					published_at: new Date
				}))

				var text = textsDb.create(new ValidText({
					initiative_uuid: initiative.uuid,
					user_id: this.author.id,
					content_type: TRIX_SECTIONS_TYPE,

					content: {
						summary: newTrixDocument("World."),
						problem: newTrixDocument("Bad world."),
						hope: newTrixDocument("Make better.")
					}
				}))

				var res = yield this.request("/initiatives/" + initiative.id)
				res.statusCode.must.equal(200)

				var dom = parseHtml(res.body)

				var title = dom.querySelector("#initiative-header h1")
				title.textContent.must.include(text.title)

				var article = dom.querySelector("#initiative-sheet article")
				article.textContent.must.include("World.")
				article.textContent.must.include("Bad world.")
				article.textContent.must.include("Make better.")
			})

			it("must not render empty Trix text sections", function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "edit",
					published_at: new Date
				}))

				var text = textsDb.create(new ValidText({
					initiative_uuid: initiative.uuid,
					user_id: this.author.id,
					content_type: TRIX_SECTIONS_TYPE,

					content: {
						summary: TRIX_BLANK_DOCUMENT,
						problem: TRIX_BLANK_DOCUMENT,
						solution: TRIX_BLANK_DOCUMENT
					}
				}))

				var res = yield this.request("/initiatives/" + initiative.id)
				res.statusCode.must.equal(200)

				var dom = parseHtml(res.body)

				var title = dom.querySelector("#initiative-header h1")
				title.textContent.must.include(text.title)

				var article = dom.querySelector("#initiative-sheet article")
				article.textContent.must.equal("")
			})

			it("must render initiative with CitizenOS HTML", function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "edit",
					published_at: new Date
				}))

				var text = textsDb.create(new ValidText({
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

				var res = yield this.request("/initiatives/" + initiative.id)
				res.statusCode.must.equal(200)
				res.body.must.include(text.title)
				res.body.must.not.include("Vote for Peace")
				res.body.must.include("Rest in peace!")
			})

			it("must render external initiative with a PDF", function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					phase: "parliament",
					external: true
				}))

				var file = filesDb.create(new ValidFile({
					initiative_uuid: initiative.uuid,
					content_type: "application/pdf"
				}))

				var initiativePath = "/initiatives/" + initiative.id
				var res = yield this.request(initiativePath)
				res.statusCode.must.equal(200)

				var dom = parseHtml(res.body)
				var title = dom.querySelector("#initiative-header h1")
				title.textContent.must.equal(initiative.title)

				var object = dom.querySelector("object")
				object.data.must.equal(initiativePath + "/files/" + file.id)
				object.type.must.equal(String(file.content_type))
			})

			it("must render external initiative with the set external file id",
				function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					phase: "parliament",
					external: true,
				}))

				filesDb.create(new ValidFile({
					initiative_uuid: initiative.uuid,
					content_type: "application/pdf"
				}))

				var text = filesDb.create(new ValidFile({
					initiative_uuid: initiative.uuid,
					content_type: "application/pdf"
				}))

				initiativesDb.update(initiative, {
					external_text_file_id: text.id
				})

				var initiativePath = "/initiatives/" + initiative.id
				var res = yield this.request(initiativePath)
				res.statusCode.must.equal(200)

				var dom = parseHtml(res.body)
				var title = dom.querySelector("#initiative-header h1")
				title.textContent.must.equal(initiative.title)

				var object = dom.querySelector("object")
				object.data.must.equal(initiativePath + "/files/" + text.id)
				object.type.must.equal(String(text.content_type))
			})

			it("must not show duplicate author names", function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "edit",
					published_at: new Date,
					author_name: this.author.name
				}))

				var res = yield this.request("/initiatives/" + initiative.id)
				res.statusCode.must.equal(200)

				var dom = parseHtml(res.body)
				var author = dom.querySelector("#initiative-header .authors")
				author.textContent.must.equal(this.author.name)
			})

			it(`must not show coauthor name from another initiative`, function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "edit",
					published_at: new Date
				}))

				var other = initiativesDb.create(new ValidInitiative({
					user_id: this.author.id
				}))

				coauthorsDb.create(new ValidCoauthor({
					initiative: other,
					user: usersDb.create(new ValidUser),
					status: "accepted"
				}))

				var res = yield this.request("/initiatives/" + initiative.id)
				res.statusCode.must.equal(200)

				var dom = parseHtml(res.body)
				var author = dom.querySelector("#initiative-header .authors")
				author.textContent.must.equal(this.author.name)
			})

			it("must show accepted coauthor names", function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "edit",
					published_at: new Date
				}))

				var coauthors = usersDb.create([
					new ValidUser,
					new ValidUser,
					new ValidUser
				])

				coauthorsDb.create(coauthors.map((coauthor) => new ValidCoauthor({
					initiative: initiative,
					user: coauthor,
					status: "accepted"
				})))

				var res = yield this.request("/initiatives/" + initiative.id)
				res.statusCode.must.equal(200)

				var dom = parseHtml(res.body)
				var author = dom.querySelector("#initiative-header .authors")

				author.textContent.must.equal(_.concat(
					this.author.name,
					coauthors.map((coauthor) => coauthor.name)
				).join(", "))
			})

			_.without(COAUTHOR_STATUSES, "accepted").forEach(function(status) {
				it(`must not show ${status} coauthor name`, function*() {
					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: this.author.id,
						phase: "edit",
						published_at: new Date
					}))

					coauthorsDb.create(new ValidCoauthor({
						initiative: initiative,
						user: usersDb.create(new ValidUser),
						status: status
					}))

					var res = yield this.request("/initiatives/" + initiative.id)
					res.statusCode.must.equal(200)

					var dom = parseHtml(res.body)
					var author = dom.querySelector("#initiative-header .authors")
					author.textContent.must.equal(this.author.name)
				})
			})

			it("must render external initiative if it has no PDF", function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					phase: "parliament",
					external: true
				}))

				var initiativePath = "/initiatives/" + initiative.id
				var res = yield this.request(initiativePath)
				res.statusCode.must.equal(200)
				res.body.must.include(initiative.title)
			})

			describe("given texts", function() {
				;["edit", "sign"].forEach(function(phase) {
					it(`must render latest text in ${phase} phase`, function*() {
						var initiative = initiativesDb.create(new ValidInitiative({
							user_id: this.author.id,
							phase,
							language: "en",
							published_at: new Date
						}))

						var older = textsDb.create(new ValidText({
							initiative_uuid: initiative.uuid,
							user_id: this.author.id,
							language: "en",
							content: "Old and dusty.",
							content_type: "text/html"
						}))

						var newer = textsDb.create(new ValidText({
							initiative_uuid: initiative.uuid,
							user_id: this.author.id,
							language: "en",
							content: "Latest and greatest.",
							content_type: "text/html"
						}))

						var res = yield this.request("/initiatives/" + initiative.id)
						res.statusCode.must.equal(200)

						var dom = parseHtml(res.body)
						var headerEl = dom.querySelector("#initiative-header")
						var textEl = dom.querySelector("article.text")
						headerEl.textContent.must.not.include(older.title)
						textEl.textContent.must.not.include(older.content)
						headerEl.textContent.must.include(newer.title)
						textEl.textContent.must.include(newer.content)

						demand(dom.querySelector("#language-tabs")).be.null()
					})

					it(`must render translation tabs in ${phase} if a translation exist`, function*() {
						var initiative = initiativesDb.create(new ValidInitiative({
							user_id: this.author.id,
							phase,
							language: "en",
							published_at: new Date
						}))

						var text = textsDb.create(new ValidText({
							initiative_uuid: initiative.uuid,
							user_id: this.author.id,
							language: "en",
							content: "Latest and greatest.",
							content_type: "text/html"
						}))

						textsDb.create(new ValidText({
							initiative_uuid: initiative.uuid,
							user_id: this.author.id,
							created_at: new Date(2015, 5, 18, 13, 37, 43),
							language: "et",
							content: "In translation.",
							content_type: "text/html"
						}))

						var res = yield this.request("/initiatives/" + initiative.id)
						res.statusCode.must.equal(200)

						var dom = parseHtml(res.body)
						var headerEl = dom.querySelector("#initiative-header")
						var textEl = dom.querySelector("article.text")
						headerEl.textContent.must.include(text.title)
						textEl.textContent.must.include(text.content)

						var tabsEl = dom.querySelector("#language-tabs")

						tabsEl.innerHTML.must.include(
							t("INITIATIVE_LANG_TAB_TRANSLATION_ET")
						)

						tabsEl.innerHTML.must.include(t("INITIATIVE_LANG_TAB_EN"))

						tabsEl.innerHTML.must.not.include(
							t("INITIATIVE_LANG_TAB_TRANSLATION_RU")
						)
					})

					it(`must render latest translation in ${phase} phase`, function*() {
						var initiative = initiativesDb.create(new ValidInitiative({
							user_id: this.author.id,
							phase,
							language: "et",
							published_at: new Date
						}))

						var estonian = textsDb.create(new ValidText({
							initiative_uuid: initiative.uuid,
							user_id: initiative.user_id,
							language: "et",
							content: "Tere, maailm!",
							content_type: "text/html"
						}))

						var older = textsDb.create(new ValidText({
							initiative_uuid: initiative.uuid,
							user_id: initiative.user_id,
							language: "en",
							content: "Good hello, world!",
							content_type: "text/html"
						}))

						var newer = textsDb.create(new ValidText({
							initiative_uuid: initiative.uuid,
							user_id: initiative.user_id,
							language: "en",
							content: "Hello, world!",
							content_type: "text/html"
						}))

						var initiativePath = "/initiatives/" + initiative.id
						var res = yield this.request(initiativePath + "?language=en")
						res.statusCode.must.equal(200)

						var dom = parseHtml(res.body)
						var headerEl = dom.querySelector("#initiative-header")
						var textEl = dom.querySelector("article.text")
						headerEl.textContent.must.not.include(estonian.title)
						textEl.textContent.must.not.include(estonian.content)
						headerEl.textContent.must.not.include(older.title)
						textEl.textContent.must.not.include(older.content)
						headerEl.textContent.must.include(newer.title)
						textEl.textContent.must.include(newer.content)
					})
				})

				it("must redirect to primary language when translation missing", function*() {
					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: this.author.id,
						phase: "edit",
						title: "Hello, world!",
						published_at: new Date
					}))

					var initiativePath = "/initiatives/" + initiative.id
					var res = yield this.request(initiativePath + "?language=en")
					res.statusCode.must.equal(307)
					res.statusMessage.must.equal("No Translation")
					res.headers.location.must.equal(initiativePath + "-hello-world")
				})

				it("must render warning if initiative in sign phase and translated",
					function*() {
					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: this.author.id,
						phase: "sign",
						language: "et",
						signing_ends_at: DateFns.addDays(new Date, 1)
					}))

					textsDb.create(new ValidText({
						initiative_uuid: initiative.uuid,
						user_id: initiative.user_id,
						language: "en"
					}))

					var initiativePath = "/initiatives/" + initiative.id
					var res = yield this.request(initiativePath + "?language=en")
					res.statusCode.must.equal(200)

					res.body.must.include(t("INITIATIVE_SIGN_TRANSLATION_WARNING", {
						language:
							t("INITIATIVE_SIGN_TRANSLATION_WARNING_TEXT_IN_ET"),
						translation:
							t("INITIATIVE_SIGN_TRANSLATION_WARNING_TRANSLATION_IN_EN")
					}))

					res.body.must.include(
						t("INITIATIVE_SIGN_TRANSLATION_WARNING_SIGN_IN_ET")
					)
				})
			})

			it("must render initiative in edit phase", function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					created_at: new Date,
					published_at: new Date,
					discussion_ends_at: DateFns.addDays(new Date, 5)
				}))

				var res = yield this.request("/initiatives/" + initiative.id)
				res.statusCode.must.equal(200)

				res.body.must.include(tHtml("initiative_page.discussion_header.title"))
				res.body.must.include(t("DISCUSSION_DEADLINE"))

				var dom = parseHtml(res.body)
				demand(dom.querySelector("#initiative-phases")).be.null()
			})

			it("must render initiative for parliament in edit phase", function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					destination: "parliament",
					created_at: new Date,
					published_at: new Date,
					discussion_ends_at: DateFns.addDays(new Date, 5)
				}))

				var res = yield this.request("/initiatives/" + initiative.id)
				res.statusCode.must.equal(200)

				res.body.must.include(tHtml("initiative_page.discussion_header.title"))
				res.body.must.include(t("DISCUSSION_DEADLINE"))

				var dom = parseHtml(res.body)
				var phases = queryPhases(dom)

				_.sum(_.map(phases, "past")).must.equal(0)
				_.sum(_.map(phases, "current")).must.equal(1)
				phases.edit.current.must.be.true()
				phases.must.not.have.property("government")

				phases.edit.text.must.equal(
					t("TXT_DEADLINE_CALENDAR_DAYS_LEFT", {numberOfDaysLeft: 6})
				)
			})

			it("must render initiative for local in edit phase", function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					destination: "muhu-vald",
					created_at: new Date,
					published_at: new Date,
					discussion_ends_at: DateFns.addDays(new Date, 5)
				}))

				var res = yield this.request("/initiatives/" + initiative.id)
				res.statusCode.must.equal(200)

				res.body.must.include(tHtml("initiative_page.discussion_header.title"))
				res.body.must.include(t("DISCUSSION_DEADLINE"))

				var dom = parseHtml(res.body)
				var phases = queryPhases(dom)

				_.sum(_.map(phases, "past")).must.equal(0)
				_.sum(_.map(phases, "current")).must.equal(1)
				phases.edit.current.must.be.true()
				phases.must.not.have.property("parliament")
				phases.must.have.property("government")

				phases.edit.text.must.equal(
					t("TXT_DEADLINE_CALENDAR_DAYS_LEFT", {numberOfDaysLeft: 6})
				)
			})

			it("must render archived initiative in edit phase", function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "edit",
					archived_at: new Date,
					published_at: new Date
				}))

				var res = yield this.request("/initiatives/" + initiative.id)
				res.statusCode.must.equal(200)
				res.body.must.not.include(tHtml("initiative_page.discussion_header.title"))
			})

			it("must render initiative in edit phase that has ended", function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					destination: "parliament",
					published_at: new Date,
					discussion_ends_at: new Date
				}))

				var res = yield this.request("/initiatives/" + initiative.id)
				res.statusCode.must.equal(200)

				var dom = parseHtml(res.body)
				var phases = queryPhases(dom)
				phases.edit.current.must.be.true()
				phases.edit.text.must.equal(t("DISCUSSION_FINISHED"))
			})

			it("must render initiative in sign phase", function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "sign",
					created_at: DateFns.addDays(new Date, -3),
					signing_started_at: DateFns.addDays(new Date, -1),
					signing_ends_at: DateFns.addDays(new Date, 1)
				}))

				citizenosSignaturesDb.create(_.times(
					Math.ceil(Config.votesRequired / 4),
					() => new ValidCitizenosSignature({initiative_uuid: initiative.uuid})
				))

				signaturesDb.create(_.times(Config.votesRequired / 4, () => (
					new ValidSignature({initiative_uuid: initiative.uuid})
				)))

				var res = yield this.request("/initiatives/" + initiative.id)
				res.statusCode.must.equal(200)
				res.body.must.not.include(tHtml("initiative_page.discussion_header.title"))
				res.body.must.not.include(tHtml("VOTING_SUCCEEDED"))
				res.body.must.not.include(tHtml("VOTING_SUCCEEDED_ON_LOCAL_LEVEL"))

				res.body.must.not.include(t("VOTING_FAILED", {
					signatureCount: Config.votesRequired,
				}))

				var dom = parseHtml(res.body)
				var phases = queryPhases(dom)

				_.sum(_.map(phases, "past")).must.equal(1)
				_.sum(_.map(phases, "current")).must.equal(1)
				phases.edit.past.must.be.true()
				phases.sign.current.must.be.true()
				phases.must.not.have.property("government")

				phases.edit.text.must.equal(I18n.formatDateSpan(
					"numeric",
					initiative.published_at,
					initiative.signing_started_at
				))

				phases.sign.text.must.equal(t("N_SIGNATURES", {
					votes: Config.votesRequired / 2
				}))
			})

			it("must escape CSRF token when rendering <script> for signing",
				function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "sign",
					signing_ends_at: DateFns.addDays(new Date, 1)
				}))

				var res = yield this.request("/initiatives/" + initiative.id, {
					cookies: {csrf_token: "</script><script>alert(42)"}
				})

				res.statusCode.must.equal(200)
				res.body.must.include("<\\/script><script>alert(42)")
			})

			it("must render initiative in sign phase with signature milestones",
				function*() {
				var milestones = [1, Config.votesRequired / 2, Config.votesRequired]

				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "sign",
					signature_milestones: {
						[milestones[0]]: DateFns.addDays(new Date, -5),
						[milestones[1]]: DateFns.addDays(new Date, -3),
						[milestones[2]]: DateFns.addDays(new Date, -1)
					}
				}))

				citizenosSignaturesDb.create(_.times(
					Config.votesRequired / 2,
					() => new ValidCitizenosSignature({initiative_uuid: initiative.uuid})
				))

				signaturesDb.create(_.times(Config.votesRequired / 3, () => (
					new ValidSignature({initiative_uuid: initiative.uuid})
				)))

				var res = yield this.request("/initiatives/" + initiative.id)
				res.statusCode.must.equal(200)

				var events = queryEvents(parseHtml(res.body))
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

			it("must render initiative for parliament in sign phase that failed",
				function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "sign",
					signing_ends_at: new Date
				}))

				var signatureCount = Config.votesRequired - 1

				citizenosSignaturesDb.create(new ValidCitizenosSignature({
					initiative_uuid: initiative.uuid
				}))

				signaturesDb.create(_.times(signatureCount - 1, () => (
					new ValidSignature({initiative_uuid: initiative.uuid})
				)))

				var res = yield this.request("/initiatives/" + initiative.id)
				res.statusCode.must.equal(200)

				res.body.must.include(t("VOTING_FAILED", {
					signatureCount: Config.votesRequired
				}))

				res.body.must.include(t("N_SIGNATURES_FAILED", {votes: signatureCount}))

				var dom = parseHtml(res.body)
				var phases = queryPhases(dom)

				_.sum(_.map(phases, "past")).must.equal(1)
				_.sum(_.map(phases, "current")).must.equal(1)
				phases.edit.past.must.be.true()
				phases.sign.current.must.be.true()
				phases.sign.text.must.equal(t("N_SIGNATURES", {votes: signatureCount}))
			})

			it("must render initiative for parliament in sign phase that failed and expired", function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "sign",
					signing_ends_at: new Date,
					signing_expired_at: new Date
				}))

				signaturesDb.create(_.times(Config.votesRequired - 1, () => (
					new ValidSignature({initiative_uuid: initiative.uuid})
				)))

				var res = yield this.request("/initiatives/" + initiative.id)
				res.statusCode.must.equal(200)

				res.body.must.include(t("VOTING_FAILED_AND_EXPIRED", {
					signatureCount: Config.votesRequired
				}))
			})

			it("must render initiative for parliament in sign phase that failed and expired with saved signature threshold",
				function*() {
				var signatureThreshold = Config.votesRequired + 10

				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "sign",
					signing_ends_at: new Date,
					signing_expired_at: new Date,
					signature_threshold: signatureThreshold,
					signature_threshold_at: new Date
				}))

				var signatureCount = signatureThreshold - 1

				signaturesDb.create(_.times(signatureCount, () => (
					new ValidSignature({initiative_uuid: initiative.uuid})
				)))

				var res = yield this.request("/initiatives/" + initiative.id)
				res.statusCode.must.equal(200)

				res.body.must.include(t("VOTING_FAILED_AND_EXPIRED", {
					signatureCount: signatureThreshold
				}))

				res.body.must.include(t("N_SIGNATURES_FAILED", {votes: signatureCount}))
			})

			it("must render initiative for local in sign phase that failed",
				function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "sign",
					destination: "muhu-vald",
					signing_ends_at: new Date
				}))

				var {signatureThreshold} = LOCAL_GOVERNMENTS["muhu-vald"]
				var signatureCount = signatureThreshold - 1

				citizenosSignaturesDb.create(new ValidCitizenosSignature({
					initiative_uuid: initiative.uuid
				}))

				signaturesDb.create(_.times(signatureCount - 1, () => (
					new ValidSignature({initiative_uuid: initiative.uuid})
				)))

				var res = yield this.request("/initiatives/" + initiative.id)
				res.statusCode.must.equal(200)

				res.body.must.include(t("VOTING_FAILED_ON_LOCAL_LEVEL", {
					signatureCount: signatureThreshold
				}))

				res.body.must.include(t("N_SIGNATURES_FAILED", {votes: signatureCount}))

				var dom = parseHtml(res.body)
				var phases = queryPhases(dom)

				_.sum(_.map(phases, "past")).must.equal(1)
				_.sum(_.map(phases, "current")).must.equal(1)
				phases.edit.past.must.be.true()
				phases.sign.current.must.be.true()
				phases.sign.text.must.equal(t("N_SIGNATURES", {votes: signatureCount}))
			})

			it("must render initiative for local in sign phase that failed and expired", function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "sign",
					destination: "muhu-vald",
					signing_ends_at: new Date,
					signing_expired_at: new Date
				}))

				var {signatureThreshold} = LOCAL_GOVERNMENTS["muhu-vald"]

				signaturesDb.create(_.times(signatureThreshold - 1, () => (
					new ValidSignature({initiative_uuid: initiative.uuid})
				)))

				var res = yield this.request("/initiatives/" + initiative.id)
				res.statusCode.must.equal(200)

				res.body.must.include(t("VOTING_FAILED_AND_EXPIRED_ON_LOCAL_LEVEL", {
					signatureCount: signatureThreshold
				}))
			})

			it("must render initiative for local in sign phase that failed and expired with saved signature threshold", function*() {
				var signatureThreshold =
					LOCAL_GOVERNMENTS["muhu-vald"].signatureThreshold + 10

				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "sign",
					destination: "muhu-vald",
					signing_ends_at: new Date,
					signing_expired_at: new Date,
					signature_threshold: signatureThreshold,
					signature_threshold_at: new Date
				}))

				signaturesDb.create(_.times(signatureThreshold - 1, () => (
					new ValidSignature({initiative_uuid: initiative.uuid})
				)))

				var res = yield this.request("/initiatives/" + initiative.id)
				res.statusCode.must.equal(200)

				res.body.must.include(t("VOTING_FAILED_AND_EXPIRED_ON_LOCAL_LEVEL", {
					signatureCount: signatureThreshold
				}))
			})

			it("must render archived initiative in sign phase that failed",
				function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "sign",
					archived_at: new Date,
					signing_ends_at: new Date
				}))

				var signatureCount = Config.votesRequired - 1

				citizenosSignaturesDb.create(new ValidCitizenosSignature({
					initiative_uuid: initiative.uuid
				}))

				signaturesDb.create(_.times(signatureCount - 1, () => (
					new ValidSignature({initiative_uuid: initiative.uuid})
				)))

				var res = yield this.request("/initiatives/" + initiative.id)
				res.statusCode.must.equal(200)

				res.body.must.include(t("VOTING_FAILED", {
					signatureCount: Config.votesRequired
				}))

				res.body.must.include(t("N_SIGNATURES_FAILED", {votes: signatureCount}))

				var dom = parseHtml(res.body)
				var phases = queryPhases(dom)

				_.sum(_.map(phases, "past")).must.equal(1)
				_.sum(_.map(phases, "current")).must.equal(1)
				phases.edit.past.must.be.true()
				phases.sign.current.must.be.true()
				phases.sign.text.must.equal(t("N_SIGNATURES", {votes: signatureCount}))
			})

			it("must render initiative for parliament in sign phase that succeeded",
				function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					destination: "parliament",
					phase: "sign",
					signing_ends_at: new Date
				}))

				citizenosSignaturesDb.create(_.times(
					Config.votesRequired / 2,
					() => new ValidCitizenosSignature({initiative_uuid: initiative.uuid})
				))

				signaturesDb.create(_.times(Config.votesRequired / 2, () => (
					new ValidSignature({initiative_uuid: initiative.uuid})
				)))

				var res = yield this.request("/initiatives/" + initiative.id)
				res.statusCode.must.equal(200)
				res.body.must.include(t("VOTING_SUCCEEDED"))

				var dom = parseHtml(res.body)
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

			it("must render initiative for parliament in sign phase that succeeded and expired",
				function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					destination: "parliament",
					phase: "sign",
					signing_ends_at: new Date,
					signing_expired_at: new Date
				}))

				signaturesDb.create(_.times(Config.votesRequired, () => (
					new ValidSignature({initiative_uuid: initiative.uuid})
				)))

				var res = yield this.request("/initiatives/" + initiative.id)
				res.statusCode.must.equal(200)
				res.body.must.include(t("VOTING_SUCCEEDED_AND_EXPIRED"))
			})

			it("must render initiative for local government in sign phase that succeeded",
				function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					destination: "muhu-vald",
					phase: "sign",
					signing_ends_at: new Date
				}))

				var {signatureThreshold} = LOCAL_GOVERNMENTS["muhu-vald"]

				signaturesDb.create(_.times(signatureThreshold, () => (
					new ValidSignature({initiative_uuid: initiative.uuid})
				)))

				var res = yield this.request("/initiatives/" + initiative.id)
				res.statusCode.must.equal(200)
				res.body.must.include(t("VOTING_SUCCEEDED_ON_LOCAL_LEVEL"))

				var dom = parseHtml(res.body)
				var phases = queryPhases(dom)

				_.sum(_.map(phases, "past")).must.equal(1)
				_.sum(_.map(phases, "current")).must.equal(1)
				phases.edit.past.must.be.true()
				phases.sign.current.must.be.true()

				phases.sign.text.must.equal(t("N_SIGNATURES", {
					votes: signatureThreshold
				}))

				phases.must.have.property("government")
			})

			it("must render initiative for local government in sign phase that succeeded and expired",
				function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					destination: "muhu-vald",
					phase: "sign",
					signing_ends_at: new Date,
					signing_expired_at: new Date
				}))

				var {signatureThreshold} = LOCAL_GOVERNMENTS["muhu-vald"]

				signaturesDb.create(_.times(signatureThreshold, () => (
					new ValidSignature({initiative_uuid: initiative.uuid})
				)))

				var res = yield this.request("/initiatives/" + initiative.id)

				res.statusCode.must.equal(200)
				res.body.must.include(t("VOTING_SUCCEEDED_AND_EXPIRED_ON_LOCAL_LEVEL"))
			})

			it("must render initiative in sign phase with paper signatures",
				function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "sign",
					has_paper_signatures: true,
					signing_ends_at: DateFns.addDays(new Date, 1)
				}))

				citizenosSignaturesDb.create(new ValidCitizenosSignature({
					initiative_uuid: initiative.uuid
				}))

				signaturesDb.create(new ValidSignature({
					initiative_uuid: initiative.uuid
				}))

				var res = yield this.request("/initiatives/" + initiative.id)
				res.statusCode.must.equal(200)

				var dom = parseHtml(res.body)
				var phases = queryPhases(dom)

				_.sum(_.map(phases, "past")).must.equal(1)
				_.sum(_.map(phases, "current")).must.equal(1)
				phases.edit.past.must.be.true()
				phases.sign.current.must.be.true()
				phases.sign.text.must.equal(t("N_SIGNATURES_WITH_PAPER", {votes: 2}))
				phases.must.not.have.property("government")
			})

			it("must render initiative in parliament and not received", function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "parliament",
					sent_to_parliament_at: DateFns.addDays(new Date, -5)
				}))

				citizenosSignaturesDb.create(_.times(
					Config.votesRequired / 2,
					() => new ValidCitizenosSignature({initiative_uuid: initiative.uuid})
				))

				signaturesDb.create(_.times(Config.votesRequired / 2, () => (
					new ValidSignature({initiative_uuid: initiative.uuid})
				)))

				var res = yield this.request("/initiatives/" + initiative.id)
				res.statusCode.must.equal(200)
				res.body.must.include(tHtml("INITIATIVE_IN_PARLIAMENT"))

				var dom = parseHtml(res.body)
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
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "parliament",
					sent_to_parliament_at: DateFns.addDays(new Date, -6),
					received_by_parliament_at: DateFns.addDays(new Date, -5),
					parliament_committee: "Keskkonnakomisjon"
				}))

				citizenosSignaturesDb.create(_.times(
					Config.votesRequired / 2,
					() => new ValidCitizenosSignature({initiative_uuid: initiative.uuid})
				))

				signaturesDb.create(_.times(Config.votesRequired / 2, () => (
					new ValidSignature({initiative_uuid: initiative.uuid})
				)))

				var res = yield this.request("/initiatives/" + initiative.id)
				res.statusCode.must.equal(200)
				res.body.must.include(tHtml("INITIATIVE_IN_PARLIAMENT"))

				var dom = parseHtml(res.body)
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
				var initiative = initiativesDb.create(new ValidInitiative({
					phase: "parliament",
					external: true
				}))

				var event = eventsDb.create(new ValidEvent({
					initiative_uuid: initiative.uuid,
					created_at: pseudoDateTime(),
					updated_at: pseudoDateTime(),
					occurred_at: pseudoDateTime(),
					type: "parliament-received",
					origin: "parliament"
				}))

				var res = yield this.request("/initiatives/" + initiative.id)
				res.statusCode.must.equal(200)

				var events = queryEvents(parseHtml(res.body))
				events.length.must.equal(1)

				events[0].id.must.equal(String(event.id))
				events[0].phase.must.equal("parliament")
				events[0].at.must.eql(event.occurred_at)
				events[0].title.must.equal(t("PARLIAMENT_RECEIVED"))
				events[0].content.length.must.equal(0)
			})

			it("must render initiative in parliament and accepted event",
				function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					phase: "parliament",
					external: true
				}))

				var event = eventsDb.create(new ValidEvent({
					initiative_uuid: initiative.uuid,
					created_at: pseudoDateTime(),
					updated_at: pseudoDateTime(),
					occurred_at: pseudoDateTime(),
					type: "parliament-accepted",
					content: {committee: "Keskkonnakomisjon"},
					origin: "parliament"
				}))

				var res = yield this.request("/initiatives/" + initiative.id)
				res.statusCode.must.equal(200)

				var events = queryEvents(parseHtml(res.body))
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
				var initiative = initiativesDb.create(new ValidInitiative({
					phase: "parliament",
					external: true
				}))

				var event = eventsDb.create(new ValidEvent({
					initiative_uuid: initiative.uuid,
					created_at: pseudoDateTime(),
					updated_at: pseudoDateTime(),
					occurred_at: pseudoDateTime(),
					type: "parliament-board-meeting",
					content: {},
					origin: "parliament"
				}))

				var res = yield this.request("/initiatives/" + initiative.id)
				res.statusCode.must.equal(200)

				var events = queryEvents(parseHtml(res.body))
				events.length.must.equal(1)

				events[0].id.must.equal(String(event.id))
				events[0].phase.must.equal("parliament")
				events[0].at.must.eql(event.occurred_at)
				events[0].title.must.equal(t("PARLIAMENT_BOARD_MEETING"))
				events[0].content.length.must.equal(0)
			})

			it("must render initiative in parliament and committee meeting event", function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					phase: "parliament",
					external: true
				}))

				var event = eventsDb.create(new ValidEvent({
					initiative_uuid: initiative.uuid,
					created_at: pseudoDateTime(),
					updated_at: pseudoDateTime(),
					occurred_at: pseudoDateTime(),
					type: "parliament-committee-meeting",
					content: {committee: "Keskkonnakomisjon"},
					origin: "parliament"
				}))

				var res = yield this.request("/initiatives/" + initiative.id)
				res.statusCode.must.equal(200)

				var events = queryEvents(parseHtml(res.body))
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
					var initiative = initiativesDb.create(new ValidInitiative({
						phase: "parliament",
						external: true
					}))

					var event = eventsDb.create(new ValidEvent({
						initiative_uuid: initiative.uuid,
						created_at: pseudoDateTime(),
						updated_at: pseudoDateTime(),
						occurred_at: pseudoDateTime(),
						type: "parliament-committee-meeting",
						content: {committee: "Keskkonnakomisjon", decision: decision},
						origin: "parliament"
					}))

					var res = yield this.request("/initiatives/" + initiative.id)
					res.statusCode.must.equal(200)

					var events = queryEvents(parseHtml(res.body))
					events.length.must.equal(1)

					events[0].id.must.equal(String(event.id))
					events[0].phase.must.equal("parliament")
					events[0].at.must.eql(event.occurred_at)

					events[0].title.must.equal(t("PARLIAMENT_COMMITTEE_MEETING_BY", {
						committee: "Keskkonnakomisjon"
					}))

					events[0].content[0].textContent.must.equal(
						PARLIAMENT_MEETING_DECISION_TEXTS[decision] || null
					)
				})
			})

			it("must render initiative in parliament and committee meeting event with links", function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					phase: "parliament",
					external: true
				}))

				var event = eventsDb.create(new ValidEvent({
					initiative_uuid: initiative.uuid,
					created_at: pseudoDateTime(),
					updated_at: pseudoDateTime(),
					occurred_at: pseudoDateTime(),
					type: "parliament-committee-meeting",
					origin: "parliament",

					content: {
						links: [
							{title: "Stenogramm", url: "https://stenogrammid.riigikogu.ee"},
							{title: "Riigikogu istung", url: "https://www.youtube.com"}
						]
					}
				}))

				var res = yield this.request("/initiatives/" + initiative.id)
				res.statusCode.must.equal(200)

				var events = queryEvents(parseHtml(res.body))
				events.length.must.equal(1)

				events[0].id.must.equal(String(event.id))
				events[0].phase.must.equal("parliament")
				events[0].at.must.eql(event.occurred_at)
				events[0].title.must.equal(t("PARLIAMENT_COMMITTEE_MEETING"))

				events[0].content[0].textContent.must.equal(
					_.map(event.content.links, "title").join("")
				)
			})

			it("must render initiative in parliament and committee meeting event with summary", function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					phase: "parliament",
					external: true
				}))

				var event = eventsDb.create(new ValidEvent({
					initiative_uuid: initiative.uuid,
					created_at: pseudoDateTime(),
					updated_at: pseudoDateTime(),
					occurred_at: pseudoDateTime(),
					type: "parliament-committee-meeting",
					content: {summary: "Talks happened."},
					origin: "parliament"
				}))

				var res = yield this.request("/initiatives/" + initiative.id)
				res.statusCode.must.equal(200)

				var events = queryEvents(parseHtml(res.body))
				events.length.must.equal(1)

				events[0].id.must.equal(String(event.id))
				events[0].phase.must.equal("parliament")
				events[0].at.must.eql(event.occurred_at)
				events[0].title.must.equal(t("PARLIAMENT_COMMITTEE_MEETING"))
				events[0].content[0].textContent.must.equal("Talks happened.")
			})

			it("must render initiative in parliament and plenary meeting event",
				function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					phase: "parliament",
					external: true
				}))

				var event = eventsDb.create(new ValidEvent({
					initiative_uuid: initiative.uuid,
					created_at: pseudoDateTime(),
					updated_at: pseudoDateTime(),
					occurred_at: pseudoDateTime(),
					type: "parliament-plenary-meeting",
					origin: "parliament",
					content: {},
				}))

				var res = yield this.request("/initiatives/" + initiative.id)
				res.statusCode.must.equal(200)

				var events = queryEvents(parseHtml(res.body))
				events.length.must.equal(1)

				events[0].id.must.equal(String(event.id))
				events[0].phase.must.equal("parliament")
				events[0].at.must.eql(event.occurred_at)
				events[0].title.must.equal(t("PARLIAMENT_PLENARY_MEETING"))
				events[0].content.length.must.equal(0)
			})

			it("must render initiative in parliament and plenary meeting event with links", function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					phase: "parliament",
					external: true
				}))

				var event = eventsDb.create(new ValidEvent({
					initiative_uuid: initiative.uuid,
					created_at: pseudoDateTime(),
					updated_at: pseudoDateTime(),
					occurred_at: pseudoDateTime(),
					type: "parliament-plenary-meeting",
					origin: "parliament",

					content: {
						links: [
							{title: "Stenogramm", url: "https://stenogrammid.riigikogu.ee"},
							{title: "Riigikogu istung", url: "https://www.youtube.com"}
						]
					},
				}))

				var res = yield this.request("/initiatives/" + initiative.id)
				res.statusCode.must.equal(200)

				var events = queryEvents(parseHtml(res.body))
				events.length.must.equal(1)

				events[0].id.must.equal(String(event.id))
				events[0].phase.must.equal("parliament")
				events[0].at.must.eql(event.occurred_at)
				events[0].title.must.equal(t("PARLIAMENT_PLENARY_MEETING"))

				events[0].content[0].textContent.must.equal(
					_.map(event.content.links, "title").join("")
				)
			})

			it("must render initiative in parliament and plenary meeting event with summary", function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					phase: "parliament",
					external: true
				}))

				var event = eventsDb.create(new ValidEvent({
					initiative_uuid: initiative.uuid,
					created_at: pseudoDateTime(),
					updated_at: pseudoDateTime(),
					occurred_at: pseudoDateTime(),
					type: "parliament-plenary-meeting",
					content: {summary: "Talks happened."},
					origin: "parliament"
				}))

				var res = yield this.request("/initiatives/" + initiative.id)
				res.statusCode.must.equal(200)

				var events = queryEvents(parseHtml(res.body))
				events.length.must.equal(1)

				events[0].id.must.equal(String(event.id))
				events[0].phase.must.equal("parliament")
				events[0].at.must.eql(event.occurred_at)
				events[0].title.must.equal(t("PARLIAMENT_PLENARY_MEETING"))
				events[0].content[0].textContent.must.equal("Talks happened.")
			})

			it("must render initiative in parliament and decision event",
				function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					phase: "parliament",
					external: true
				}))

				var event = eventsDb.create(new ValidEvent({
					initiative_uuid: initiative.uuid,
					created_at: pseudoDateTime(),
					updated_at: pseudoDateTime(),
					occurred_at: pseudoDateTime(),
					type: "parliament-decision",
					content: {},
					origin: "parliament"
				}))

				var res = yield this.request("/initiatives/" + initiative.id)
				res.statusCode.must.equal(200)

				var events = queryEvents(parseHtml(res.body))
				events.length.must.equal(1)

				events[0].id.must.equal(String(event.id))
				events[0].phase.must.equal("parliament")
				events[0].at.must.eql(event.occurred_at)
				events[0].title.must.equal(t("PARLIAMENT_DECISION"))
				events[0].content.length.must.equal(0)
			})

			it("must render initiative in parliament and decision event with summary", function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					phase: "parliament",
					external: true
				}))

				var event = eventsDb.create(new ValidEvent({
					initiative_uuid: initiative.uuid,
					created_at: pseudoDateTime(),
					updated_at: pseudoDateTime(),
					occurred_at: pseudoDateTime(),
					type: "parliament-decision",
					content: {summary: "Talks happened."},
					origin: "parliament"
				}))

				var res = yield this.request("/initiatives/" + initiative.id)
				res.statusCode.must.equal(200)

				var events = queryEvents(parseHtml(res.body))
				events.length.must.equal(1)

				events[0].id.must.equal(String(event.id))
				events[0].phase.must.equal("parliament")
				events[0].at.must.eql(event.occurred_at)
				events[0].title.must.equal(t("PARLIAMENT_DECISION"))
				events[0].content[0].textContent.must.equal("Talks happened.")
			})

			it("must render initiative in parliament and letter event", function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					phase: "parliament",
					external: true
				}))

				var event = eventsDb.create(new ValidEvent({
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

				var res = yield this.request("/initiatives/" + initiative.id)
				res.statusCode.must.equal(200)

				var events = queryEvents(parseHtml(res.body))
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
				var initiative = initiativesDb.create(new ValidInitiative({
					phase: "parliament",
					external: true
				}))

				var event = eventsDb.create(new ValidEvent({
					initiative_uuid: initiative.uuid,
					created_at: pseudoDateTime(),
					updated_at: pseudoDateTime(),
					occurred_at: pseudoDateTime(),
					origin: "parliament",
					type: "parliament-interpellation",
					content: {to: "John Wick", deadline: "2015-07-10"}
				}))

				var res = yield this.request("/initiatives/" + initiative.id)
				res.statusCode.must.equal(200)

				var events = queryEvents(parseHtml(res.body))
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
				var initiative = initiativesDb.create(new ValidInitiative({
					phase: "parliament",
					external: true
				}))

				var event = eventsDb.create(new ValidEvent({
					initiative_uuid: initiative.uuid,
					created_at: pseudoDateTime(),
					updated_at: pseudoDateTime(),
					occurred_at: pseudoDateTime(),
					origin: "parliament",
					type: "parliament-national-matter",
					content: {}
				}))

				var res = yield this.request("/initiatives/" + initiative.id)
				res.statusCode.must.equal(200)

				var events = queryEvents(parseHtml(res.body))
				events.length.must.equal(1)

				events[0].id.must.equal(String(event.id))
				events[0].phase.must.equal("parliament")
				events[0].at.must.eql(event.occurred_at)
				events[0].title.must.equal(t("PARLIAMENT_NATIONAL_MATTER"))
				events[0].content.length.must.equal(0)
			})

			it("must render initiative in parliament with acceptance deadline today", function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "parliament",
					sent_to_parliament_at: DateFns.addDays(new Date, -30)
				}))

				citizenosSignaturesDb.create(_.times(
					Config.votesRequired / 2,
					() => new ValidCitizenosSignature({initiative_uuid: initiative.uuid})
				))

				signaturesDb.create(_.times(Config.votesRequired / 2, () => (
					new ValidSignature({initiative_uuid: initiative.uuid})
				)))

				var res = yield this.request("/initiatives/" + initiative.id)
				res.statusCode.must.equal(200)

				var dom = parseHtml(res.body)
				var phases = queryPhases(dom)

				phases.parliament.text.must.equal(
					t("PARLIAMENT_PHASE_ACCEPTANCE_0_DAYS_LEFT")
				)
			})

			it("must render initiative in parliament with acceptance deadline past", function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "parliament",
					sent_to_parliament_at: DateFns.addDays(new Date, -35)
				}))

				citizenosSignaturesDb.create(_.times(
					Config.votesRequired / 2,
					() => new ValidCitizenosSignature({initiative_uuid: initiative.uuid})
				))

				signaturesDb.create(_.times(Config.votesRequired / 2, () => (
					new ValidSignature({initiative_uuid: initiative.uuid})
				)))

				var res = yield this.request("/initiatives/" + initiative.id)
				res.statusCode.must.equal(200)

				var dom = parseHtml(res.body)
				var phases = queryPhases(dom)

				phases.parliament.text.must.equal(
					t("PARLIAMENT_PHASE_ACCEPTANCE_N_DAYS_OVER", {days: 5})
				)
			})

			it("must render initiative in parliament with proceedings deadline in the future", function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "parliament",
					sent_to_parliament_at: DateFns.addDays(new Date, -35),
					accepted_by_parliament_at: DateFns.addDays(new Date, -5)
				}))

				citizenosSignaturesDb.create(_.times(
					Config.votesRequired / 2,
					() => new ValidCitizenosSignature({initiative_uuid: initiative.uuid})
				))

				signaturesDb.create(_.times(Config.votesRequired / 2, () => (
					new ValidSignature({initiative_uuid: initiative.uuid})
				)))

				var res = yield this.request("/initiatives/" + initiative.id)
				res.statusCode.must.equal(200)

				var dom = parseHtml(res.body)
				var phases = queryPhases(dom)

				var deadline = DateFns.addMonths(DateFns.addDays(new Date, -5), 6)
				var days = DateFns.differenceInCalendarDays(deadline, new Date)

				phases.parliament.text.must.equal(t("PARLIAMENT_PHASE_N_DAYS_LEFT", {
					days: days
				}))
			})

			it("must render initiative in parliament with proceedings deadline today", function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "parliament",
					sent_to_parliament_at: DateFns.addMonths(new Date, -7),
					accepted_by_parliament_at: DateFns.addMonths(new Date, -6)
				}))

				var res = yield this.request("/initiatives/" + initiative.id)
				res.statusCode.must.equal(200)

				var dom = parseHtml(res.body)
				var phases = queryPhases(dom)
				phases.parliament.text.must.equal(t("PARLIAMENT_PHASE_0_DAYS_LEFT"))
			})

			it("must render initiative in parliament with proceedings deadline past", function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "parliament",
					sent_to_parliament_at: DateFns.addMonths(new Date, -7),
					accepted_by_parliament_at:
						DateFns.addMonths(DateFns.addDays(new Date, -5), -6)
				}))

				var res = yield this.request("/initiatives/" + initiative.id)
				res.statusCode.must.equal(200)

				var dom = parseHtml(res.body)
				var phases = queryPhases(dom)
				phases.parliament.text.must.equal(t("PARLIAMENT_PHASE_N_DAYS_OVER", {
					days: 5
				}))
			})

			it("must render initiative in parliament that's finished", function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "parliament",
					sent_to_parliament_at: DateFns.addDays(new Date, -30),
					received_by_parliament_at: DateFns.addDays(new Date, -25),
					finished_in_parliament_at: DateFns.addDays(new Date, -5)
				}))

				var res = yield this.request("/initiatives/" + initiative.id)
				res.statusCode.must.equal(200)
				res.body.must.include(tHtml("INITIATIVE_IN_PARLIAMENT"))

				var dom = parseHtml(res.body)
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
					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: this.author.id,
						phase: "parliament",
						sent_to_parliament_at: DateFns.addDays(new Date, -30),
						parliament_decision: decision,
						finished_in_parliament_at: DateFns.addDays(new Date, -5)
					}))

					var res = yield this.request("/initiatives/" + initiative.id)
					res.statusCode.must.equal(200)
					res.body.must.include(tHtml("INITIATIVE_IN_PARLIAMENT"))

					var dom = parseHtml(res.body)
					var events = queryEvents(dom)
					events.length.must.equal(2)
					events[0].id.must.equal("sent-to-parliament")
					events[1].id.must.equal("parliament-finished")
					events[1].phase.must.equal("parliament")
					events[1].at.must.eql(initiative.finished_in_parliament_at)
					events[1].title.must.equal(t("PARLIAMENT_FINISHED"))

					events[1].content[0].textContent.must.equal(
						PARLIAMENT_DECISION_TEXTS[decision] || null
					)
				})

				it(`must render initiative in parliament and finished event with ${decision} decision`, function*() {
					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: this.author.id,
						phase: "parliament",
						sent_to_parliament_at: DateFns.addDays(new Date, -30),
						parliament_decision: decision,
						finished_in_parliament_at: DateFns.addDays(new Date, -5)
					}))

					var event = eventsDb.create(new ValidEvent({
						initiative_uuid: initiative.uuid,
						occurred_at: DateFns.addDays(new Date, -3),
						type: "parliament-finished",
						content: null,
						origin: "parliament"
					}))

					var res = yield this.request("/initiatives/" + initiative.id)
					res.statusCode.must.equal(200)
					res.body.must.include(tHtml("INITIATIVE_IN_PARLIAMENT"))

					var dom = parseHtml(res.body)
					var events = queryEvents(dom)
					events.length.must.equal(2)
					events[0].id.must.equal("sent-to-parliament")
					events[1].id.must.equal(String(event.id))
					events[1].phase.must.equal("parliament")
					events[1].at.must.eql(event.occurred_at)
					events[1].title.must.equal(t("PARLIAMENT_FINISHED"))

					events[1].content[0].textContent.must.equal(
						PARLIAMENT_DECISION_TEXTS[decision] || null
					)
				})
			})

			it("must render external initiative in parliament", function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					external: true,
					phase: "parliament",
					received_by_parliament_at: new Date
				}))

				var res = yield this.request("/initiatives/" + initiative.id)
				res.statusCode.must.equal(200)
				res.body.must.include(tHtml("INITIATIVE_IN_PARLIAMENT"))
			})

			it("must render initiative for parliament in government", function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "government",
					sent_to_parliament_at: DateFns.addDays(new Date, -30),
					received_by_parliament_at: DateFns.addDays(new Date, -25),
					finished_in_parliament_at: DateFns.addDays(new Date, -5),
					sent_to_government_at: new Date,
					government_agency: "Sidususministeerium"
				}))

				citizenosSignaturesDb.create(_.times(
					Config.votesRequired / 2,
					() => new ValidCitizenosSignature({initiative_uuid: initiative.uuid})
				))

				signaturesDb.create(_.times(Config.votesRequired / 2, () => (
					new ValidSignature({initiative_uuid: initiative.uuid})
				)))

				var res = yield this.request("/initiatives/" + initiative.id)
				res.statusCode.must.equal(200)
				res.body.must.include(tHtml("INITIATIVE_IN_GOVERNMENT"))

				res.body.must.include(t("INITIATIVE_IS_IN_GOVERNMENT_AGENCY", {
					agency: "Sidususministeerium"
				}))

				var dom = parseHtml(res.body)
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

			it("must render initiative for local in government", function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "government",
					destination: "muhu-vald",
					sent_to_government_at: new Date
				}))

				var {signatureThreshold} = LOCAL_GOVERNMENTS["muhu-vald"]

				signaturesDb.create(_.times(signatureThreshold, () => (
					new ValidSignature({initiative_uuid: initiative.uuid})
				)))

				var res = yield this.request("/initiatives/" + initiative.id)

				res.statusCode.must.equal(200)
				res.body.must.include(tHtml("INITIATIVE_IN_LOCAL_GOVERNMENT"))

				var dom = parseHtml(res.body)
				var phases = queryPhases(dom)

				_.sum(_.map(phases, "past")).must.equal(2)
				_.sum(_.map(phases, "current")).must.equal(1)
				phases.edit.past.must.be.true()
				phases.sign.past.must.be.true()
				phases.must.not.have.property("parliament")
				phases.government.current.must.be.true()

				phases.sign.text.must.equal(t("N_SIGNATURES", {
					votes: signatureThreshold
				}))

				phases.government.text.must.equal(
					I18n.formatDate("numeric", initiative.sent_to_government_at)
				)

				var events = queryEvents(dom)
				events.length.must.equal(1)
				events[0].id.must.equal("sent-to-government")
				events[0].phase.must.equal("government")
				events[0].at.must.eql(initiative.sent_to_government_at)
				events[0].title.must.equal(t("EVENT_SENT_TO_LOCAL_GOVERNMENT_TITLE"))
			})

			it("must render initiative in government with a contact", function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
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

				citizenosSignaturesDb.create(_.times(
					Config.votesRequired / 2,
					() => new ValidCitizenosSignature({initiative_uuid: initiative.uuid})
				))

				signaturesDb.create(_.times(Config.votesRequired / 2, () => (
					new ValidSignature({initiative_uuid: initiative.uuid})
				)))

				var res = yield this.request("/initiatives/" + initiative.id)
				res.statusCode.must.equal(200)
				res.body.must.include(t("GOVERNMENT_AGENCY_CONTACT"))
				res.body.must.include("John Smith")
				res.body.must.include("john@example.com")
			})

			it("must render initiative in government that's finished", function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
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

				var res = yield this.request("/initiatives/" + initiative.id)
				res.statusCode.must.equal(200)
				res.body.must.include(tHtml("INITIATIVE_IN_GOVERNMENT"))

				var dom = parseHtml(res.body)
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
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "government",
					sent_to_parliament_at: DateFns.addDays(new Date, -30),
					received_by_parliament_at: DateFns.addDays(new Date, -25),
					finished_in_parliament_at: DateFns.addDays(new Date, -5)
				}))

				var res = yield this.request("/initiatives/" + initiative.id)
				res.statusCode.must.equal(200)
				res.body.must.include(tHtml("INITIATIVE_IN_GOVERNMENT"))

				var dom = parseHtml(res.body)
				var phases = queryPhases(dom)

				_.sum(_.map(phases, "past")).must.equal(3)
				_.sum(_.map(phases, "current")).must.equal(1)
				phases.edit.past.must.be.true()
				phases.sign.past.must.be.true()
				phases.parliament.past.must.be.true()
				phases.government.current.must.be.true()
			})

			it("must render initiative in done phase", function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "done",
					sent_to_parliament_at: new Date
				}))

				var res = yield this.request("/initiatives/" + initiative.id)
				res.statusCode.must.equal(200)
				res.body.must.include(tHtml("INITIATIVE_PROCESSED"))

				var dom = parseHtml(res.body)
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
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "done",
					sent_to_parliament_at: new Date,
					sent_to_government_at: new Date,
					finished_in_government_at: new Date
				}))

				var res = yield this.request("/initiatives/" + initiative.id)
				res.statusCode.must.equal(200)
				res.body.must.include(tHtml("INITIATIVE_PROCESSED"))

				var dom = parseHtml(res.body)
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
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "done",
					sent_to_parliament_at: new Date,
					archived_at: new Date
				}))

				var res = yield this.request("/initiatives/" + initiative.id)
				res.statusCode.must.equal(200)
				res.body.must.include(tHtml("INITIATIVE_PROCESSED"))
				res.body.must.not.include(tHtml("VOTING_SUCCEEDED"))
				res.body.must.not.include(tHtml("VOTING_SUCCEEDED_ON_LOCAL_LEVEL"))

				res.body.must.not.include(t("VOTING_FAILED", {
					signatureCount: Config.votesRequired
				}))

				res.body.must.not.include(tHtml("VOTING_DEADLINE"))

				var dom = parseHtml(res.body)
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
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "done",
					sent_to_parliament_at: new Date,
					sent_to_government_at: new Date,
					archived_at: new Date
				}))

				var res = yield this.request("/initiatives/" + initiative.id)
				res.statusCode.must.equal(200)
				res.body.must.include(tHtml("INITIATIVE_PROCESSED"))

				var dom = parseHtml(res.body)
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

			it("must render initiative with media coverage event", function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					phase: "parliament",
					external: true
				}))

				var event = eventsDb.create(new ValidEvent({
					initiative_uuid: initiative.uuid,
					type: "media-coverage",
					title: "News at 11",
					content: {url: "http://example.com/article", publisher: "Newsbook"},
					created_at: pseudoDateTime(),
					occurred_at: pseudoDateTime()
				}))

				var res = yield this.request("/initiatives/" + initiative.id)
				res.statusCode.must.equal(200)

				var events = queryEvents(parseHtml(res.body))
				events.length.must.equal(1)

				events[0].id.must.equal(String(event.id))
				events[0].must.have.property("phase", null)
				events[0].author.must.equal("Newsbook")
				events[0].at.must.eql(event.occurred_at)
				events[0].title.must.equal("News at 11")
				events[0].content.length.must.equal(0)
			})

			it("must render initiative with text event", function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					phase: "parliament",
					external: true
				}))

				var author = usersDb.create(new ValidUser({name: "Johnny Lang"}))

				var event = eventsDb.create(new ValidEvent({
					initiative_uuid: initiative.uuid,
					user_id: author.id,
					title: "This just in.",
					content: "Everything is fine!",
					created_at: pseudoDateTime(),
					occurred_at: pseudoDateTime()
				}))

				var res = yield this.request("/initiatives/" + initiative.id)
				res.statusCode.must.equal(200)

				var events = queryEvents(parseHtml(res.body))
				events.length.must.equal(1)

				events[0].id.must.equal(String(event.id))
				events[0].must.have.property("phase", null)
				events[0].author.must.equal(author.name)
				events[0].at.must.eql(event.occurred_at)
				events[0].title.must.equal("This just in.")
				events[0].content[0].textContent.must.equal("Everything is fine!")
			})

			it("must render initiative events in logical order", function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					phase: "government",
					external: true,
					sent_to_parliament_at: new Date(2015, 5, 18, 13, 37),
					received_by_parliament_at: new Date(2015, 5, 18),
					finished_in_parliament_at: new Date(2015, 5, 16),
					sent_to_government_at: new Date(2015, 5, 15),
					finished_in_government_at: new Date(2015, 5, 14),
				}))

				var events = eventsDb.create([
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

				var res = yield this.request("/initiatives/" + initiative.id)
				res.statusCode.must.equal(200)

				queryEvents(parseHtml(res.body)).map((ev) => ev.id).must.eql([
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
					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: this.author.id,
						published_at: new Date
					}))

					subscriptionsDb.create(_.times(3, () => new ValidSubscription({
						initiative_uuid: initiative.uuid,
						confirmed_at: new Date,
						event_interest: true
					})))

					var res = yield this.request("/initiatives/" + initiative.id)
					res.statusCode.must.equal(200)

					var dom = parseHtml(res.body)
					var form = dom.querySelector(".initiative-subscribe-form")

					form.querySelector("p").innerHTML.must.equal(
						t("INITIATIVE_SUBSCRIBER_COUNT", {count: 3})
					)
				})

				it("must render initiatives subscriber count", function*() {
					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: this.author.id,
						published_at: new Date
					}))

					subscriptionsDb.create(_.times(3, () => new ValidSubscription({
						initiative_uuid: null,
						confirmed_at: new Date,
						event_interest: true
					})))

					var res = yield this.request("/initiatives/" + initiative.id)
					res.statusCode.must.equal(200)

					var dom = parseHtml(res.body)
					var form = dom.querySelector(".initiative-subscribe-form")

					form.querySelector("p").innerHTML.must.equal(
						t("INITIATIVE_SUBSCRIBER_COUNT_ALL", {allCount: 3})
					)
				})

				it("must render initiative and initiatives subscriber count",
					function*() {
					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: this.author.id,
						published_at: new Date
					}))

					subscriptionsDb.create(_.times(3, () => new ValidSubscription({
						initiative_uuid: initiative.uuid,
						confirmed_at: new Date,
						event_interest: true
					})))

					subscriptionsDb.create(_.times(5, () => new ValidSubscription({
						initiative_uuid: null,
						confirmed_at: new Date
					})))

					subscriptionsDb.create(new ValidSubscription({
						initiative_destination: "parliament",
						confirmed_at: new Date,
						event_interest: true
					}))

					var res = yield this.request("/initiatives/" + initiative.id)
					res.statusCode.must.equal(200)

					var dom = parseHtml(res.body)
					var form = dom.querySelector(".initiative-subscribe-form")

					form.querySelector("p").innerHTML.must.equal(
						t("INITIATIVE_SUBSCRIBER_COUNT_BOTH", {count: 3, allCount: 6})
					)
				})

				it("must not render subscriber counts if none", function*() {
					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: this.author.id,
						published_at: new Date
					}))

					var res = yield this.request("/initiatives/" + initiative.id)
					res.statusCode.must.equal(200)

					var dom = parseHtml(res.body)
					var form = dom.querySelector(".initiative-subscribe-form")
					demand(form.querySelector("p")).be.null()
				})
			})

			describe("comments", function() {
				it("must render initiative comments", function*() {
					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: this.author.id,
						published_at: new Date
					}))

					var author = usersDb.create(new ValidUser({
						name: "Johnny Lang"
					}))

					var replier = usersDb.create(new ValidUser({
						name: "Kenny Loggins"
					}))

					var comment = commentsDb.create(new ValidComment({
						initiative_uuid: initiative.uuid,
						user_id: author.id,
						user_uuid: _.serializeUuid(author.uuid)
					}))

					var reply = commentsDb.create(new ValidComment({
						initiative_uuid: initiative.uuid,
						user_id: replier.id,
						user_uuid: _.serializeUuid(replier.uuid),
						parent_id: comment.id
					}))

					var res = yield this.request("/initiatives/" + initiative.id)
					res.statusCode.must.equal(200)

					var dom = parseHtml(res.body)
					var commentsEl = dom.getElementById("initiative-comments")
					commentsEl.textContent.must.include(author.name)
					commentsEl.textContent.must.include(comment.title)
					commentsEl.textContent.must.include(comment.text)
					commentsEl.textContent.must.include(replier.name)
					commentsEl.textContent.must.include(reply.text)
				})

				it("must not render author names for anonymized comments", function*() {
					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: this.author.id,
						published_at: new Date
					}))

					var author = usersDb.create(new ValidUser({
						name: "Johnny Lang"
					}))

					var replier = usersDb.create(new ValidUser({
						name: "Kenny Loggins"
					}))

					var comment = commentsDb.create(new ValidComment({
						initiative_uuid: initiative.uuid,
						user_id: author.id,
						user_uuid: _.serializeUuid(author.uuid),
						anonymized_at: new Date
					}))

					commentsDb.create(new ValidComment({
						initiative_uuid: initiative.uuid,
						user_id: replier.id,
						user_uuid: _.serializeUuid(replier.uuid),
						parent_id: comment.id,
						anonymized_at: new Date
					}))

					var res = yield this.request("/initiatives/" + initiative.id)
					res.statusCode.must.equal(200)
					res.body.must.not.include(author.name)
					res.body.must.not.include(replier.name)
				})

				it("must not render comments from other initiatives", function*() {
					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: this.author.id,
						published_at: new Date
					}))

					var other = initiativesDb.create(new ValidInitiative({
						user_id: this.author.id
					}))

					var author = usersDb.create(new ValidUser)

					var comment = commentsDb.create(new ValidComment({
						initiative_uuid: other.uuid,
						user_id: author.id,
						user_uuid: _.serializeUuid(author.uuid)
					}))

					var res = yield this.request("/initiatives/" + initiative.id)
					res.statusCode.must.equal(200)

					var dom = parseHtml(res.body)
					var commentsEl = dom.getElementById("initiative-comments")
					commentsEl.textContent.must.not.include(comment.text)
				})
			})

			// This was a bug noticed on Mar 24, 2017 where the UI translation strings
			// were not rendered on the page. They were used only for ID-card errors.
			it("must render UI strings when voting", function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "sign",
					signing_ends_at: DateFns.addDays(new Date, 1)
				}))

				var res = yield this.request("/initiatives/" + initiative.id)
				res.statusCode.must.equal(200)
				res.body.must.include("NO_CERTIFICATES")
			})

			it("must not show thanks if not signed", function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "sign",
					signing_ends_at: DateFns.addDays(new Date, 1)
				}))

				var res = yield this.request("/initiatives/" + initiative.id)
				res.statusCode.must.equal(200)
				res.body.must.not.include(t("THANKS_FOR_SIGNING"))
				res.body.must.not.include(t("THANKS_FOR_SIGNING_AGAIN"))
				res.body.must.not.include("donate-form")
			})

			it("must render initiative without destination", function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "edit",
					destination: null,
					published_at: new Date
				}))

				var res = yield this.request("/initiatives/" + initiative.id)
				res.statusCode.must.equal(200)
			})

			it("must render initiative destined for parliament", function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "edit",
					destination: null,
					published_at: new Date
				}))

				var res = yield this.request("/initiatives/" + initiative.id)
				res.statusCode.must.equal(200)
			})

			Object.keys(LOCAL_GOVERNMENTS).forEach(function(dest) {
				it(`must render initiative destined for ${dest}`, function*() {
					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: this.author.id,
						phase: "sign",
						destination: dest,
						published_at: new Date
					}))

					var res = yield this.request("/initiatives/" + initiative.id)
					res.statusCode.must.equal(200)
				})
			})
		})

		describe("when logged in", function() {
			require("root/test/fixtures").user()

			it("must render unpublished initiative if creator", function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.user.id
				}))

				var res = yield this.request("/initiatives/" + initiative.id)
				res.statusCode.must.equal(200)
			})

			it("must render unpublished initiative if coauthor", function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.author.id
				}))

				coauthorsDb.create(new ValidCoauthor({
					initiative: initiative,
					user: this.user,
					status: "accepted"
				}))

				var res = yield this.request("/initiatives/" + initiative.id)
				res.statusCode.must.equal(200)
			})

			it("must respond with 403 for unpublished discussion of other user",
				function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					published_at: null
				}))

				var res = yield this.request("/initiatives/" + initiative.id)
				res.statusCode.must.equal(403)
				res.statusMessage.must.equal("Initiative Not Public")
			})

			it(`must render invitation page for unpublished discussion if pending coauthor`, function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					published_at: null
				}))

				coauthorsDb.create(new ValidCoauthor({
					initiative: initiative,
					country: this.user.country,
					personal_id: this.user.personal_id,
					status: "pending"
				}))

				var res = yield this.request("/initiatives/" + initiative.id)
				res.statusCode.must.equal(403)
				res.statusMessage.must.equal("Accept Invitation")
				res.body.must.include(t("USER_PAGE_COAUTHOR_INVITATION_DESCRIPTION"))
			})

			_.without(
				COAUTHOR_STATUSES,
				"accepted",
				"pending"
			).forEach(function(status) {
				it(`must respond with 403 for unpublished discussion if ${status} coauthor`, function*() {
					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: this.author.id,
						published_at: null
					}))

					coauthorsDb.create(new ValidCoauthor({
						initiative: initiative,
						user: this.user,
						status: status
					}))

					var res = yield this.request("/initiatives/" + initiative.id)
					res.statusCode.must.equal(403)
					res.statusMessage.must.equal("Initiative Not Public")
				})
			})

			it("must render coauthor invitation form if pending coauthor",
				function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					published_at: new Date
				}))

				coauthorsDb.create(new ValidCoauthor({
					initiative: initiative,
					country: this.user.country,
					personal_id: this.user.personal_id,
					status: "pending"
				}))

				var res = yield this.request("/initiatives/" + initiative.id)
				res.statusCode.must.equal(200)

				var dom = parseHtml(res.body)
				var el = dom.getElementById("coauthor-invitation")

				el.textContent.must.include(
					t("INITIATIVE_COAUTHOR_INVITATION_PAGE_TITLE")
				)

				el.textContent.must.include(
					t("USER_PAGE_COAUTHOR_INVITATION_DESCRIPTION")
				)
			})

			it("must not render coauthor invitation form if accepted", function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					published_at: null
				}))

				coauthorsDb.create(new ValidCoauthor({
					initiative: initiative,
					user: this.user,
					status: "accepted"
				}))

				var res = yield this.request("/initiatives/" + initiative.id)
				var dom = parseHtml(res.body)
				demand(dom.getElementById("coauthor-invitation")).be.null()
			})

			_.without(
				COAUTHOR_STATUSES,
				"accepted",
				"pending"
			).forEach(function(status) {
				it(`must not render coauthor invitation form if ${status}`, function*() {
					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: this.author.id,
						published_at: null
					}))

					coauthorsDb.create(new ValidCoauthor({
						initiative: initiative,
						user: this.user,
						status: status
					}))

					var res = yield this.request("/initiatives/" + initiative.id)
					var dom = parseHtml(res.body)
					demand(dom.getElementById("coauthor-invitation")).be.null()
				})
			})

			it("must render initiative in edit phase", function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					destination: "parliament",
					created_at: new Date,
					published_at: new Date,
					discussion_ends_at: DateFns.addDays(new Date, 5)
				}))

				var res = yield this.request("/initiatives/" + initiative.id)
				res.statusCode.must.equal(200)

				res.body.must.include(tHtml("initiative_page.discussion_header.title"))
				res.body.must.include(t("DISCUSSION_DEADLINE"))

				var dom = parseHtml(res.body)
				var phases = queryPhases(dom)

				_.sum(_.map(phases, "past")).must.equal(0)
				_.sum(_.map(phases, "current")).must.equal(1)
				phases.edit.current.must.be.true()
				phases.must.not.have.property("government")

				phases.edit.text.must.equal(
					t("TXT_DEADLINE_CALENDAR_DAYS_LEFT", {numberOfDaysLeft: 6})
				)
			})

			describe("given texts", function() {
				;["edit", "sign"].forEach(function(phase) {
					it(`must render latest translation in ${phase} phase when author`,
						function*() {
						var initiative = initiativesDb.create(new ValidInitiative({
							user_id: this.user.id,
							phase,
							language: "et",
							published_at: new Date
						}))

						var estonian = textsDb.create(new ValidText({
							initiative_uuid: initiative.uuid,
							user_id: initiative.user_id,
							language: "et",
							content: "Tere, maailm!",
							content_type: "text/html"
						}))

						var older = textsDb.create(new ValidText({
							initiative_uuid: initiative.uuid,
							user_id: initiative.user_id,
							language: "en",
							content: "Good hello, world!",
							content_type: "text/html"
						}))

						var newer = textsDb.create(new ValidText({
							initiative_uuid: initiative.uuid,
							user_id: initiative.user_id,
							language: "en",
							content: "Hello, world!",
							content_type: "text/html"
						}))

						var initiativePath = "/initiatives/" + initiative.id
						var res = yield this.request(initiativePath + "?language=en")
						res.statusCode.must.equal(200)

						var dom = parseHtml(res.body)
						var headerEl = dom.querySelector("#initiative-header")
						var textEl = dom.querySelector("article.text")
						headerEl.textContent.must.not.include(estonian.title)
						textEl.textContent.must.not.include(estonian.content)
						headerEl.textContent.must.not.include(older.title)
						textEl.textContent.must.not.include(older.content)
						headerEl.textContent.must.include(newer.title)
						textEl.textContent.must.include(newer.content)
					})

					it(`must render latest translation in ${phase} phase when not author`,
						function*() {
						var initiative = initiativesDb.create(new ValidInitiative({
							user_id: this.author.id,
							phase,
							language: "et",
							published_at: new Date
						}))

						var estonian = textsDb.create(new ValidText({
							initiative_uuid: initiative.uuid,
							user_id: initiative.user_id,
							language: "et",
							content: "Tere, maailm!",
							content_type: "text/html"
						}))

						var older = textsDb.create(new ValidText({
							initiative_uuid: initiative.uuid,
							user_id: initiative.user_id,
							language: "en",
							content: "Good hello, world!",
							content_type: "text/html"
						}))

						var newer = textsDb.create(new ValidText({
							initiative_uuid: initiative.uuid,
							user_id: initiative.user_id,
							language: "en",
							content: "Hello, world!",
							content_type: "text/html"
						}))

						var initiativePath = "/initiatives/" + initiative.id
						var res = yield this.request(initiativePath + "?language=en")
						res.statusCode.must.equal(200)

						var dom = parseHtml(res.body)
						var headerEl = dom.querySelector("#initiative-header")
						var textEl = dom.querySelector("article.text")
						headerEl.textContent.must.not.include(estonian.title)
						textEl.textContent.must.not.include(estonian.content)
						headerEl.textContent.must.not.include(older.title)
						textEl.textContent.must.not.include(older.content)
						headerEl.textContent.must.include(newer.title)
						textEl.textContent.must.include(newer.content)
					})
				})

				it("must render missing translation when author", function*() {
					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: this.user.id,
						phase: "edit",
						title: "Hello, world!",
						published_at: new Date
					}))

					var initiativePath = "/initiatives/" + initiative.id
					var res = yield this.request(initiativePath + "?language=en")
					res.statusCode.must.equal(307)
					res.statusMessage.must.equal("No Translation")
					res.headers.location.must.equal(initiativePath + "-hello-world")
				})

				it("must redirect to primary language when translation missing and not author", function*() {
					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: this.author.id,
						phase: "edit",
						title: "Hello, world!",
						published_at: new Date
					}))

					var initiativePath = "/initiatives/" + initiative.id
					var res = yield this.request(initiativePath + "?language=en")
					res.statusCode.must.equal(307)
					res.statusMessage.must.equal("No Translation")
					res.headers.location.must.equal(initiativePath + "-hello-world")
				})
			})

			describe("subscription form", function() {
				it("must render subscription form without email if person lacks one",
					function*() {
					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: this.author.id,
						published_at: new Date
					}))

					var res = yield this.request("/initiatives/" + initiative.id)
					res.statusCode.must.equal(200)

					var dom = parseHtml(res.body)
					var form = dom.querySelector(".initiative-subscribe-form")
					form.querySelector("input[name=email]").value.must.equal("")
				})

				it("must render subscription form with person's confirmed email",
					function*() {
					usersDb.update(this.user, {
						email: "user@example.com",
						email_confirmed_at: new Date
					})

					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: this.author.id,
						published_at: new Date
					}))

					var res = yield this.request("/initiatives/" + initiative.id)
					res.statusCode.must.equal(200)

					var dom = parseHtml(res.body)
					var form = dom.querySelector(".initiative-subscribe-form")
					var input = form.querySelector("input[name=email]")
					input.value.must.equal("user@example.com")
				})

				it("must render subscription form with person's unconfirmed email",
					function*() {
					usersDb.update(this.user, {
						unconfirmed_email: "user@example.com",
						email_confirmation_token: Crypto.randomBytes(12)
					})

					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: this.author.id,
						published_at: new Date
					}))

					var res = yield this.request("/initiatives/" + initiative.id)
					res.statusCode.must.equal(200)

					var dom = parseHtml(res.body)
					var form = dom.querySelector(".initiative-subscribe-form")
					var input = form.querySelector("input[name=email]")
					input.value.must.equal("user@example.com")
				})
			})

			describe("comment form", function() {
				it("must render comment form mentioning missing email", function*() {
					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: this.author.id,
						published_at: new Date
					}))

					var res = yield this.request("/initiatives/" + initiative.id)
					res.statusCode.must.equal(200)

					var dom = parseHtml(res.body)
					var form = dom.getElementById("comment-form")
					var check = form.querySelector("input[type=checkbox][name=subscribe]")
					check.checked.must.be.false()
					check.disabled.must.be.true()

					form.innerHTML.must.include(
						t("SUBSCRIBE_TO_COMMENTS_SET_EMAIL", {userUrl: "/user"})
					)
				})

				it("must render comment form mentioning unconfirmed email",
					function*() {
					usersDb.update(this.user, {
						unconfirmed_email: "user@example.com",
						email_confirmation_token: Crypto.randomBytes(12)
					})

					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: this.author.id,
						published_at: new Date
					}))

					var res = yield this.request("/initiatives/" + initiative.id)
					res.statusCode.must.equal(200)

					var dom = parseHtml(res.body)
					var form = dom.getElementById("comment-form")
					var check = form.querySelector("input[type=checkbox][name=subscribe]")
					check.checked.must.be.false()
					check.disabled.must.be.true()

					form.textContent.must.include(
						t("SUBSCRIBE_TO_COMMENTS_CONFIRM_EMAIL")
					)
				})

				it("must render comment form if user has confirmed email", function*() {
					usersDb.update(this.user, {
						email: "user@example.com",
						email_confirmed_at: new Date
					})

					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: this.author.id,
						published_at: new Date
					}))

					var res = yield this.request("/initiatives/" + initiative.id)
					res.statusCode.must.equal(200)

					var dom = parseHtml(res.body)
					var form = dom.getElementById("comment-form")
					var check = form.querySelector("input[type=checkbox][name=subscribe]")
					check.checked.must.be.false()

					form.innerHTML.must.not.include(
						t("SUBSCRIBE_TO_COMMENTS_SET_EMAIL", {userUrl: "/user"})
					)

					form.textContent.must.not.include(
						t("SUBSCRIBE_TO_COMMENTS_CONFIRM_EMAIL")
					)
				})

				it("must render comment form if user has both confirmed and unconfirmed email", function*() {
					usersDb.update(this.user, {
						email: "user@example.com",
						email_confirmed_at: new Date,
						unconfirmed_email: "john@example.com",
						email_confirmation_token: Crypto.randomBytes(12)
					})

					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: this.author.id,
						published_at: new Date
					}))

					var res = yield this.request("/initiatives/" + initiative.id)
					res.statusCode.must.equal(200)

					var dom = parseHtml(res.body)
					var form = dom.getElementById("comment-form")
					var check = form.querySelector("input[type=checkbox][name=subscribe]")
					check.checked.must.be.false()

					form.innerHTML.must.not.include(
						t("SUBSCRIBE_TO_COMMENTS_SET_EMAIL", {userUrl: "/user"})
					)

					form.textContent.must.not.include(
						t("SUBSCRIBE_TO_COMMENTS_CONFIRM_EMAIL")
					)
				})

				it("must render subscribe checkbox if subscribed to initiative comments", function*() {
					usersDb.update(this.user, {
						email: "user@example.com",
						email_confirmed_at: new Date
					})

					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: this.author.id,
						published_at: new Date
					}))

					subscriptionsDb.create(new ValidSubscription({
						initiative_uuid: initiative.uuid,
						email: "user@example.com",
						confirmed_at: new Date,
						comment_interest: true
					}))

					var res = yield this.request("/initiatives/" + initiative.id)
					res.statusCode.must.equal(200)

					var dom = parseHtml(res.body)
					var form = dom.getElementById("comment-form")
					var check = form.querySelector("input[type=checkbox][name=subscribe]")
					check.checked.must.be.true()
				})

				// This was an unreleased bug in a query that still depended on the
				// CitizenOS topic existing.
				it("must render subscribe checkbox if subscribed to initiative comments given an external initiative", function*() {
					usersDb.update(this.user, {
						email: "user@example.com",
						email_confirmed_at: new Date
					})

					var initiative = initiativesDb.create(new ValidInitiative({
						external: true,
						phase: "parliament"
					}))

					subscriptionsDb.create(new ValidSubscription({
						initiative_uuid: initiative.uuid,
						email: "user@example.com",
						confirmed_at: new Date,
						comment_interest: true
					}))

					var res = yield this.request("/initiatives/" + initiative.id)
					res.statusCode.must.equal(200)

					var dom = parseHtml(res.body)
					var form = dom.getElementById("comment-form")
					var check = form.querySelector("input[type=checkbox][name=subscribe]")
					check.checked.must.be.true()
				})

				it("must render subscribe checkbox if subscribed to initiative, but not to comments", function*() {
					usersDb.update(this.user, {
						email: "user@example.com",
						email_confirmed_at: new Date
					})

					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: this.author.id,
						published_at: new Date
					}))

					subscriptionsDb.create(new ValidSubscription({
						initiative_uuid: initiative.uuid,
						email: "user@example.com",
						confirmed_at: new Date,
						comment_interest: false
					}))

					var res = yield this.request("/initiatives/" + initiative.id)
					res.statusCode.must.equal(200)

					var dom = parseHtml(res.body)
					var form = dom.getElementById("comment-form")
					var check = form.querySelector("input[type=checkbox][name=subscribe]")
					check.checked.must.be.false()
				})

				it("must render subscribe checkbox if subscribed to initiatives' comments", function*() {
					usersDb.update(this.user, {
						email: "user@example.com",
						email_confirmed_at: new Date
					})

					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: this.author.id,
						published_at: new Date
					}))

					subscriptionsDb.create(new ValidSubscription({
						email: "user@example.com",
						confirmed_at: new Date,
						comment_interest: true
					}))

					var res = yield this.request("/initiatives/" + initiative.id)
					res.statusCode.must.equal(200)

					var dom = parseHtml(res.body)
					var form = dom.getElementById("comment-form")
					var check = form.querySelector("input[type=checkbox][name=subscribe]")
					check.checked.must.be.false()
				})
			})

			NONEVENTABLE_PHASES.forEach(function(phase) {
				it(`must not show event creation button if in ${phase} phase`,
					function*() {
					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: this.user.id,
						phase,
						published_at: new Date
					}))

					var res = yield this.request("/initiatives/" + initiative.id)
					res.statusCode.must.equal(200)
					res.body.must.not.include(t("CREATE_INITIATIVE_EVENT_BUTTON"))
				})
			})

			EVENTABLE_PHASES.forEach(function(phase) {
				it(`must show event creation button if in ${phase} phase and author`,
					function*() {
					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: this.user.id,
						phase
					}))

					var res = yield this.request("/initiatives/" + initiative.id)
					res.statusCode.must.equal(200)
					res.body.must.include(t("CREATE_INITIATIVE_EVENT_BUTTON"))
				})

				it(`must show event creation button if in ${phase} phase and coauthor`,
					function*() {
					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: this.author.id,
						phase
					}))

					coauthorsDb.create(new ValidCoauthor({
						initiative: initiative,
						user: this.user,
						status: "accepted"
					}))

					var res = yield this.request("/initiatives/" + initiative.id)
					res.statusCode.must.equal(200)
					res.body.must.include(t("CREATE_INITIATIVE_EVENT_BUTTON"))
				})
			})

			it("must not show event creation button if archived", function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.user.id,
					phase: "sign",
					published_at: new Date,
					archived_at: new Date
				}))

				var res = yield this.request("/initiatives/" + initiative.id)
				res.statusCode.must.equal(200)
				res.body.must.not.include(t("CREATE_INITIATIVE_EVENT_BUTTON"))
			})

			it("must not show event creation button if not author",
				function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "sign"
				}))

				var res = yield this.request("/initiatives/" + initiative.id)
				res.statusCode.must.equal(200)
				res.body.must.not.include(t("CREATE_INITIATIVE_EVENT_BUTTON"))
			})

			it("must not show thanks if signed another initiative", function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "sign",
					signing_ends_at: DateFns.addDays(new Date, 1)
				}))

				var other = initiativesDb.create(new ValidInitiative({
					user_id: this.author.id
				}))

				signaturesDb.create(new ValidSignature({
					initiative_uuid: other.uuid,
					country: this.user.country,
					personal_id: this.user.personal_id
				}))

				var res = yield this.request("/initiatives/" + initiative.id)
				res.statusCode.must.equal(200)
				res.body.must.not.include(t("REVOKE_SIGNATURE"))
				res.body.must.not.include(t("THANKS_FOR_SIGNING"))
				res.body.must.not.include(t("THANKS_FOR_SIGNING_AGAIN"))
				res.body.must.not.include("donate-form")
			})

			it("must not show thanks if someone from different country signed",
				function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "sign",
					signing_ends_at: DateFns.addDays(new Date, 1)
				}))

				signaturesDb.create(new ValidSignature({
					initiative_uuid: initiative.uuid,
					country: "LT",
					personal_id: this.user.personal_id
				}))

				var res = yield this.request("/initiatives/" + initiative.id)
				res.statusCode.must.equal(200)
				res.body.must.not.include(t("REVOKE_SIGNATURE"))
				res.body.must.not.include(t("THANKS_FOR_SIGNING"))
				res.body.must.not.include(t("THANKS_FOR_SIGNING_AGAIN"))
				res.body.must.not.include("donate-form")
			})

			it("must not show thanks if someone with different personal id signed",
				function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "sign",
					signing_ends_at: DateFns.addDays(new Date, 1)
				}))

				signaturesDb.create(new ValidSignature({
					initiative_uuid: initiative.uuid,
					country: this.user.country,
					personal_id: "38706181337"
				}))

				var res = yield this.request("/initiatives/" + initiative.id)
				res.statusCode.must.equal(200)
				res.body.must.not.include(t("REVOKE_SIGNATURE"))
				res.body.must.not.include(t("THANKS_FOR_SIGNING"))
				res.body.must.not.include(t("THANKS_FOR_SIGNING_AGAIN"))
				res.body.must.not.include("donate-form")
			})

			it("must not show thanks if signing finished", function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "sign",
					signing_ends_at: new Date
				}))

				signaturesDb.create(new ValidSignature({
					initiative_uuid: initiative.uuid,
					country: this.user.country,
					personal_id: this.user.personal_id
				}))

				var res = yield this.request("/initiatives/" + initiative.id)
				res.statusCode.must.equal(200)
				res.body.must.not.include(t("REVOKE_SIGNATURE"))
				res.body.must.not.include(t("THANKS_FOR_SIGNING"))
				res.body.must.not.include(t("THANKS_FOR_SIGNING_AGAIN"))
				res.body.must.not.include("donate-form")
			})

			_.without(PHASES, "edit", "sign").forEach(function(phase) {
				it(`must not show thanks in ${phase} phase`, function*() {
					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: this.author.id,
						phase,

						// Just in case add a future deadline for signing to ensure the
						// phase is also checked.
						signing_ends_at: DateFns.addDays(new Date, 1)
					}))

					signaturesDb.create(new ValidSignature({
						initiative_uuid: initiative.uuid,
						country: this.user.country,
						personal_id: this.user.personal_id
					}))

					var res = yield this.request("/initiatives/" + initiative.id)
					res.statusCode.must.equal(200)
					res.body.must.not.include(t("REVOKE_SIGNATURE"))
					res.body.must.not.include(t("THANKS_FOR_SIGNING"))
					res.body.must.not.include(t("THANKS_FOR_SIGNING_AGAIN"))
					res.body.must.not.include("donate-form")
				})
			})

			it("must show delete signature button if signed", function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "sign",
					signing_ends_at: DateFns.addDays(new Date, 1)
				}))

				signaturesDb.create(new ValidSignature({
					initiative_uuid: initiative.uuid,
					country: this.user.country,
					personal_id: this.user.personal_id
				}))

				var res = yield this.request("/initiatives/" + initiative.id)
				res.statusCode.must.equal(200)
				res.body.must.include(t("REVOKE_SIGNATURE"))
				res.body.must.include(t("THANKS_FOR_SIGNING"))
				res.body.must.not.include(t("THANKS_FOR_SIGNING_AGAIN"))
				res.body.must.not.include("donate-form")
			})

			describe("authoring controls", function() {
				beforeEach(function() {
					LOCAL_GOVERNMENTS["muhu-vald"].initiativesEmails = [
						"muhu@example.org",
						"muhu-cc@example.org"
					]
				})

				it("must show authoring controls if author", function*() {
					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: this.user.id
					}))

					var res = yield this.request("/initiatives/" + initiative.id)
					res.statusCode.must.equal(200)
					res.body.must.include(t("EDIT_INITIATIVE_TEXT"))

					var dom = parseHtml(res.body)
					dom.getElementById("initiative-info").must.exist()
				})

				it("must show authoring controls if coauthor", function*() {
					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: this.author.id
					}))

					coauthorsDb.create(new ValidCoauthor({
						initiative: initiative,
						user: this.user,
						status: "accepted"
					}))

					var res = yield this.request("/initiatives/" + initiative.id)
					res.statusCode.must.equal(200)
					res.body.must.include(t("EDIT_INITIATIVE_TEXT"))

					var dom = parseHtml(res.body)
					dom.getElementById("initiative-info").must.exist()
				})

				it("must not show authoring controls if not author", function*() {
					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: this.author.id,
						published_at: new Date
					}))

					var res = yield this.request("/initiatives/" + initiative.id)
					res.statusCode.must.equal(200)
					res.body.must.not.include(t("EDIT_INITIATIVE_TEXT"))
				})

				_.without(COAUTHOR_STATUSES, "accepted").forEach(function(status) {
					it(`must not show authoring controls if ${status} author`,
						function*() {
						var initiative = initiativesDb.create(new ValidInitiative({
							user_id: this.author.id,
							published_at: new Date
						}))

						coauthorsDb.create(new ValidCoauthor({
							initiative: initiative,
							user: this.user,
							status: status
						}))

						var res = yield this.request("/initiatives/" + initiative.id)
						res.statusCode.must.equal(200)
						res.body.must.not.include(t("EDIT_INITIATIVE_TEXT"))
					})
				})

				it("must show edit authors button if author", function*() {
					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: this.user.id
					}))

					var res = yield this.request("/initiatives/" + initiative.id)
					res.statusCode.must.equal(200)
					res.body.must.include(t("EDIT_INITIATIVE_AUTHORS"))
				})

				it("must show edit authors button if coauthor", function*() {
					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: this.author.id
					}))

					coauthorsDb.create(new ValidCoauthor({
						initiative: initiative,
						user: this.user,
						status: "accepted"
					}))

					var res = yield this.request("/initiatives/" + initiative.id)
					res.statusCode.must.equal(200)
					res.body.must.not.include(t("EDIT_INITIATIVE_AUTHORS"))
				})

				it("must show publish button if text exists and author", function*() {
					usersDb.update(this.user, {
						email: "user@example.com",
						email_confirmed_at: new Date
					})

					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: this.user.id
					}))

					textsDb.create(new ValidText({
						initiative_uuid: initiative.uuid,
						user_id: this.user.id
					}))

					var res = yield this.request("/initiatives/" + initiative.id)
					res.statusCode.must.equal(200)

					var dom = parseHtml(res.body)
					var button = dom.getElementById("publish-button")
					button.textContent.must.include(t("PUBLISH_TOPIC"))
					button.disabled.must.be.false()

					var controls = dom.getElementById("initiative-author-options")

					controls.textContent.must.not.include(
						t("PUBLISH_INITIATIVE_SET_EMAIL", {userUrl: "/user"})
					)

					controls.textContent.must.not.include(
						t("PUBLISH_INITIATIVE_CONFIRM_EMAIL")
					)
				})

				it("must show publish button if text exists and author has both confirmed and unconfirmed email", function*() {
					usersDb.update(this.user, {
						email: "user@example.com",
						email_confirmed_at: new Date,
						unconfirmed_email: "john@example.com",
						email_confirmation_token: Crypto.randomBytes(12)
					})

					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: this.user.id
					}))

					textsDb.create(new ValidText({
						initiative_uuid: initiative.uuid,
						user_id: this.user.id
					}))

					var res = yield this.request("/initiatives/" + initiative.id)
					res.statusCode.must.equal(200)

					var dom = parseHtml(res.body)
					var button = dom.getElementById("publish-button")
					button.textContent.must.include(t("PUBLISH_TOPIC"))
					button.disabled.must.be.false()

					var controls = dom.getElementById("initiative-author-options")

					controls.textContent.must.not.include(
						t("PUBLISH_INITIATIVE_SET_EMAIL", {userUrl: "/user"})
					)

					controls.textContent.must.not.include(
						t("PUBLISH_INITIATIVE_CONFIRM_EMAIL")
					)
				})

				it("must show publish button if text exists and coauthor", function*() {
					usersDb.update(this.user, {
						email: "user@example.com",
						email_confirmed_at: new Date
					})

					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: this.author.id
					}))

					coauthorsDb.create(new ValidCoauthor({
						initiative: initiative,
						user: this.user,
						status: "accepted"
					}))

					textsDb.create(new ValidText({
						initiative_uuid: initiative.uuid,
						user_id: this.user.id
					}))

					var res = yield this.request("/initiatives/" + initiative.id)
					res.statusCode.must.equal(200)

					var dom = parseHtml(res.body)
					var button = dom.getElementById("publish-button")
					button.textContent.must.include(t("PUBLISH_TOPIC"))
					button.disabled.must.be.false()
				})

				it("must not show publish button if text doesn't exist", function*() {
					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: this.user.id
					}))

					var res = yield this.request("/initiatives/" + initiative.id)
					res.statusCode.must.equal(200)
					res.body.must.not.include(t("PUBLISH_TOPIC"))
				})

				it("must disable publish button if email not set", function*() {
					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: this.user.id
					}))

					textsDb.create(new ValidText({
						initiative_uuid: initiative.uuid,
						user_id: this.user.id
					}))

					var res = yield this.request("/initiatives/" + initiative.id)
					res.statusCode.must.equal(200)

					var dom = parseHtml(res.body)
					var button = dom.getElementById("publish-button")
					button.disabled.must.be.true()

					var controls = dom.getElementById("initiative-author-options")

					controls.innerHTML.must.include(
						t("PUBLISH_INITIATIVE_SET_EMAIL", {userUrl: "/user"})
					)
				})

				it("must disable publish button if email not confirmed", function*() {
					usersDb.update(this.user, {
						unconfirmed_email: "user@example.com",
						email_confirmation_token: Crypto.randomBytes(12)
					})

					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: this.user.id
					}))

					textsDb.create(new ValidText({
						initiative_uuid: initiative.uuid,
						user_id: this.user.id
					}))

					var res = yield this.request("/initiatives/" + initiative.id)
					res.statusCode.must.equal(200)

					var dom = parseHtml(res.body)
					var button = dom.getElementById("publish-button")
					button.disabled.must.be.true()

					var controls = dom.getElementById("initiative-author-options")

					controls.textContent.must.include(
						t("PUBLISH_INITIATIVE_CONFIRM_EMAIL")
					)
				})

				it("must render send to sign button if at deadline", function*() {
					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: this.user.id,
						destination: "parliament",

						published_at: DateFns.addDays(
							new Date,
							-Config.minEditingDeadlineDays
						)
					}))

					var res = yield this.request("/initiatives/" + initiative.id)
					res.statusCode.must.equal(200)

					var dom = parseHtml(res.body)
					var button = dom.getElementById("send-to-sign-button")
					button.textContent.must.equal(t("BTN_SEND_TO_VOTE"))
					button.disabled.must.be.false()
				})

				it("must render send to sign button if destination not chosen",
					function*() {
					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: this.user.id,

						published_at: DateFns.addDays(
							new Date,
							-Config.minEditingDeadlineDays
						)
					}))

					var res = yield this.request("/initiatives/" + initiative.id)
					res.statusCode.must.equal(200)

					var dom = parseHtml(res.body)

					var button = dom.getElementById("send-to-sign-button")
					button.textContent.must.equal(t("BTN_SEND_TO_VOTE"))
					button.disabled.must.be.true()

					var controls = dom.getElementById("initiative-author-options")

					controls.textContent.must.include(
						t("INITIATIVE_SEND_TO_SIGNING_NEEDS_DESTINATION")
					)
				})

				it("must render send to sign button if before deadline", function*() {
					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: this.user.id,
						destination: "parliament",

						published_at: DateFns.addDays(
							new Date,
							-Config.minEditingDeadlineDays + 1
						)
					}))

					var res = yield this.request("/initiatives/" + initiative.id)
					res.statusCode.must.equal(200)

					var dom = parseHtml(res.body)

					var button = dom.getElementById("send-to-sign-button")
					button.textContent.must.equal(t("BTN_SEND_TO_VOTE"))
					button.disabled.must.be.true()

					var controls = dom.getElementById("initiative-author-options")

					controls.textContent.must.include(
						t("INITIATIVE_SEND_TO_SIGNING_WAIT", {
							daysInEdit: Config.minEditingDeadlineDays,
							daysLeft: 1
						})
					)

					controls.textContent.must.not.include(
						t("INITIATIVE_SEND_TO_SIGNING_NEEDS_DESTINATION")
					)
				})

				it("must render send to sign button if before deadline but fast-tracked", function*() {
					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: this.user.id,
						destination: "parliament",
						tags: ["fast-track"],

						published_at: DateFns.addDays(
							new Date,
							-Config.minEditingDeadlineDays + 1
						)
					}))

					var res = yield this.request("/initiatives/" + initiative.id)
					res.statusCode.must.equal(200)

					var dom = parseHtml(res.body)

					var button = dom.getElementById("send-to-sign-button")
					button.textContent.must.equal(t("BTN_SEND_TO_VOTE"))
					button.disabled.must.be.false()

					var controls = dom.getElementById("initiative-author-options")

					controls.textContent.must.not.include(
						t("INITIATIVE_SEND_TO_SIGNING_WAIT", {
							daysInEdit: Config.minEditingDeadlineDays,
							daysLeft: 1
						})
					)
				})

				it("must disable send to sign button if Estonian translation missing",
					function*() {
					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: this.user.id,
						destination: "parliament",
						language: "en",

						published_at: DateFns.addDays(
							new Date,
							-Config.minEditingDeadlineDays
						)
					}))

					var res = yield this.request("/initiatives/" + initiative.id)
					res.statusCode.must.equal(200)

					var dom = parseHtml(res.body)
					var button = dom.getElementById("send-to-sign-button")
					button.textContent.must.equal(t("BTN_SEND_TO_VOTE"))
					button.disabled.must.be.true()

					var newTextUrl = "/initiatives/" + initiative.id
					newTextUrl += "/texts/new?language=et"

					res.body.must.include(
						t("INITIATIVE_SEND_TO_SIGNING_NEEDS_ESTONIAN_TEXT", {
							newTextUrl
						})
					)
				})

				it("must not render delete initiative button if not initiative author",
					function*() {
					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: this.author.id,
						phase: "edit",
						published_at: new Date
					}))

					var res = yield this.request("/initiatives/" + initiative.id)
					res.statusCode.must.equal(200)
					res.body.must.not.include(t("DELETE_DISCUSSION"))
				})

				it("must render delete initiative button if in edit phase and unpublished", function*() {
					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: this.user.id,
						phase: "edit"
					}))

					var res = yield this.request("/initiatives/" + initiative.id)
					res.statusCode.must.equal(200)
					res.body.must.include(t("DELETE_DISCUSSION"))
				})

				it("must render delete initiative button if in edit phase and published", function*() {
					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: this.user.id,
						phase: "edit",
						published_at: new Date
					}))

					var res = yield this.request("/initiatives/" + initiative.id)
					res.statusCode.must.equal(200)
					res.body.must.include(t("DELETE_DISCUSSION"))
				})

				it("must render delete initiative button if unpublished and with comments",
					function*() {
					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: this.user.id,
						phase: "edit"
					}))

					commentsDb.create(new ValidComment({
						initiative_uuid: initiative.uuid,
						user_id: this.user.id,
						user_uuid: _.serializeUuid(this.user.uuid)
					}))

					var res = yield this.request("/initiatives/" + initiative.id)
					res.statusCode.must.equal(200)
					res.body.must.include(t("DELETE_DISCUSSION"))
				})

				it("must not render delete initiative button if published and with comments",
					function*() {
					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: this.user.id,
						phase: "edit",
						published_at: new Date
					}))

					commentsDb.create(new ValidComment({
						initiative_uuid: initiative.uuid,
						user_id: this.user.id,
						user_uuid: _.serializeUuid(this.user.uuid)
					}))

					var res = yield this.request("/initiatives/" + initiative.id)
					res.statusCode.must.equal(200)
					res.body.must.not.include(t("DELETE_DISCUSSION"))
				})

				it("must render delete initiative button if coauthor", function*() {
					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: this.author.id,
						phase: "edit"
					}))

					coauthorsDb.create(new ValidCoauthor({
						initiative: initiative,
						user: this.user,
						status: "accepted"
					}))

					var res = yield this.request("/initiatives/" + initiative.id)
					res.statusCode.must.equal(200)
					res.body.must.not.include(t("DELETE_DISCUSSION"))
				})

				_.without(PHASES, "edit").forEach(function(phase) {
					it(`must not render delete initiative button if in ${phase} phase`,
						function*() {
						var initiative = initiativesDb.create(new ValidInitiative({
							user_id: this.user.id,
							phase
						}))

						var res = yield this.request("/initiatives/" + initiative.id)
						res.statusCode.must.equal(200)
						res.body.must.not.include(t("DELETE_DISCUSSION"))
					})
				})

				describe("when destined for parliament", function() {
					it("must not render send to parliament button if not enough signatures", function*() {
						var initiative = initiativesDb.create(new ValidInitiative({
							user_id: this.user.id,
							phase: "sign"
						}))

						citizenosSignaturesDb.create(new ValidCitizenosSignature({
							initiative_uuid: initiative.uuid
						}))

						signaturesDb.create(_.times(Config.votesRequired - 2, () => (
							new ValidSignature({initiative_uuid: initiative.uuid})
						)))

						var res = yield this.request("/initiatives/" + initiative.id)
						res.statusCode.must.equal(200)

						var dom = parseHtml(res.body)
						demand(dom.getElementById("send-to-parliament-button")).be.null()
					})

					it("must render send to parliament button if enough signatures and author", function*() {
						var initiative = initiativesDb.create(new ValidInitiative({
							user_id: this.user.id,
							phase: "sign"
						}))

						citizenosSignaturesDb.create(_.times(
							Config.votesRequired / 2,
							() => new ValidCitizenosSignature({initiative_uuid: initiative.uuid})
						))

						signaturesDb.create(_.times(Config.votesRequired / 2, () => (
							new ValidSignature({initiative_uuid: initiative.uuid})
						)))

						var res = yield this.request("/initiatives/" + initiative.id)
						res.statusCode.must.equal(200)

						var dom = parseHtml(res.body)
						var button = dom.getElementById("send-to-parliament-button")
						button.disabled.must.be.false()
						button.textContent.must.equal(t("SEND_TO_PARLIAMENT"))
					})

					it("must render send to parliament button if has paper signatures and only undersigned signatures",
						function*() {
						var initiative = initiativesDb.create(new ValidInitiative({
							user_id: this.user.id,
							phase: "sign",
							has_paper_signatures: true
						}))

						signaturesDb.create(new ValidSignature({
							initiative_uuid: initiative.uuid
						}))

						var res = yield this.request("/initiatives/" + initiative.id)
						res.statusCode.must.equal(200)

						var dom = parseHtml(res.body)
						var button = dom.getElementById("send-to-parliament-button")
						button.disabled.must.be.false()
					})

					it("must render send to parliament button if has paper signatures and only CitizenOS signatures", function*() {
						var initiative = initiativesDb.create(new ValidInitiative({
							user_id: this.user.id,
							phase: "sign",
							has_paper_signatures: true
						}))

						citizenosSignaturesDb.create(new ValidCitizenosSignature({
							initiative_uuid: initiative.uuid
						}))

						var res = yield this.request("/initiatives/" + initiative.id)
						res.statusCode.must.equal(200)

						var dom = parseHtml(res.body)
						var button = dom.getElementById("send-to-parliament-button")
						button.disabled.must.be.false()
					})

					it("must not render send to parliament button if coauthor",
						function*() {
						var initiative = initiativesDb.create(new ValidInitiative({
							user_id: this.author.id,
							phase: "sign"
						}))

						coauthorsDb.create(new ValidCoauthor({
							initiative: initiative,
							user: this.user,
							status: "accepted"
						}))

						signaturesDb.create(_.times(Config.votesRequired, () => (
							new ValidSignature({initiative_uuid: initiative.uuid})
						)))

						var res = yield this.request("/initiatives/" + initiative.id)
						res.statusCode.must.equal(200)

						var dom = parseHtml(res.body)
						demand(dom.getElementById("send-to-parliament-button")).be.null()
					})

					it("must disable send to parliament button if Estonian translation missing", function*() {
						var initiative = initiativesDb.create(new ValidInitiative({
							user_id: this.user.id,
							phase: "sign",
							language: "en"
						}))

						signaturesDb.create(_.times(Config.votesRequired, () => (
							new ValidSignature({initiative_uuid: initiative.uuid})
						)))

						textsDb.create(new ValidText({
							initiative_uuid: initiative.uuid,
							user_id: this.user.id,
							language: "en"
						}))

						var res = yield this.request("/initiatives/" + initiative.id)
						res.statusCode.must.equal(200)

						var dom = parseHtml(res.body)
						var button = dom.getElementById("send-to-parliament-button")
						button.disabled.must.be.true()

						var newTextUrl = "/initiatives/" + initiative.id
						newTextUrl += "/texts/new?language=et"

						res.body.must.include(
							t("INITIATIVE_SEND_TO_PARLIAMENT_NEEDS_ESTONIAN_TEXT", {
								newTextUrl
							})
						)
					})

					it("must not render send to parliament button if only has paper signatures", function*() {
						var initiative = initiativesDb.create(new ValidInitiative({
							user_id: this.user.id,
							phase: "sign",
							has_paper_signatures: true
						}))

						var res = yield this.request("/initiatives/" + initiative.id)
						res.statusCode.must.equal(200)

						var dom = parseHtml(res.body)
						demand(dom.getElementById("send-to-parliament-button")).be.null()
					})
				})

				describe("when destined for local", function() {
					it("must not render send to government button if emails empty",
						function*() {
						LOCAL_GOVERNMENTS["muhu-vald"].initiativesEmails = []

						var initiative = initiativesDb.create(new ValidInitiative({
							user_id: this.user.id,
							phase: "sign",
							destination: "muhu-vald"
						}))

						var {signatureThreshold} = LOCAL_GOVERNMENTS["muhu-vald"]

						signaturesDb.create(_.times(signatureThreshold, () => (
							new ValidSignature({initiative_uuid: initiative.uuid})
						)))

						var res = yield this.request("/initiatives/" + initiative.id)

						res.statusCode.must.equal(200)
						res.body.must.not.include(t("SEND_TO_PARLIAMENT"))
						res.body.must.not.include(t("SEND_TO_LOCAL_GOVERNMENT"))
					})

					it("must not render send to government button if not enough signatures",
						function*() {
						var initiative = initiativesDb.create(new ValidInitiative({
							user_id: this.user.id,
							phase: "sign",
							destination: "muhu-vald"
						}))

						var {signatureThreshold} = LOCAL_GOVERNMENTS["muhu-vald"]

						signaturesDb.create(_.times(signatureThreshold - 1, () => (
							new ValidSignature({initiative_uuid: initiative.uuid})
						)))

						var res = yield this.request("/initiatives/" + initiative.id)
						res.statusCode.must.equal(200)
						res.body.must.not.include(t("SEND_TO_PARLIAMENT"))
						res.body.must.not.include(t("SEND_TO_LOCAL_GOVERNMENT"))
					})

					it("must render send to government button if enough signatures and author", function*() {
						var initiative = initiativesDb.create(new ValidInitiative({
							user_id: this.user.id,
							phase: "sign",
							destination: "muhu-vald"
						}))

						var {signatureThreshold} = LOCAL_GOVERNMENTS["muhu-vald"]

						signaturesDb.create(_.times(signatureThreshold, () => (
							new ValidSignature({initiative_uuid: initiative.uuid})
						)))

						var res = yield this.request("/initiatives/" + initiative.id)
						res.statusCode.must.equal(200)

						var dom = parseHtml(res.body)
						var button = dom.getElementById("send-to-local-government-button")
						button.disabled.must.be.false()
						button.textContent.must.equal(t("SEND_TO_LOCAL_GOVERNMENT"))
					})

					it("must not render send to government button if coauthor",
						function*() {
						var initiative = initiativesDb.create(new ValidInitiative({
							user_id: this.author.id,
							phase: "sign",
							destination: "muhu-vald"
						}))

						coauthorsDb.create(new ValidCoauthor({
							initiative: initiative,
							user: this.user,
							status: "accepted"
						}))

						var {signatureThreshold} = LOCAL_GOVERNMENTS["muhu-vald"]

						signaturesDb.create(_.times(signatureThreshold, () => (
							new ValidSignature({initiative_uuid: initiative.uuid})
						)))

						var res = yield this.request("/initiatives/" + initiative.id)
						res.statusCode.must.equal(200)

						var dom = parseHtml(res.body)
						var button = dom.getElementById("send-to-local-government-button")
						demand(button).be.null()
					})

					it("must render send to government button if has paper signatures and only undersigned signatures",
						function*() {
						var initiative = initiativesDb.create(new ValidInitiative({
							user_id: this.user.id,
							destination: "muhu-vald",
							phase: "sign",
							has_paper_signatures: true
						}))

						signaturesDb.create(new ValidSignature({
							initiative_uuid: initiative.uuid
						}))

						var res = yield this.request("/initiatives/" + initiative.id)
						res.statusCode.must.equal(200)

						var dom = parseHtml(res.body)
						var button = dom.getElementById("send-to-local-government-button")
						button.disabled.must.be.false()
					})
				})
			})
		})
	})

	describe("GET /:uuid", function() {
		beforeEach(function() { this.author = usersDb.create(new ValidUser) })

		describe("when not logged in", function() {
			require("root/test/time")(new Date(2015, 5, 18, 13, 37, 42))

			it("must respond with 401 for a unpublished initiative", function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
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

			it("must redirect to id and slug", function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					title: "Hello, world!",
					published_at: new Date
				}))

				var res = yield this.request("/initiatives/" + initiative.uuid)

				res.statusCode.must.equal(301)

				res.headers.location.must.equal(
					"/initiatives/" + initiative.id + "-hello-world"
				)
			})

			it("must redirect to id and slug with extension", function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					title: "Hello, world!",
					published_at: new Date
				}))

				var res = yield this.request(
					"/initiatives/" + initiative.uuid + ".html?foo=bar"
				)

				res.statusCode.must.equal(301)

				res.headers.location.must.equal(
					"/initiatives/" + initiative.id + "-hello-world.html?foo=bar"
				)
			})
		})
	})

	describe(`GET /:uuid for ${INITIATIVE_TYPE}`, function() {
		beforeEach(function() { this.author = usersDb.create(new ValidUser) })

		describe("when not logged in", function() {
			it(`must respond with initiative if requesting ${INITIATIVE_TYPE}`,
				function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					destination: "parliament",
					published_at: new Date
				}))

				var res = yield this.request("/initiatives/" + initiative.uuid, {
					headers: {Accept: INITIATIVE_TYPE}
				})

				res.statusCode.must.equal(200)

				res.body.must.eql(_.assign(serializeApiInitiative(initiative), {
					signatureThreshold: Config.votesRequired
				}))
			})
		})
	})

	describe(`GET /:id for image/*`, function() {
		beforeEach(function() {
			this.author = usersDb.create(new ValidUser)

			this.initiative = initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				published_at: new Date
			}))
		})

		it("must respond with image if Accept is image/*", function*() {
			imagesDb.create({
				initiative_uuid: this.initiative.uuid,
				data: PNG,
				type: "image/png",
				preview: PNG_PREVIEW
			})

			var res = yield this.request("/initiatives/" + this.initiative.id, {
				headers: {Accept: "image/*"}
			})

			res.statusCode.must.equal(200)
			res.headers["content-type"].must.equal("image/png")
			res.headers["content-length"].must.equal(String(PNG.length))
			res.body.equals(PNG_PREVIEW).must.be.true()
		})

		it("must respond with image if Accept matches", function*() {
			imagesDb.create({
				initiative_uuid: this.initiative.uuid,
				data: PNG,
				type: "image/png",
				preview: PNG_PREVIEW
			})

			var res = yield this.request("/initiatives/" + this.initiative.id, {
				headers: {Accept: "image/png"}
			})

			res.statusCode.must.equal(200)
			res.headers["content-type"].must.equal("image/png")
			res.headers["content-length"].must.equal(String(PNG.length))
			res.body.equals(PNG_PREVIEW).must.be.true()
		})

		it("must respond with image if extension matches type", function*() {
			imagesDb.create({
				initiative_uuid: this.initiative.uuid,
				data: PNG,
				type: "image/png",
				preview: PNG_PREVIEW
			})

			var res = yield this.request(`/initiatives/${this.initiative.id}.png`)
			res.statusCode.must.equal(200)
			res.headers["content-type"].must.equal("image/png")
			res.headers["content-length"].must.equal(String(PNG.length))
			res.body.equals(PNG_PREVIEW).must.be.true()
		})

		it("must respond with 406 if no image", function*() {
			var res = yield this.request("/initiatives/" + this.initiative.id, {
				headers: {Accept: "image/*"}
			})

			res.statusCode.must.equal(406)
		})

		it("must respond with 406 if type doesn't match", function*() {
			imagesDb.create({
				initiative_uuid: this.initiative.uuid,
				data: PNG,
				type: "image/png",
				preview: PNG_PREVIEW
			})

			var res = yield this.request("/initiatives/" + this.initiative.id, {
				headers: {Accept: "image/jpeg"}
			})

			res.statusCode.must.equal(406)
		})

		it("must respond 406 if extension doesn't match type", function*() {
			imagesDb.create({
				initiative_uuid: this.initiative.uuid,
				data: PNG,
				type: "image/png",
				preview: PNG_PREVIEW
			})

			var res = yield this.request(`/initiatives/${this.initiative.id}.jpeg`)
			res.statusCode.must.equal(406)
		})
	})

	describe(`GET /:uuid for image/*`, function() {
		beforeEach(function() {
			this.author = usersDb.create(new ValidUser)

			this.initiative = initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				published_at: new Date
			}))
		})

		it("must respond with image if Accept is image/*", function*() {
			imagesDb.create({
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

		it("must respond with image if extension matches type", function*() {
			imagesDb.create({
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
	})

	describe(`GET /:id for ${INITIATIVE_TYPE}`, function() {
		beforeEach(function() { this.author = usersDb.create(new ValidUser) })

		it("must respond with 401 for a unpublished initiative", function*() {
			var initiative = initiativesDb.create(new ValidInitiative({
				user_id: this.author.id
			}))

			var res = yield this.request("/initiatives/" + initiative.id, {
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

		it("must respond with initiative without destination", function*() {
			var initiative = initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				published_at: new Date
			}))

			var res = yield this.request("/initiatives/" + initiative.id, {
				headers: {Accept: INITIATIVE_TYPE}
			})

			res.statusCode.must.equal(200)
			res.headers["content-type"].must.equal(INITIATIVE_TYPE)
			res.headers["access-control-allow-origin"].must.equal("*")
			res.body.must.eql(serializeApiInitiative(initiative))
		})

		it("must respond with initiative destined for parliament", function*() {
			var initiative = initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				destination: "parliament",
				published_at: new Date
			}))

			var res = yield this.request("/initiatives/" + initiative.id, {
				headers: {Accept: INITIATIVE_TYPE}
			})

			res.statusCode.must.equal(200)

			res.body.must.eql(_.assign(serializeApiInitiative(initiative), {
				signatureThreshold: Config.votesRequired
			}))
		})

		it("must respond with initiative destined for local", function*() {
			var initiative = initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				destination: "muhu-vald",
				published_at: new Date
			}))

			var res = yield this.request("/initiatives/" + initiative.id, {
				headers: {Accept: INITIATIVE_TYPE}
			})

			res.statusCode.must.equal(200)

			res.body.must.eql(_.assign(serializeApiInitiative(initiative), {
				signatureThreshold: LOCAL_GOVERNMENTS["muhu-vald"].signatureThreshold
			}))
		})

		it("must respond with external initiative", function*() {
			var initiative = initiativesDb.create(new ValidInitiative({
				title: "Better life for everyone.",
				external: true,
				phase: "parliament"
			}))

			var res = yield this.request("/initiatives/" + initiative.id, {
				headers: {Accept: INITIATIVE_TYPE}
			})

			res.statusCode.must.equal(200)

			res.body.must.eql(_.assign(serializeApiInitiative(initiative), {
				signatureCount: null,
				signatureThreshold: Config.votesRequired
			}))
		})

		it("must respond with signature count", function*() {
			var initiative = initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				phase: "sign"
			}))

			citizenosSignaturesDb.create(_.times(5, () => (
				new ValidCitizenosSignature({initiative_uuid: initiative.uuid})
			)))

			signaturesDb.create(_.times(3, () => new ValidSignature({
				initiative_uuid: initiative.uuid
			})))

			var res = yield this.request("/initiatives/" + initiative.id, {
				headers: {Accept: INITIATIVE_TYPE}
			})

			res.statusCode.must.equal(200)

			res.body.must.eql(_.assign(serializeApiInitiative(initiative), {
				signatureCount: 8,
				signatureThreshold: Config.votesRequired
			}))
		})
	})

	describe(`GET /:id for ${ATOM_TYPE}`, function() {
		beforeEach(function() { this.author = usersDb.create(new ValidUser) })

		it("must respond with Atom feed", function*() {
			var initiative = initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				title: "Hello, world!",
				published_at: new Date
			}))

			var res = yield this.request(`/initiatives/${initiative.id}`, {
				headers: {Accept: ATOM_TYPE}
			})

			res.statusCode.must.equal(200)
			res.headers["content-type"].must.equal(ATOM_TYPE)

			var {feed} = Atom.parse(res.body)
			feed.id.$.must.equal(Config.url + `/initiatives/${initiative.uuid}`)
			feed.updated.$.must.equal(initiative.created_at.toJSON())

			feed.title.$.must.equal(t("ATOM_INITIATIVE_FEED_TITLE", {
				title: "Hello, world!"
			}))

			var links = _.indexBy(feed.link, (link) => link.rel)

			links.self.href.must.equal(
				Config.url + `/initiatives/${initiative.id}.atom`
			)

			links.self.type.must.equal(ATOM_TYPE)

			links.alternate.href.must.equal(
				Config.url + `/initiatives/${initiative.id}-hello-world`
			)

			links.alternate.type.must.equal("text/html")

			feed.author.name.$.must.equal(Config.title)
			feed.author.uri.$.must.equal(Config.url)
		})

		it("must respond with correct feed id given .atom extension", function*() {
			var initiative = initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				title: "Hello, world!",
				published_at: new Date
			}))

			var res = yield this.request(`/initiatives/${initiative.id}.atom`)
			res.statusCode.must.equal(200)
			res.headers["content-type"].must.equal(ATOM_TYPE)

			var {feed} = Atom.parse(res.body)
			feed.id.$.must.equal(Config.url + `/initiatives/${initiative.uuid}`)

			var links = _.indexBy(feed.link, (link) => link.rel)

			links.self.href.must.equal(
				Config.url + `/initiatives/${initiative.id}.atom`
			)

			links.self.type.must.equal(ATOM_TYPE)

			links.alternate.href.must.equal(
				Config.url + `/initiatives/${initiative.id}-hello-world`
			)

			links.alternate.type.must.equal("text/html")
		})

		it("must respond given an external initiative", function*() {
			var initiative = initiativesDb.create(new ValidInitiative({
				external: true,
				phase: "parliament",
				title: "Better life for everyone."
			}))

			var res = yield this.request(`/initiatives/${initiative.id}.atom`)
			res.statusCode.must.equal(200)
			res.headers["content-type"].must.equal(ATOM_TYPE)

			var {feed} = Atom.parse(res.body)
			feed.updated.$.must.equal(initiative.created_at.toJSON())

			feed.title.$.must.equal(t("ATOM_INITIATIVE_FEED_TITLE", {
				title: "Better life for everyone."
			}))
		})

		it("must use last event's time for feed update", function*() {
			var initiative = initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				published_at: new Date
			}))

			var author = usersDb.create(new ValidUser({name: "Johnny Lang"}))

			var events = eventsDb.create([new ValidEvent({
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

			var res = yield this.request(`/initiatives/${initiative.id}.atom`)
			res.statusCode.must.equal(200)

			var {feed} = Atom.parse(res.body)
			feed.updated.$.must.equal(events[1].updated_at.toJSON())
		})

		it("must use initiative creation time if no events", function*() {
			var initiative = initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				published_at: new Date
			}))

			var res = yield this.request(`/initiatives/${initiative.id}.atom`)
			res.statusCode.must.equal(200)
			var {feed} = Atom.parse(res.body)
			feed.updated.$.must.equal(initiative.created_at.toJSON())
		})

		it("must render initiative in sign phase with signature milestones",
			function*() {
			var milestones = [1, Config.votesRequired / 2, Config.votesRequired]

			var initiative = initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				phase: "sign",
				title: "Hello, world!",
				signature_milestones: {
					[milestones[0]]: DateFns.addDays(new Date, -5),
					[milestones[1]]: DateFns.addDays(new Date, -3),
					[milestones[2]]: DateFns.addDays(new Date, -1)
				}
			}))

			var res = yield this.request(`/initiatives/${initiative.id}.atom`)
			res.statusCode.must.equal(200)

			var events = milestones.map((count) => ({
				id: "milestone-" + count,
				occurred_at: initiative.signature_milestones[count],
				title: t("SIGNATURE_MILESTONE_EVENT_TITLE", {milestone: count})
			}))

			Atom.parse(res.body).feed.entry.forEach(function(entry, i) {
				var event = events[i]

				entry.must.eql({
					id: {$: `${INITIATIVES_URL}/${initiative.uuid}/events/${event.id}`},

					link: {
						rel: "alternate",
						type: "text/html",
						href: `${INITIATIVES_URL}/${initiative.id}-hello-world#event-${event.id}`
					},

					updated: {$: event.occurred_at.toJSON()},
					published: {$: event.occurred_at.toJSON()},
					title: {$: event.title}
				})
			})
		})

		it("must render initiative in parliament", function*() {
			var initiative = initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				title: "Hello, world!",
				phase: "parliament",
				sent_to_parliament_at: new Date(2015, 5, 1)
			}))

			var res = yield this.request(`/initiatives/${initiative.id}.atom`)
			res.statusCode.must.equal(200)

			Atom.parse(res.body).feed.entry.must.eql({
				id: {
					$: `${INITIATIVES_URL}/${initiative.uuid}/events/sent-to-parliament`
				},

				link: {
					rel: "alternate",
					type: "text/html",
					href: `${INITIATIVES_URL}/${initiative.id}-hello-world#event-sent-to-parliament`
				},

				updated: {$: initiative.sent_to_parliament_at.toJSON()},
				published: {$: initiative.sent_to_parliament_at.toJSON()},
				title: {$: t("INITIATIVE_SENT_TO_PARLIAMENT_TITLE")},
				content: {type: "text", $: t("INITIATIVE_SENT_TO_PARLIAMENT_BODY")}
			})
		})

		it("must render initiative in parliament and received event", function*() {
			var initiative = initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				title: "Hello, world!",
				phase: "parliament"
			}))

			var event = eventsDb.create(new ValidEvent({
				initiative_uuid: initiative.uuid,
				created_at: pseudoDateTime(),
				updated_at: pseudoDateTime(),
				occurred_at: pseudoDateTime(),
				type: "parliament-received",
				origin: "parliament"
			}))

			var res = yield this.request(`/initiatives/${initiative.id}.atom`)
			res.statusCode.must.equal(200)

			Atom.parse(res.body).feed.entry.must.eql({
				id: {$: `${INITIATIVES_URL}/${initiative.uuid}/events/${event.id}`},

				link: {
					rel: "alternate",
					type: "text/html",
					href: `${INITIATIVES_URL}/${initiative.id}-hello-world#event-${event.id}`
				},

				updated: {$: event.updated_at.toJSON()},
				published: {$: event.occurred_at.toJSON()},
				title: {$: t("PARLIAMENT_RECEIVED")}
			})
		})

		it("must render initiative in parliament and accepted event", function*() {
			var initiative = initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				phase: "parliament",
				title: "Hello, world!"
			}))

			var event = eventsDb.create(new ValidEvent({
				initiative_uuid: initiative.uuid,
				created_at: pseudoDateTime(),
				updated_at: pseudoDateTime(),
				occurred_at: pseudoDateTime(),
				type: "parliament-accepted",
				content: {committee: "Keskkonnakomisjon"},
				origin: "parliament"
			}))

			var res = yield this.request(`/initiatives/${initiative.id}.atom`)
			res.statusCode.must.equal(200)

			Atom.parse(res.body).feed.entry.must.eql({
				id: {$: `${INITIATIVES_URL}/${initiative.uuid}/events/${event.id}`},

				link: {
					rel: "alternate",
					type: "text/html",
					href: `${INITIATIVES_URL}/${initiative.id}-hello-world#event-${event.id}`
				},

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
			var initiative = initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				phase: "parliament",
				title: "Hello, world!"
			}))

			var event = eventsDb.create(new ValidEvent({
				initiative_uuid: initiative.uuid,
				created_at: pseudoDateTime(),
				updated_at: pseudoDateTime(),
				occurred_at: pseudoDateTime(),
				type: "parliament-board-meeting",
				content: {},
				origin: "parliament"
			}))

			var res = yield this.request(`/initiatives/${initiative.id}.atom`)
			res.statusCode.must.equal(200)

			Atom.parse(res.body).feed.entry.must.eql({
				id: {$: `${INITIATIVES_URL}/${initiative.uuid}/events/${event.id}`},

				link: {
					rel: "alternate",
					type: "text/html",
					href: `${INITIATIVES_URL}/${initiative.id}-hello-world#event-${event.id}`
				},

				updated: {$: event.updated_at.toJSON()},
				published: {$: event.occurred_at.toJSON()},
				title: {$: t("PARLIAMENT_BOARD_MEETING")}
			})
		})

		it("must render initiative in parliament and committee meeting event",
			function*() {
			var initiative = initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				phase: "parliament",
				title: "Hello, world!"
			}))

			var event = eventsDb.create(new ValidEvent({
				initiative_uuid: initiative.uuid,
				created_at: pseudoDateTime(),
				updated_at: pseudoDateTime(),
				occurred_at: pseudoDateTime(),
				type: "parliament-committee-meeting",
				content: {committee: "Keskkonnakomisjon"},
				origin: "parliament"
			}))

			var res = yield this.request(`/initiatives/${initiative.id}.atom`)
			res.statusCode.must.equal(200)

			Atom.parse(res.body).feed.entry.must.eql({
				id: {$: `${INITIATIVES_URL}/${initiative.uuid}/events/${event.id}`},

				link: {
					rel: "alternate",
					type: "text/html",
					href: `${INITIATIVES_URL}/${initiative.id}-hello-world#event-${event.id}`
				},

				updated: {$: event.updated_at.toJSON()},
				published: {$: event.occurred_at.toJSON()},

				title: {$: t("PARLIAMENT_COMMITTEE_MEETING_BY", {
					committee: "Keskkonnakomisjon"
				})}
			})
		})

		COMMITTEE_MEETING_DECISIONS.forEach(function(decision) {
			it(`must render initiative in parliament and committee meeting event with ${decision} decision`, function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "parliament",
					title: "Hello, world!"
				}))

				var event = eventsDb.create(new ValidEvent({
					initiative_uuid: initiative.uuid,
					created_at: pseudoDateTime(),
					updated_at: pseudoDateTime(),
					occurred_at: pseudoDateTime(),
					type: "parliament-committee-meeting",
					content: {committee: "Keskkonnakomisjon", decision: decision},
					origin: "parliament"
				}))

				var res = yield this.request(`/initiatives/${initiative.id}.atom`)
				res.statusCode.must.equal(200)

				Atom.parse(res.body).feed.entry.must.eql({
					id: {$: `${INITIATIVES_URL}/${initiative.uuid}/events/${event.id}`},

					link: {
						rel: "alternate",
						type: "text/html",
						href: `${INITIATIVES_URL}/${initiative.id}-hello-world#event-${event.id}`
					},

					updated: {$: event.updated_at.toJSON()},
					published: {$: event.occurred_at.toJSON()},

					title: {$: t("PARLIAMENT_COMMITTEE_MEETING_BY", {
						committee: "Keskkonnakomisjon"
					})},

					content: {
						type: "text",
						$: PARLIAMENT_MEETING_DECISION_TEXTS[decision] || null
					}
				})
			})
		})

		it("must render initiative in parliament and committee meeting event with links", function*() {
			var initiative = initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				phase: "parliament",
				title: "Hello, world!"
			}))

			var event = eventsDb.create(new ValidEvent({
				initiative_uuid: initiative.uuid,
				created_at: pseudoDateTime(),
				updated_at: pseudoDateTime(),
				occurred_at: pseudoDateTime(),
				type: "parliament-committee-meeting",
				origin: "parliament",

				content: {
					links: [
						{title: "Stenogramm", url: "https://stenogrammid.riigikogu.ee"},
						{title: "Riigikogu istung", url: "https://www.youtube.com"}
					]
				}
			}))

			var res = yield this.request(`/initiatives/${initiative.id}.atom`)
			res.statusCode.must.equal(200)

			Atom.parse(res.body).feed.entry.must.eql({
				id: {$: `${INITIATIVES_URL}/${initiative.uuid}/events/${event.id}`},

				link: {
					rel: "alternate",
					type: "text/html",
					href: `${INITIATIVES_URL}/${initiative.id}-hello-world#event-${event.id}`
				},

				updated: {$: event.updated_at.toJSON()},
				published: {$: event.occurred_at.toJSON()},
				title: {$: t("PARLIAMENT_COMMITTEE_MEETING")},

				content: {type: "text", $: outdent`
					Stenogramm: https://stenogrammid.riigikogu.ee
					Riigikogu istung: https://www.youtube.com
				`}
			})
		})

		it("must render initiative in parliament and committee meeting event with summary", function*() {
			var initiative = initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				phase: "parliament",
				title: "Hello, world!"
			}))

			var event = eventsDb.create(new ValidEvent({
				initiative_uuid: initiative.uuid,
				created_at: pseudoDateTime(),
				updated_at: pseudoDateTime(),
				occurred_at: pseudoDateTime(),
				type: "parliament-committee-meeting",
				content: {summary: "Talking happened."},
				origin: "parliament"
			}))

			var res = yield this.request(`/initiatives/${initiative.id}.atom`)
			res.statusCode.must.equal(200)

			Atom.parse(res.body).feed.entry.must.eql({
				id: {$: `${INITIATIVES_URL}/${initiative.uuid}/events/${event.id}`},

				link: {
					rel: "alternate",
					type: "text/html",
					href: `${INITIATIVES_URL}/${initiative.id}-hello-world#event-${event.id}`
				},

				updated: {$: event.updated_at.toJSON()},
				published: {$: event.occurred_at.toJSON()},
				title: {$: t("PARLIAMENT_COMMITTEE_MEETING")},
				content: {type: "text", $: "Talking happened."}
			})
		})

		it("must render initiative in parliament and plenary meeting event",
			function*() {
			var initiative = initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				phase: "parliament",
				title: "Hello, world!"
			}))

			var event = eventsDb.create(new ValidEvent({
				initiative_uuid: initiative.uuid,
				created_at: pseudoDateTime(),
				updated_at: pseudoDateTime(),
				occurred_at: pseudoDateTime(),
				type: "parliament-plenary-meeting",
				content: {},
				origin: "parliament"
			}))

			var res = yield this.request(`/initiatives/${initiative.id}.atom`)
			res.statusCode.must.equal(200)

			Atom.parse(res.body).feed.entry.must.eql({
				id: {$: `${INITIATIVES_URL}/${initiative.uuid}/events/${event.id}`},

				link: {
					rel: "alternate",
					type: "text/html",
					href: `${INITIATIVES_URL}/${initiative.id}-hello-world#event-${event.id}`
				},

				updated: {$: event.updated_at.toJSON()},
				published: {$: event.occurred_at.toJSON()},
				title: {$: t("PARLIAMENT_PLENARY_MEETING")}
			})
		})

		it("must render initiative in parliament and plenary meeting event with links", function*() {
			var initiative = initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				phase: "parliament",
				title: "Hello, world!"
			}))

			var event = eventsDb.create(new ValidEvent({
				initiative_uuid: initiative.uuid,
				created_at: pseudoDateTime(),
				updated_at: pseudoDateTime(),
				occurred_at: pseudoDateTime(),
				type: "parliament-plenary-meeting",
				origin: "parliament",

				content: {
					links: [
						{title: "Stenogramm", url: "https://stenogrammid.riigikogu.ee"},
						{title: "Riigikogu istung", url: "https://www.youtube.com"}
					]
				}
			}))

			var res = yield this.request(`/initiatives/${initiative.id}.atom`)
			res.statusCode.must.equal(200)

			Atom.parse(res.body).feed.entry.must.eql({
				id: {$: `${INITIATIVES_URL}/${initiative.uuid}/events/${event.id}`},

				link: {
					rel: "alternate",
					type: "text/html",
					href: `${INITIATIVES_URL}/${initiative.id}-hello-world#event-${event.id}`
				},

				updated: {$: event.updated_at.toJSON()},
				published: {$: event.occurred_at.toJSON()},
				title: {$: t("PARLIAMENT_PLENARY_MEETING")},

				content: {type: "text", $: outdent`
					Stenogramm: https://stenogrammid.riigikogu.ee
					Riigikogu istung: https://www.youtube.com
				`}
			})
		})

		it("must render initiative in parliament and plenary meeting event with summary", function*() {
			var initiative = initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				phase: "parliament",
				title: "Hello, world!"
			}))

			var event = eventsDb.create(new ValidEvent({
				initiative_uuid: initiative.uuid,
				created_at: pseudoDateTime(),
				updated_at: pseudoDateTime(),
				occurred_at: pseudoDateTime(),
				type: "parliament-plenary-meeting",
				content: {summary: "Talking happened."},
				origin: "parliament"
			}))

			var res = yield this.request(`/initiatives/${initiative.id}.atom`)
			res.statusCode.must.equal(200)

			Atom.parse(res.body).feed.entry.must.eql({
				id: {$: `${INITIATIVES_URL}/${initiative.uuid}/events/${event.id}`},

				link: {
					rel: "alternate",
					type: "text/html",
					href: `${INITIATIVES_URL}/${initiative.id}-hello-world#event-${event.id}`
				},

				updated: {$: event.updated_at.toJSON()},
				published: {$: event.occurred_at.toJSON()},
				title: {$: t("PARLIAMENT_PLENARY_MEETING")},
				content: {type: "text", $: "Talking happened."}
			})
		})

		it("must render initiative in parliament and decision event", function*() {
			var initiative = initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				phase: "parliament",
				title: "Hello, world!"
			}))

			var event = eventsDb.create(new ValidEvent({
				initiative_uuid: initiative.uuid,
				created_at: pseudoDateTime(),
				updated_at: pseudoDateTime(),
				occurred_at: pseudoDateTime(),
				type: "parliament-decision",
				content: {},
				origin: "parliament"
			}))

			var res = yield this.request(`/initiatives/${initiative.id}.atom`)
			res.statusCode.must.equal(200)

			Atom.parse(res.body).feed.entry.must.eql({
				id: {$: `${INITIATIVES_URL}/${initiative.uuid}/events/${event.id}`},

				link: {
					rel: "alternate",
					type: "text/html",
					href: `${INITIATIVES_URL}/${initiative.id}-hello-world#event-${event.id}`
				},

				updated: {$: event.updated_at.toJSON()},
				published: {$: event.occurred_at.toJSON()},
				title: {$: t("PARLIAMENT_DECISION")}
			})
		})

		it("must render initiative in parliament and decision event with summary", function*() {
			var initiative = initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				phase: "parliament",
				title: "Hello, world!"
			}))

			var event = eventsDb.create(new ValidEvent({
				initiative_uuid: initiative.uuid,
				created_at: pseudoDateTime(),
				updated_at: pseudoDateTime(),
				occurred_at: pseudoDateTime(),
				type: "parliament-decision",
				content: {summary: "Talking happened."},
				origin: "parliament"
			}))

			var res = yield this.request(`/initiatives/${initiative.id}.atom`)
			res.statusCode.must.equal(200)

			Atom.parse(res.body).feed.entry.must.eql({
				id: {$: `${INITIATIVES_URL}/${initiative.uuid}/events/${event.id}`},

				link: {
					rel: "alternate",
					type: "text/html",
					href: `${INITIATIVES_URL}/${initiative.id}-hello-world#event-${event.id}`
				},

				updated: {$: event.updated_at.toJSON()},
				published: {$: event.occurred_at.toJSON()},
				title: {$: t("PARLIAMENT_DECISION")},
				content: {type: "text", $: "Talking happened."}
			})
		})

		it("must render initiative in parliament and letter event", function*() {
			var initiative = initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				phase: "parliament",
				title: "Hello, world!"
			}))

			var event = eventsDb.create(new ValidEvent({
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

			var res = yield this.request(`/initiatives/${initiative.id}.atom`)
			res.statusCode.must.equal(200)

			Atom.parse(res.body).feed.entry.must.eql({
				id: {$: `${INITIATIVES_URL}/${initiative.uuid}/events/${event.id}`},

				link: {
					rel: "alternate",
					type: "text/html",
					href: `${INITIATIVES_URL}/${initiative.id}-hello-world#event-${event.id}`
				},

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
			var initiative = initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				phase: "parliament",
				title: "Hello, world!"
			}))

			var event = eventsDb.create(new ValidEvent({
				initiative_uuid: initiative.uuid,
				created_at: pseudoDateTime(),
				updated_at: pseudoDateTime(),
				occurred_at: pseudoDateTime(),
				origin: "parliament",
				type: "parliament-interpellation",
				content: {to: "John Wick", deadline: "2015-07-10"}
			}))

			var res = yield this.request(`/initiatives/${initiative.id}.atom`)
			res.statusCode.must.equal(200)

			Atom.parse(res.body).feed.entry.must.eql({
				id: {$: `${INITIATIVES_URL}/${initiative.uuid}/events/${event.id}`},

				link: {
					rel: "alternate",
					type: "text/html",
					href: `${INITIATIVES_URL}/${initiative.id}-hello-world#event-${event.id}`
				},

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
			var initiative = initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				phase: "parliament",
				title: "Hello, world!"
			}))

			var event = eventsDb.create(new ValidEvent({
				initiative_uuid: initiative.uuid,
				created_at: pseudoDateTime(),
				updated_at: pseudoDateTime(),
				occurred_at: pseudoDateTime(),
				origin: "parliament",
				type: "parliament-national-matter",
				content: {}
			}))

			var res = yield this.request(`/initiatives/${initiative.id}.atom`)
			res.statusCode.must.equal(200)

			Atom.parse(res.body).feed.entry.must.eql({
				id: {$: `${INITIATIVES_URL}/${initiative.uuid}/events/${event.id}`},

				link: {
					rel: "alternate",
					type: "text/html",
					href: `${INITIATIVES_URL}/${initiative.id}-hello-world#event-${event.id}`
				},

				updated: {$: event.updated_at.toJSON()},
				published: {$: event.occurred_at.toJSON()},
				title: {$: t("PARLIAMENT_NATIONAL_MATTER")}
			})
		})

		PARLIAMENT_DECISIONS.forEach(function(decision) {
			it(`must respond if initiative in parliament and finished with ${decision} decision`, function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "parliament",
					title: "Hello, world!",
					sent_to_parliament_at: DateFns.addDays(new Date, -30),
					parliament_decision: decision,
					finished_in_parliament_at: DateFns.addDays(new Date, -5)
				}))

				var res = yield this.request(`/initiatives/${initiative.id}.atom`)
				res.statusCode.must.equal(200)

				var entries = Atom.parse(res.body).feed.entry
				entries.length.must.equal(2)
				entries[0].id.$.must.match(/\/sent-to-parliament$/)

				entries[1].must.eql({
					id: {
						$: `${INITIATIVES_URL}/${initiative.uuid}/events/parliament-finished`
					},

					link: {
						rel: "alternate",
						type: "text/html",
						href: `${INITIATIVES_URL}/${initiative.id}-hello-world#event-parliament-finished`
					},

					updated: {$: initiative.finished_in_parliament_at.toJSON()},
					published: {$: initiative.finished_in_parliament_at.toJSON()},
					title: {$: t("PARLIAMENT_FINISHED")},

					content: {
						type: "text",
						$: PARLIAMENT_DECISION_TEXTS[decision] || null
					}
				})
			})

			it(`must respond if initiative in parliament and finished event with ${decision} decision`, function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.author.id,
					phase: "parliament",
					title: "Hello, world!",
					sent_to_parliament_at: DateFns.addDays(new Date, -30),
					parliament_decision: decision,
					finished_in_parliament_at: DateFns.addDays(new Date, -5)
				}))

				var event = eventsDb.create(new ValidEvent({
					initiative_uuid: initiative.uuid,
					occurred_at: DateFns.addDays(new Date, -3),
					type: "parliament-finished",
					content: null,
					origin: "parliament"
				}))

				var res = yield this.request(`/initiatives/${initiative.id}.atom`)
				res.statusCode.must.equal(200)

				var entries = Atom.parse(res.body).feed.entry
				entries.length.must.equal(2)
				entries[0].id.$.must.match(/\/sent-to-parliament$/)

				entries[1].must.eql({
					id: {$: `${INITIATIVES_URL}/${initiative.uuid}/events/${event.id}`},

					link: {
						rel: "alternate",
						type: "text/html",
						href: `${INITIATIVES_URL}/${initiative.id}-hello-world#event-${event.id}`
					},

					updated: {$: event.updated_at.toJSON()},
					published: {$: event.occurred_at.toJSON()},
					title: {$: t("PARLIAMENT_FINISHED")},

					content: {
						type: "text",
						$: PARLIAMENT_DECISION_TEXTS[decision] || null
					}
				})
			})
		})

		it("must render initiative in government", function*() {
			var initiative = initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				phase: "parliament",
				title: "Hello, world!",
				sent_to_government_at: new Date(2015, 5, 1),
				government_agency: "Sidususministeerium"
			}))

			var res = yield this.request(`/initiatives/${initiative.id}.atom`)
			res.statusCode.must.equal(200)

			Atom.parse(res.body).feed.entry.must.eql({
				id: {$: `${INITIATIVES_URL}/${initiative.uuid}/events/sent-to-government`},

				link: {
					rel: "alternate",
					type: "text/html",
					href: `${INITIATIVES_URL}/${initiative.id}-hello-world#event-sent-to-government`
				},

				updated: {$: initiative.sent_to_government_at.toJSON()},
				published: {$: initiative.sent_to_government_at.toJSON()},

				title: {$: t("EVENT_SENT_TO_GOVERNMENT_TITLE_WITH_AGENCY", {
					agency: initiative.government_agency
				})}
			})
		})

		it("must render initiative in government that's finished", function*() {
			var initiative = initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				phase: "parliament",
				title: "Hello, world!",
				sent_to_government_at: new Date(2015, 5, 1),
				government_agency: "Sidususministeerium",
				finished_in_government_at: new Date(2015, 5, 5),
				government_decision: "Anda alla."
			}))

			var res = yield this.request(`/initiatives/${initiative.id}.atom`)
			res.statusCode.must.equal(200)

			var entries = Atom.parse(res.body).feed.entry
			entries.length.must.equal(2)
			entries[0].id.$.must.match(/\/sent-to-government$/)

			entries[1].must.eql({
				id: {$: `${INITIATIVES_URL}/${initiative.uuid}/events/finished-in-government`},

				link: {
					rel: "alternate",
					type: "text/html",
					href: `${INITIATIVES_URL}/${initiative.id}-hello-world#event-finished-in-government`
				},

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

		it("must render initiative with media coverage event", function*() {
			var initiative = initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				phase: "parliament",
				title: "Hello, world!"
			}))

			var event = eventsDb.create(new ValidEvent({
				initiative_uuid: initiative.uuid,
				type: "media-coverage",
				title: "News at 11",
				content: {url: "http://example.com/article", publisher: "Newsbook"},
				created_at: pseudoDateTime(),
				occurred_at: pseudoDateTime()
			}))

			var res = yield this.request(`/initiatives/${initiative.id}.atom`)
			res.statusCode.must.equal(200)

			Atom.parse(res.body).feed.entry.must.eql({
				id: {$: `${INITIATIVES_URL}/${initiative.uuid}/events/${event.id}`},

				link: {
					rel: "alternate",
					type: "text/html",
					href: `${INITIATIVES_URL}/${initiative.id}-hello-world#event-${event.id}`
				},

				category: {term: "initiator"},
				updated: {$: event.updated_at.toJSON()},
				published: {$: event.occurred_at.toJSON()},
				title: {$: event.title},
				content: {type: "text/html", src: event.content.url},
				author: {name: {$: "Newsbook"}}
			})
		})

		it("must render initiative with text event", function*() {
			var initiative = initiativesDb.create(new ValidInitiative({
				user_id: this.author.id,
				phase: "parliament",
				title: "Hello, world!"
			}))

			var author = usersDb.create(new ValidUser({name: "Johnny Lang"}))

			var event = eventsDb.create(new ValidEvent({
				initiative_uuid: initiative.uuid,
				user_id: author.id,
				title: "This just in.",
				content: "Everything is fine!",
				created_at: pseudoDateTime(),
				occurred_at: pseudoDateTime()
			}))

			var res = yield this.request(`/initiatives/${initiative.id}.atom`)
			res.statusCode.must.equal(200)

			Atom.parse(res.body).feed.entry.must.eql({
				id: {$: `${INITIATIVES_URL}/${initiative.uuid}/events/${event.id}`},

				link: {
					rel: "alternate",
					type: "text/html",
					href: `${INITIATIVES_URL}/${initiative.id}-hello-world#event-${event.id}`
				},


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
					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: this.user.id,
						destination: "tallinn",
						title: "Hello, world!"
					}))

					var initiativePath = `/initiatives/${initiative.id}`
					var res = yield this.request(initiativePath, {
						method: "PUT",
						form: {destination: ""}
					})

					res.statusCode.must.equal(303)
					res.statusMessage.must.equal("Initiative Updated")
					res.headers.location.must.equal(initiativePath + "-hello-world")

					initiativesDb.read(initiative).must.eql({
						__proto__: initiative,
						destination: null
					})
				})

				concat(
					"parliament",
					Object.keys(LOCAL_GOVERNMENTS)
				).forEach(function(dest) {
					it(`must update destination to ${dest}`, function*() {
						var initiative = initiativesDb.create(new ValidInitiative({
							user_id: this.user.id,
							title: "Hello, world!"
						}))

						var initiativePath = `/initiatives/${initiative.id}`
						var res = yield this.request(initiativePath, {
							method: "PUT",
							form: {destination: dest}
						})

						res.statusCode.must.equal(303)
						res.statusMessage.must.equal("Initiative Updated")
						res.headers.location.must.equal(initiativePath + "-hello-world")

						initiativesDb.read(initiative).must.eql({
							__proto__: initiative,
							destination: dest
						})
					})
				})

				it("must update destination if coauthor", function*() {
					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: usersDb.create(new ValidUser).id,
						title: "Hello, world!"
					}))

					coauthorsDb.create(new ValidCoauthor({
						initiative: initiative,
						user: this.user,
						status: "accepted"
					}))

					var initiativePath = `/initiatives/${initiative.id}`
					var res = yield this.request(initiativePath, {
						method: "PUT",
						form: {destination: "parliament"}
					})

					res.statusCode.must.equal(303)
					res.statusMessage.must.equal("Initiative Updated")
					res.headers.location.must.equal(initiativePath + "-hello-world")

					initiativesDb.read(initiative).must.eql({
						__proto__: initiative,
						destination: "parliament"
					})
				})

				_.without(COAUTHOR_STATUSES, "accepted").forEach(function(status) {
					it(`must respond with 403 if ${status} coauthor`, function*() {
						var initiative = initiativesDb.create(new ValidInitiative({
							user_id: usersDb.create(new ValidUser).id
						}))

						coauthorsDb.create(new ValidCoauthor({
							initiative: initiative,
							user: this.user,
							status: status
						}))

						var res = yield this.request(`/initiatives/${initiative.id}`, {
							method: "PUT",
							form: {destination: "parliament"}
						})

						res.statusCode.must.equal(403)
						initiativesDb.read(initiative).must.eql(initiative)
					})
				})

				it("must respond with 422 given invalid destination", function*() {
					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: this.user.id
					}))

					var res = yield this.request(`/initiatives/${initiative.id}`, {
						method: "PUT",
						form: {destination: "foo"}
					})

					res.statusCode.must.equal(422)
					res.statusMessage.must.equal("Invalid Attributes")
					initiativesDb.read(initiative).must.eql(initiative)
				})

				it("must respond with 422 given Object.prototype destination",
					function*() {
					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: this.user.id
					}))

					var res = yield this.request(`/initiatives/${initiative.id}`, {
						method: "PUT",
						form: {destination: "hasOwnProperty"}
					})

					res.statusCode.must.equal(422)
					res.statusMessage.must.equal("Invalid Attributes")
					initiativesDb.read(initiative).must.eql(initiative)
				})

				it("must not update initiative destination after edit phase",
					function*() {
					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: this.user.id,
						phase: "sign",
						title: "Hello, world!"
					}))

					var initiativePath = `/initiatives/${initiative.id}`
					var res = yield this.request(initiativePath, {
						method: "PUT",
						form: {destination: "muhu-vald"}
					})

					res.statusCode.must.equal(303)
					res.statusMessage.must.equal("Initiative Updated")
					res.headers.location.must.equal(initiativePath + "-hello-world")
					initiativesDb.read(initiative).must.eql(initiative)
				})
			})

			describe("given local info", function() {
				it("must update attributes", function*() {
					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: this.user.id,
						title: "Hello, world!"
					}))

					var initiativePath = `/initiatives/${initiative.id}`
					var res = yield this.request(initiativePath, {
						method: "PUT",
						form: {
							author_name: "John Smith",
							author_url: "http://example.com/author",
							author_contacts: "51 234 456\njohn@example.com",
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
					res.statusMessage.must.equal("Initiative Updated")
					res.headers.location.must.equal(initiativePath + "-hello-world")

					initiativesDb.read(initiative).must.eql({
						__proto__: initiative,
						author_name: "John Smith",
						author_url: "http://example.com/author",
						author_contacts: "51 234 456\njohn@example.com",
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
					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: this.user.id
					}))

					var other = initiativesDb.create(new ValidInitiative({
						user_id: this.user.id
					}))

					var res = yield this.request(`/initiatives/${initiative.id}`, {
						method: "PUT",
						form: {notes: "Hello, world"}
					})

					res.statusCode.must.equal(303)
					res.statusMessage.must.equal("Initiative Updated")

					initiativesDb.search(sql`
						SELECT * FROM initiatives
					`).must.eql([
						{__proto__: initiative, notes: "Hello, world"},
						other,
					])
				})

				it("must respond with 403 when not author", function*() {
					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: usersDb.create(new ValidUser).id,
						published_at: new Date
					}))

					var res = yield this.request(`/initiatives/${initiative.id}`, {
						method: "PUT",
						form: {notes: "Hello, world"}
					})

					res.statusCode.must.equal(403)
					res.statusMessage.must.equal("No Permission to Edit")
					initiativesDb.read(initiative).must.eql(initiative)
				})

				_.each({
					"too long author_name": {author_name: _.repeat("a", 101)},

					"too long author_url": {
						author_url: _.repeat("a", MAX_URL_LENGTH + 1)
					},

					"too long author_contacts": {author_contacts: _.repeat("a", 501)},

					"too long url": {url: _.repeat("a", MAX_URL_LENGTH + 1)},

					"too long community_url": {
						community_url: _.repeat("a", MAX_URL_LENGTH + 1)
					},

					"too long notes": {notes: _.repeat("a", 8001)},

					"too long organization name": {
						"organizations[0][name]": _.repeat("a", 101)
					},

					"too long organization url": {
						"organizations[0][url]": _.repeat("a", MAX_URL_LENGTH + 1)
					},

					"meeting date format in year 10k": {
						"meetings[0][date]": "12015-06-18"
					},

					"invalid meeting date format": {"meetings[0][date]": "foo"},

					"too long meeting url": {
						"meetings[0][url]": _.repeat("a", MAX_URL_LENGTH + 1)
					},

					"too long media url": {
						"media_urls[0]": _.repeat("a", MAX_URL_LENGTH + 1)
					},

					"too long government change url": {
						"government_change_urls[0]": _.repeat("a", MAX_URL_LENGTH + 1)
					},

					"too long public change url": {
						"public_change_urls[0]": _.repeat("a", MAX_URL_LENGTH + 1)
					},
				}, function(attrs, title) {
					it(`must respond with 422 given ${title}`, function*() {
						var initiative = initiativesDb.create(new ValidInitiative({
							user_id: this.user.id
						}))

						var res = yield this.request(`/initiatives/${initiative.id}`, {
							method: "PUT",
							form: attrs
						})

						res.statusCode.must.equal(422)
						res.statusMessage.must.equal("Invalid Attributes")
						initiativesDb.read(initiative).must.eql(initiative)
					})
				})

				it("must redirect back to referrer without host", function*() {
					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: this.user.id
					}))

					var res = yield this.request(`/initiatives/${initiative.id}`, {
						method: "PUT",
						headers: {Referer: "/user"},
						form: {notes: "Hello, world"}
					})

					res.statusCode.must.equal(303)
					res.statusMessage.must.equal("Initiative Updated")
					res.headers.location.must.equal("/user")
				})

				it("must redirect back to referrer on same host", function*() {
					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: this.user.id
					}))

					var res = yield this.request(`/initiatives/${initiative.id}`, {
						method: "PUT",
						headers: {Referer: this.url + "/user"},
						form: {notes: "Hello, world"}
					})

					res.statusCode.must.equal(303)
					res.statusMessage.must.equal("Initiative Updated")
					res.headers.location.must.equal(this.url + "/user")
				})

				SITE_URLS.forEach(function(url) {
					it(`must redirect back to ${Url.parse(url).hostname}`, function*() {
						var initiative = initiativesDb.create(new ValidInitiative({
							user_id: this.user.id
						}))

						var res = yield this.request(`/initiatives/${initiative.id}`, {
							method: "PUT",
							headers: {Referer: url + "/user"},
							form: {notes: "Hello, world"}
						})

						res.statusCode.must.equal(303)
						res.statusMessage.must.equal("Initiative Updated")
						res.headers.location.must.equal(url + "/user")
					})
				})

				it("must not redirect back to other hosts", function*() {
					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: this.user.id,
						title: "Hello, world!"
					}))

					var initiativePath = `/initiatives/${initiative.id}`
					var res = yield this.request(initiativePath, {
						method: "PUT",
						headers: {Referer: "http://example.com/evil"},
						form: {notes: "Hello, world"}
					})

					res.statusCode.must.equal(303)
					res.statusMessage.must.equal("Initiative Updated")
					res.headers.location.must.equal(initiativePath + "-hello-world")
				})
			})

			describe("given visibility=public", function() {
				it("must render update page if author", function*() {
					usersDb.update(this.user, {
						email: "user@example.com",
						email_confirmed_at: new Date
					})

					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: this.user.id
					}))

					textsDb.create(new ValidText({
						initiative_uuid: initiative.uuid,
						user_id: this.user.id,
					}))

					var res = yield this.request("/initiatives/" + initiative.id, {
						method: "PUT",
						form: {visibility: "public"}
					})

					res.statusCode.must.equal(200)
					res.body.must.include(t("DEADLINE_EXPLANATION"))
					res.body.must.include(t("PUBLISH_TOPIC"))
				})

				it("must render update visibility page if coauthor", function*() {
					usersDb.update(this.user, {
						email: "user@example.com",
						email_confirmed_at: new Date
					})

					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: usersDb.create(new ValidUser).id
					}))

					coauthorsDb.create(new ValidCoauthor({
						initiative: initiative,
						user: this.user,
						status: "accepted"
					}))

					textsDb.create(new ValidText({
						initiative_uuid: initiative.uuid,
						user_id: this.user.id,
					}))

					var res = yield this.request("/initiatives/" + initiative.id, {
						method: "PUT",
						form: {visibility: "public"}
					})

					res.statusCode.must.equal(200)
				})

				it("must respond with 403 if not author", function*() {
					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: usersDb.create(new ValidUser).id,
						published_at: new Date
					}))

					var res = yield this.request("/initiatives/" + initiative.id, {
						method: "PUT",
						form: {visibility: "public"}
					})

					res.statusCode.must.equal(403)
					res.statusMessage.must.equal("No Permission to Edit")
				})

				_.without(COAUTHOR_STATUSES, "accepted").forEach(function(status) {
					it(`must respond with 403 if ${status} coauthor`, function*() {
						var initiative = initiativesDb.create(new ValidInitiative({
							user_id: usersDb.create(new ValidUser).id,
							published_at: new Date
						}))

						coauthorsDb.create(new ValidCoauthor({
							initiative: initiative,
							user: this.user,
							status: status
						}))

						var res = yield this.request("/initiatives/" + initiative.id, {
							method: "PUT",
							form: {visibility: "public"}
						})

						res.statusCode.must.equal(403)
						res.statusMessage.must.equal("No Permission to Edit")
					})
				})

				it("must respond with 422 if setting an invalid date", function*() {
					usersDb.update(this.user, {
						email: "user@example.com",
						email_confirmed_at: new Date
					})

					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: this.user.id,
						discussion_end_email_sent_at: new Date
					}))

					textsDb.create(new ValidText({
						initiative_uuid: initiative.uuid,
						user_id: this.user.id,
					}))

					var res = yield this.request(`/initiatives/${initiative.id}`, {
						method: "PUT",
						form: {visibility: "public", endsOn: "foo"}
					})

					res.statusCode.must.equal(422)
					res.statusMessage.must.equal("Deadline Too Near or Too Far")
					initiativesDb.read(initiative).must.eql(initiative)
				})

				it("must respond with 422 if setting a too short deadline",
					function*() {
					usersDb.update(this.user, {
						email: "user@example.com",
						email_confirmed_at: new Date
					})

					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: this.user.id,
						discussion_end_email_sent_at: new Date
					}))

					textsDb.create(new ValidText({
						initiative_uuid: initiative.uuid,
						user_id: this.user.id,
					}))

					var res = yield this.request(`/initiatives/${initiative.id}`, {
						method: "PUT",
						form: {
							visibility: "public",
							endsOn: formatIsoDate(DateFns.addDays(
								DateFns.startOfDay(new Date),
								Config.minEditingDeadlineDays - 2
							))
						}
					})

					res.statusCode.must.equal(422)
					res.statusMessage.must.equal("Deadline Too Near or Too Far")
					initiativesDb.read(initiative).must.eql(initiative)
				})

				it("must update initiative if setting a short deadline", function*() {
					usersDb.update(this.user, {
						email: "user@example.com",
						email_confirmed_at: new Date
					})

					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: this.user.id,
						title: "Hello, world!"
					}))

					textsDb.create(new ValidText({
						initiative_uuid: initiative.uuid,
						user_id: this.user.id,
					}))

					var endsOn = DateFns.addDays(
						DateFns.startOfDay(new Date),
						Config.minEditingDeadlineDays - 1
					)

					var initiativePath = `/initiatives/${initiative.id}`
					var res = yield this.request(initiativePath, {
						method: "PUT",
						form: {visibility: "public", endsOn: formatIsoDate(endsOn)}
					})

					res.statusCode.must.equal(303)
					res.statusMessage.must.equal("Initiative Published")
					res.headers.location.must.equal(initiativePath + "-hello-world")

					var cookies = parseCookies(res.headers["set-cookie"])
					res = yield this.request(res.headers.location, {
						headers: {Cookie: serializeCookies(cookies)}
					})

					res.statusCode.must.equal(200)
					res.body.must.include(t("PUBLISHED_INITIATIVE"))

					initiativesDb.read(initiative).must.eql({
						__proto__: initiative,
						published_at: new Date,
						discussion_ends_at: DateFns.addDays(endsOn, 1)
					})
				})

				it("must update initiative if setting a long deadline", function*() {
					usersDb.update(this.user, {
						email: "user@example.com",
						email_confirmed_at: new Date
					})

					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: this.user.id
					}))

					textsDb.create(new ValidText({
						initiative_uuid: initiative.uuid,
						user_id: this.user.id,
					}))

					var endsOn = DateFns.addDays(DateFns.addMonths(
						DateFns.startOfDay(new Date),
						Config.maxEditingDeadlineMonths
					), -1)

					var res = yield this.request(`/initiatives/${initiative.id}`, {
						method: "PUT",
						form: {visibility: "public", endsOn: formatIsoDate(endsOn)}
					})

					res.statusCode.must.equal(303)
					res.statusMessage.must.equal("Initiative Published")

					initiativesDb.read(initiative).must.eql({
						__proto__: initiative,
						published_at: new Date,
						discussion_ends_at: DateFns.addDays(endsOn, 1)
					})
				})

				it("must respond with 422 if setting a too long deadline", function*() {
					usersDb.update(this.user, {
						email: "user@example.com",
						email_confirmed_at: new Date
					})

					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: this.user.id,
						discussion_end_email_sent_at: new Date
					}))

					textsDb.create(new ValidText({
						initiative_uuid: initiative.uuid,
						user_id: this.user.id,
					}))

					var res = yield this.request(`/initiatives/${initiative.id}`, {
						method: "PUT",

						form: {
							visibility: "public",

							endsOn: formatIsoDate(DateFns.addMonths(
								DateFns.startOfDay(new Date),
								Config.maxEditingDeadlineMonths
							))
						}
					})

					res.statusCode.must.equal(422)
					res.statusMessage.must.equal("Deadline Too Near or Too Far")
					initiativesDb.read(initiative).must.eql(initiative)
				})

				it("must respond with 403 if no email set", function*() {
					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: this.user.id,
						published_at: DateFns.addDays(new Date, -90),
					}))

					textsDb.create(new ValidText({
						initiative_uuid: initiative.uuid,
						user_id: this.user.id,
					}))

					var res = yield this.request(`/initiatives/${initiative.id}`, {
						method: "PUT",
						form: {
							visibility: "public",
							endsOn: formatIsoDate(
								DateFns.addDays(new Date, Config.minEditingDeadlineDays - 1)
							)
						}
					})

					res.statusCode.must.equal(403)
					res.statusMessage.must.equal("Cannot Publish")
					initiativesDb.read(initiative).must.eql(initiative)
				})

				it("must respond with 403 if email unconfirmed", function*() {
					usersDb.update(this.user, {
						unconfirmed_email: "john@example.com",
						email_confirmation_token: Crypto.randomBytes(12)
					})

					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: this.user.id,
						discussion_end_email_sent_at: new Date,
						published_at: DateFns.addDays(new Date, -90),
					}))

					textsDb.create(new ValidText({
						initiative_uuid: initiative.uuid,
						user_id: this.user.id,
					}))

					var res = yield this.request(`/initiatives/${initiative.id}`, {
						method: "PUT",
						form: {
							visibility: "public",
							endsOn: formatIsoDate(
								DateFns.addDays(new Date, Config.minEditingDeadlineDays - 1)
							)
						}
					})

					res.statusCode.must.equal(403)
					res.statusMessage.must.equal("Cannot Publish")
					initiativesDb.read(initiative).must.eql(initiative)
				})

				it("must update initiative if coauthor", function*() {
					usersDb.update(this.user, {
						email: "user@example.com",
						email_confirmed_at: new Date
					})

					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: usersDb.create(new ValidUser).id
					}))

					coauthorsDb.create(new ValidCoauthor({
						initiative: initiative,
						user: this.user,
						status: "accepted"
					}))

					textsDb.create(new ValidText({
						initiative_uuid: initiative.uuid,
						user_id: this.user.id,
					}))

					var res = yield this.request(`/initiatives/${initiative.id}`, {
						method: "PUT",
						form: {
							visibility: "public",
							endsOn: formatIsoDate(
								DateFns.addDays(new Date, Config.minEditingDeadlineDays - 1)
							)
						}
					})

					res.statusCode.must.equal(303)
					res.statusMessage.must.equal("Initiative Published")
				})

				it("must not update initiative if no text created", function*() {
					usersDb.update(this.user, {
						email: "user@example.com",
						email_confirmed_at: new Date
					})

					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: this.user.id
					}))

					var res = yield this.request(`/initiatives/${initiative.id}`, {
						method: "PUT",
						form: {
							visibility: "public",
							endsOn: formatIsoDate(
								DateFns.addDays(new Date, Config.minEditingDeadlineDays - 1)
							)
						}
					})

					res.statusCode.must.equal(422)
					res.statusMessage.must.equal("No Text")
					initiativesDb.read(initiative).must.eql(initiative)
				})

				it("must subscribe publisher to comments", function*() {
					usersDb.update(this.user, {
						email: "user@example.com",
						email_confirmed_at: new Date
					})

					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: this.user.id
					}))

					textsDb.create(new ValidText({
						initiative_uuid: initiative.uuid,
						user_id: this.user.id,
					}))

					var res = yield this.request(`/initiatives/${initiative.id}`, {
						method: "PUT",
						form: {
							visibility: "public",
							endsOn: formatIsoDate(
								DateFns.addDays(new Date, Config.minEditingDeadlineDays - 1)
							)
						}
					})

					res.statusCode.must.equal(303)
					res.statusMessage.must.equal("Initiative Published")

					var subscriptions = subscriptionsDb.search(sql`
						SELECT * FROM initiative_subscriptions
					`)

					subscriptions.must.eql([new ValidSubscription({
						initiative_uuid: initiative.uuid,
						email: "user@example.com",
						created_ip: "127.0.0.1",
						confirmed_at: new Date,
						update_token: subscriptions[0].update_token,
						comment_interest: true
					})])
				})

				it("must confirm and subscribe publisher to comments if subscription pending", function*() {
					usersDb.update(this.user, {
						email: "user@example.com",
						email_confirmed_at: new Date
					})

					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: this.user.id
					}))

					textsDb.create(new ValidText({
						initiative_uuid: initiative.uuid,
						user_id: this.user.id,
					}))

					var sub = subscriptionsDb.create(new ValidSubscription({
						initiative_uuid: initiative.uuid,
						email: "user@example.com",
						confirmation_sent_at: new Date,
						event_interest: false,
						comment_interest: false
					}))

					var res = yield this.request(`/initiatives/${initiative.id}`, {
						method: "PUT",
						form: {
							visibility: "public",
							endsOn: formatIsoDate(
								DateFns.addDays(new Date, Config.minEditingDeadlineDays - 1)
							)
						}
					})

					res.statusCode.must.equal(303)
					res.statusMessage.must.equal("Initiative Published")

					subscriptionsDb.search(sql`
						SELECT * FROM initiative_subscriptions
					`).must.eql([{
						__proto__: sub,
						confirmed_at: new Date,
						event_interest: true,
						comment_interest: true
					}])
				})

				it("must subscribe publisher to comments if already subscribed", function*() {
					usersDb.update(this.user, {
						email: "user@example.com",
						email_confirmed_at: new Date
					})

					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: this.user.id
					}))

					textsDb.create(new ValidText({
						initiative_uuid: initiative.uuid,
						user_id: this.user.id,
					}))

					var sub = subscriptionsDb.create(new ValidSubscription({
						initiative_uuid: initiative.uuid,
						email: "user@example.com",
						confirmed_at: pseudoDateTime(),
						event_interest: false,
						comment_interest: false
					}))

					var res = yield this.request(`/initiatives/${initiative.id}`, {
						method: "PUT",
						form: {
							visibility: "public",
							endsOn: formatIsoDate(
								DateFns.addDays(new Date, Config.minEditingDeadlineDays - 1)
							)
						}
					})

					res.statusCode.must.equal(303)
					res.statusMessage.must.equal("Initiative Published")

					subscriptionsDb.search(sql`
						SELECT * FROM initiative_subscriptions
					`).must.eql([{
						__proto__: sub,
						event_interest: true,
						comment_interest: true
					}])
				})

				it("must email subscribers of new initiatives without destination",
					function*() {
					usersDb.update(this.user, {
						name: "Johnny Lang",
						email: "user@example.com",
						email_confirmed_at: new Date
					})

					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: this.user.id,
						title: "Hello, world!"
					}))

					textsDb.create(new ValidText({
						initiative_uuid: initiative.uuid,
						user_id: this.user.id,
					}))

					subscriptionsDb.create([
						new ValidSubscription({
							initiative_uuid: initiative.uuid,
							confirmed_at: new Date,
							new_interest: false
						}),

						new ValidSubscription({
							initiative_uuid: null,
							confirmed_at: new Date,
							new_interest: false
						}),

						new ValidSubscription({
							initiative_destination: "parliament",
							confirmed_at: new Date,
							new_interest: true
						}),

						new ValidSubscription({
							initiative_destination: "tallinn",
							confirmed_at: new Date,
							new_interest: true
						})
					])

					var subscriptions = subscriptionsDb.create([
						new ValidSubscription({
							initiative_uuid: null,
							confirmed_at: new Date,
							new_interest: true
						}),

						new ValidSubscription({
							initiative_uuid: null,
							confirmed_at: new Date,
							new_interest: true
						})
					])

					var res = yield this.request(`/initiatives/${initiative.id}`, {
						method: "PUT",
						form: {
							visibility: "public",
							endsOn: formatIsoDate(
								DateFns.addDays(new Date, Config.minEditingDeadlineDays - 1)
							)
						}
					})

					res.statusCode.must.equal(303)

					var messages = messagesDb.search(sql`
						SELECT * FROM initiative_messages
					`)

					var message = messages[0]
					var emails = subscriptions.map((s) => s.email).sort()

					messages.must.eql([{
						id: message.id,
						initiative_uuid: initiative.uuid,
						created_at: new Date,
						updated_at: new Date,
						origin: "status",

						title: t("INITIATIVE_PUBLISHED_MESSAGE_TITLE", {
							initiativeTitle: initiative.title
						}),

						text: renderEmail("INITIATIVE_PUBLISHED_MESSAGE_BODY", {
							initiativeTitle: initiative.title,

							initiativeUrl:
								`${Config.url}/initiatives/${initiative.id}-hello-world`,

							authorName: "Johnny Lang"
						}),

						sent_at: new Date,
						sent_to: emails
					}])

					this.emails.length.must.equal(1)
					var email = this.emails[0]

					email.envelope.to.must.eql(emails)
					email.headers.subject.must.equal(message.title)

					JSON.parse(email.headers["x-mailgun-recipient-variables"]).must.eql(
						serializeMailgunVariables(subscriptions)
					)
				})

				it("must email subscribers of new parliament initiatives", function*() {
					usersDb.update(this.user, {
						name: "Johnny Lang",
						email: "user@example.com",
						email_confirmed_at: new Date
					})

					var initiative = initiativesDb.create(new ValidInitiative({
						destination: "parliament",
						user_id: this.user.id,
						title: "Hello, world!"
					}))

					textsDb.create(new ValidText({
						initiative_uuid: initiative.uuid,
						user_id: this.user.id,
					}))

					subscriptionsDb.create([
						new ValidSubscription({
							initiative_uuid: initiative.uuid,
							confirmed_at: new Date,
							new_interest: false
						}),

						new ValidSubscription({
							initiative_uuid: null,
							confirmed_at: new Date,
							new_interest: false
						}),

						new ValidSubscription({
							initiative_destination: "tallinn",
							confirmed_at: new Date,
							new_interest: true
						})
					])

					var subscriptions = subscriptionsDb.create([
						new ValidSubscription({
							initiative_uuid: null,
							confirmed_at: new Date,
							new_interest: true
						}),

						new ValidSubscription({
							initiative_uuid: null,
							confirmed_at: new Date,
							new_interest: true
						}),

						new ValidSubscription({
							initiative_destination: initiative.destination,
							confirmed_at: new Date,
							new_interest: true
						})
					])

					var res = yield this.request(`/initiatives/${initiative.id}`, {
						method: "PUT",
						form: {
							visibility: "public",
							endsOn: formatIsoDate(
								DateFns.addDays(new Date, Config.minEditingDeadlineDays - 1)
							)
						}
					})

					res.statusCode.must.equal(303)

					var messages = messagesDb.search(sql`
						SELECT * FROM initiative_messages
					`)

					var message = messages[0]
					var emails = subscriptions.map((s) => s.email).sort()

					messages.must.eql([{
						id: message.id,
						initiative_uuid: initiative.uuid,
						created_at: new Date,
						updated_at: new Date,
						origin: "status",

						title: t("INITIATIVE_PUBLISHED_MESSAGE_TITLE", {
							initiativeTitle: initiative.title
						}),

						text: renderEmail("INITIATIVE_PUBLISHED_MESSAGE_BODY", {
							initiativeTitle: initiative.title,

							initiativeUrl:
								`${Config.url}/initiatives/${initiative.id}-hello-world`,

							authorName: "Johnny Lang"
						}),

						sent_at: new Date,
						sent_to: emails
					}])

					this.emails.length.must.equal(1)
					var email = this.emails[0]

					email.envelope.to.must.eql(emails)
					email.headers.subject.must.equal(message.title)

					JSON.parse(email.headers["x-mailgun-recipient-variables"]).must.eql(
						serializeMailgunVariables(subscriptions)
					)
				})

				it("must email subscribers of new local initiatives", function*() {
					usersDb.update(this.user, {
						name: "Johnny Lang",
						email: "user@example.com",
						email_confirmed_at: new Date
					})

					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: this.user.id,
						destination: "tallinn",
						title: "Hello, world!"
					}))

					textsDb.create(new ValidText({
						initiative_uuid: initiative.uuid,
						user_id: this.user.id,
					}))

					subscriptionsDb.create([
						new ValidSubscription({
							initiative_uuid: initiative.uuid,
							confirmed_at: new Date,
							new_interest: false
						}),

						new ValidSubscription({
							initiative_uuid: null,
							confirmed_at: new Date,
							new_interest: false
						}),

						new ValidSubscription({
							initiative_destination: "parliament",
							confirmed_at: new Date,
							new_interest: true
						})
					])

					var subscriptions = subscriptionsDb.create([
						new ValidSubscription({
							initiative_uuid: null,
							confirmed_at: new Date,
							new_interest: true
						}),

						new ValidSubscription({
							initiative_uuid: null,
							confirmed_at: new Date,
							new_interest: true
						}),

						new ValidSubscription({
							initiative_destination: initiative.destination,
							confirmed_at: new Date,
							new_interest: true
						})
					])

					var res = yield this.request(`/initiatives/${initiative.id}`, {
						method: "PUT",
						form: {
							visibility: "public",
							endsOn: formatIsoDate(
								DateFns.addDays(new Date, Config.minEditingDeadlineDays - 1)
							)
						}
					})

					res.statusCode.must.equal(303)

					var messages = messagesDb.search(sql`
						SELECT * FROM initiative_messages
					`)

					var message = messages[0]
					var emails = subscriptions.map((s) => s.email).sort()

					messages.must.eql([{
						id: message.id,
						initiative_uuid: initiative.uuid,
						created_at: new Date,
						updated_at: new Date,
						origin: "status",

						title: t("INITIATIVE_PUBLISHED_MESSAGE_TITLE", {
							initiativeTitle: initiative.title
						}),

						text: renderEmail("INITIATIVE_PUBLISHED_MESSAGE_BODY", {
							initiativeTitle: initiative.title,

							initiativeUrl:
								`${Config.url}/initiatives/${initiative.id}-hello-world`,

							authorName: "Johnny Lang"
						}),

						sent_at: new Date,
						sent_to: emails
					}])

					this.emails.length.must.equal(1)
					var email = this.emails[0]

					email.envelope.to.must.eql(emails)
					email.headers.subject.must.equal(message.title)

					JSON.parse(email.headers["x-mailgun-recipient-variables"]).must.eql(
						serializeMailgunVariables(subscriptions)
					)
				})

				describe("when already published", function() {
					beforeEach(function() {
						usersDb.update(this.user, {
							email: "user@example.com",
							email_confirmed_at: new Date
						})
					})

					it("must respond with 422 if setting a too short deadline",
						function*() {
						var initiative = initiativesDb.create(new ValidInitiative({
							user_id: this.user.id,
							discussion_end_email_sent_at: new Date,
							published_at: DateFns.addDays(new Date, -1),
						}))

						textsDb.create(new ValidText({
							initiative_uuid: initiative.uuid,
							user_id: this.user.id,
						}))

						var res = yield this.request(`/initiatives/${initiative.id}`, {
							method: "PUT",
							form: {
								visibility: "public",
								endsOn: formatIsoDate(DateFns.addDays(
									initiative.published_at,
									Config.minEditingDeadlineDays - 2
								))
							}
						})

						res.statusCode.must.equal(422)
						res.statusMessage.must.equal("Deadline Too Near or Too Far")
						initiativesDb.read(initiative).must.eql(initiative)
					})

					it("must update initiative if setting a short deadline", function*() {
						var initiative = initiativesDb.create(new ValidInitiative({
							user_id: this.user.id,
							title: "Hello, world!",
							published_at: DateFns.addDays(new Date, -1),
						}))

						textsDb.create(new ValidText({
							initiative_uuid: initiative.uuid,
							user_id: this.user.id,
						}))

						var endsOn = DateFns.addDays(
							DateFns.startOfDay(initiative.published_at),
							Config.minEditingDeadlineDays - 1
						)

						var initiativePath = `/initiatives/${initiative.id}`
						var res = yield this.request(initiativePath, {
							method: "PUT",
							form: {visibility: "public", endsOn: formatIsoDate(endsOn)}
						})

						res.statusCode.must.equal(303)
						res.statusMessage.must.equal("Initiative Updated")
						res.headers.location.must.equal(initiativePath + "-hello-world")

						var cookies = parseCookies(res.headers["set-cookie"])
						res = yield this.request(res.headers.location, {
							headers: {Cookie: serializeCookies(cookies)}
						})

						res.statusCode.must.equal(200)
						res.body.must.include(t("INITIATIVE_DISCUSSION_DEADLINE_UPDATED"))

						initiativesDb.read(initiative).must.eql({
							__proto__: initiative,
							discussion_ends_at: DateFns.addDays(endsOn, 1)
						})
					})

					it("must update initiative if setting a long deadline", function*() {
						var initiative = initiativesDb.create(new ValidInitiative({
							user_id: this.user.id,
							published_at: DateFns.addDays(new Date, -1),
						}))

						textsDb.create(new ValidText({
							initiative_uuid: initiative.uuid,
							user_id: this.user.id,
						}))

						var endsOn = DateFns.addDays(DateFns.addMonths(
							DateFns.startOfDay(initiative.published_at),
							Config.maxEditingDeadlineMonths
						), -1)

						var res = yield this.request(`/initiatives/${initiative.id}`, {
							method: "PUT",
							form: {visibility: "public", endsOn: formatIsoDate(endsOn)}
						})

						res.statusCode.must.equal(303)
						res.statusMessage.must.equal("Initiative Updated")

						initiativesDb.read(initiative).must.eql({
							__proto__: initiative,
							discussion_ends_at: DateFns.addDays(endsOn, 1)
						})
					})

					it("must respond with 422 if setting a too long deadline",
						function*() {
						var initiative = initiativesDb.create(new ValidInitiative({
							user_id: this.user.id,
							discussion_end_email_sent_at: new Date,
							published_at: DateFns.addDays(new Date, -1),
						}))

						textsDb.create(new ValidText({
							initiative_uuid: initiative.uuid,
							user_id: this.user.id,
						}))

						var res = yield this.request(`/initiatives/${initiative.id}`, {
							method: "PUT",
							form: {
								visibility: "public",
								endsOn: formatIsoDate(DateFns.addMonths(
									DateFns.startOfDay(initiative.published_at),
									Config.maxEditingDeadlineMonths
								))
							}
						})

						res.statusCode.must.equal(422)
						res.statusMessage.must.equal("Deadline Too Near or Too Far")
						initiativesDb.read(initiative).must.eql(initiative)
					})

					it("must clear end email when setting discussion end time",
						function*() {
						var initiative = initiativesDb.create(new ValidInitiative({
							user_id: this.user.id,
							published_at: new Date,
							discussion_end_email_sent_at: pseudoDateTime()
						}))

						textsDb.create(new ValidText({
							initiative_uuid: initiative.uuid,
							user_id: this.user.id,
						}))

						var endsOn = DateFns.addDays(DateFns.startOfDay(new Date), 5)

						var res = yield this.request(`/initiatives/${initiative.id}`, {
							method: "PUT",
							form: {visibility: "public", endsOn: formatIsoDate(endsOn)}
						})

						res.statusCode.must.equal(303)
						res.statusMessage.must.equal("Initiative Updated")

						initiativesDb.read(initiative).must.eql({
							__proto__: initiative,
							discussion_ends_at: DateFns.addDays(endsOn, 1),
							discussion_end_email_sent_at: null
						})
					})

					it("must not clear end email when setting discussion end time to past", function*() {
						var initiative = initiativesDb.create(new ValidInitiative({
							user_id: this.user.id,
							published_at: DateFns.addDays(new Date, -5),
							discussion_end_email_sent_at: DateFns.addDays(new Date, -1),
						}))

						textsDb.create(new ValidText({
							initiative_uuid: initiative.uuid,
							user_id: this.user.id,
						}))

						var endsOn = DateFns.addDays(
							DateFns.startOfDay(initiative.published_at),
							Config.minEditingDeadlineDays - 1
						)

						var res = yield this.request(`/initiatives/${initiative.id}`, {
							method: "PUT",
							form: {visibility: "public", endsOn: formatIsoDate(endsOn)}
						})

						res.statusCode.must.equal(303)
						res.statusMessage.must.equal("Initiative Updated")

						initiativesDb.read(initiative).must.eql({
							__proto__: initiative,
							discussion_ends_at: DateFns.addDays(endsOn, 1),
						})
					})

					it("must respond with 403 if not in edit phase", function*() {
						var initiative = initiativesDb.create(new ValidInitiative({
							user_id: this.user.id,
							phase: "sign"
						}))

						textsDb.create(new ValidText({
							initiative_uuid: initiative.uuid,
							user_id: this.user.id
						}))

						var res = yield this.request(`/initiatives/${initiative.id}`, {
							method: "PUT",
							form: {
								visibility: "public",
								endsOn: formatIsoDate(DateFns.addDays(
									initiative.published_at,
									Config.minEditingDeadlineDays - 1
								))
							}
						})

						res.statusCode.must.equal(403)
						res.statusMessage.must.equal("Already Published")
						initiativesDb.read(initiative).must.eql(initiative)
					})

					it("must not subscribe publisher to comments", function*() {
						usersDb.update(this.user, {
							email: "user@example.com",
							email_confirmed_at: new Date
						})

						var initiative = initiativesDb.create(new ValidInitiative({
							user_id: this.user.id,
							published_at: DateFns.addDays(new Date, -90),
						}))

						textsDb.create(new ValidText({
							initiative_uuid: initiative.uuid,
							user_id: this.user.id,
						}))

						var res = yield this.request(`/initiatives/${initiative.id}`, {
							method: "PUT",
							form: {
								visibility: "public",
								endsOn: formatIsoDate(
									DateFns.addDays(new Date, Config.minEditingDeadlineDays - 1)
								)
							}
						})

						res.statusCode.must.equal(303)
						res.statusMessage.must.equal("Initiative Updated")

						subscriptionsDb.search(sql`
							SELECT * FROM initiative_subscriptions
						`).must.be.empty()
					})
				})
			})

			describe("given status=voting", function() {
				it("must render update page if author", function*() {
					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: this.user.id,
						destination: "parliament",

						published_at: DateFns.addDays(
							new Date,
							-Config.minSigningDeadlineDays
						)
					}))

					var res = yield this.request("/initiatives/" + initiative.id, {
						method: "PUT",
						form: {status: "voting"}
					})

					res.statusCode.must.equal(200)

					res.body.must.include(
						t("INITIATIVE_SEND_TO_SIGN_CHOOSE_LANGUAGE_DESCRIPTION")
					)
				})

				it("must render update page if coauthor", function*() {
					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: usersDb.create(new ValidUser).id,
						destination: "parliament",

						published_at: DateFns.addDays(
							new Date,
							-Config.minSigningDeadlineDays
						)
					}))

					coauthorsDb.create(new ValidCoauthor({
						initiative: initiative,
						user: this.user,
						status: "accepted"
					}))

					var res = yield this.request("/initiatives/" + initiative.id, {
						method: "PUT",
						form: {status: "voting"}
					})

					res.statusCode.must.equal(200)
				})

				it("must respond with 403 if not author", function*() {
					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: usersDb.create(new ValidUser).id,
						published_at: new Date
					}))

					var res = yield this.request("/initiatives/" + initiative.id, {
						method: "PUT",
						form: {status: "voting"}
					})

					res.statusCode.must.equal(403)
					res.statusMessage.must.equal("No Permission to Edit")
				})

				_.without(COAUTHOR_STATUSES, "accepted").forEach(function(status) {
					it(`must respond with 403 if ${status} coauthor`, function*() {
						var initiative = initiativesDb.create(new ValidInitiative({
							user_id: usersDb.create(new ValidUser).id,
							published_at: new Date
						}))

						coauthorsDb.create(new ValidCoauthor({
							initiative: initiative,
							user: this.user,
							status: status
						}))

						var res = yield this.request("/initiatives/" + initiative.id, {
							method: "PUT",
							form: {status: "voting"}
						})

						res.statusCode.must.equal(403)
						res.statusMessage.must.equal("No Permission to Edit")
					})
				})

				it("must respond with 403 if no destination", function*() {
					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: this.user.id,
						destination: null,

						published_at: DateFns.addDays(
							new Date,
							-Config.minSigningDeadlineDays
						)
					}))

					var text = textsDb.create(new ValidText({
						initiative_uuid: initiative.uuid,
						user_id: this.user.id
					}))

					var res = yield this.request(`/initiatives/${initiative.id}`, {
						method: "PUT",
						form: {
							status: "voting",
							language: text.language,
							endsOn: formatIsoDate(DateFns.addDays(new Date, 30))
						}
					})

					res.statusCode.must.equal(403)
					res.statusMessage.must.equal("Cannot Update to Sign Phase")
					initiativesDb.read(initiative).must.eql(initiative)
				})

				it("must update initiative given Trix text and short deadline",
					function*() {
					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: this.user.id,
						destination: "parliament",
						title: "Hello, world!",

						published_at: DateFns.addDays(
							new Date,
							-Config.minSigningDeadlineDays
						)
					}))

					var text = textsDb.create(new ValidText({
						initiative_uuid: initiative.uuid,
						user_id: this.user.id,
						content: newTrixDocument("Hello, world!"),
						content_type: TRIX_TYPE
					}))

					var endsOn = DateFns.addDays(
						DateFns.startOfDay(new Date),
						Config.minSigningDeadlineDays - 1
					)

					var initiativePath = `/initiatives/${initiative.id}`
					var res = yield this.request(initiativePath, {
						method: "PUT",
						form: {
							status: "voting",
							language: text.language,
							endsOn: formatIsoDate(endsOn)
						}
					})

					res.statusCode.must.equal(303)
					res.statusMessage.must.equal("Initiative Sent to Signing")
					res.headers.location.must.equal(initiativePath + "-hello-world")

					var cookies = parseCookies(res.headers["set-cookie"])
					res = yield this.request(res.headers.location, {
						headers: {Cookie: serializeCookies(cookies)}
					})

					res.statusCode.must.equal(200)
					res.body.must.include(t("INITIATIVE_SIGN_PHASE_UPDATED"))

					var html = Initiative.renderForParliament(text)

					initiativesDb.search(sql`
						SELECT * FROM initiatives
					`).must.eql([{
						__proto__: initiative,
						phase: "sign",
						signing_started_at: new Date,
						signing_ends_at: DateFns.addDays(endsOn, 1),
						title: text.title,
						text: html,
						text_type: new MediaType("text/html"),
						text_sha256: sha256(html)
					}])
				})

				it("must update initiative given Trix text sections and short deadline",
					function*() {
					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: this.user.id,
						destination: "parliament",
						title: "Hello, world!",

						published_at: DateFns.addDays(
							new Date,
							-Config.minSigningDeadlineDays
						)
					}))

					var text = textsDb.create(new ValidText({
						initiative_uuid: initiative.uuid,
						user_id: this.user.id,
						content: {
							summary: newTrixDocument("World."),
							problem: newTrixDocument("Bad world."),
							solution: newTrixDocument("Make better.")
						},
						content_type: TRIX_SECTIONS_TYPE
					}))

					var endsOn = DateFns.addDays(
						DateFns.startOfDay(new Date),
						Config.minSigningDeadlineDays - 1
					)

					var initiativePath = `/initiatives/${initiative.id}`
					var res = yield this.request(initiativePath, {
						method: "PUT",
						form: {
							status: "voting",
							language: text.language,
							endsOn: formatIsoDate(endsOn)
						}
					})

					res.statusCode.must.equal(303)
					res.statusMessage.must.equal("Initiative Sent to Signing")
					res.headers.location.must.equal(initiativePath + "-hello-world")

					var cookies = parseCookies(res.headers["set-cookie"])
					res = yield this.request(res.headers.location, {
						headers: {Cookie: serializeCookies(cookies)}
					})

					res.statusCode.must.equal(200)
					res.body.must.include(t("INITIATIVE_SIGN_PHASE_UPDATED"))

					var html = Initiative.renderForParliament(text)

					initiativesDb.search(sql`
						SELECT * FROM initiatives
					`).must.eql([{
						__proto__: initiative,
						phase: "sign",
						signing_started_at: new Date,
						signing_ends_at: DateFns.addDays(endsOn, 1),
						title: text.title,
						text: html,
						text_type: new MediaType("text/html"),
						text_sha256: sha256(html)
					}])
				})

				it("must update initiative given CitizenOS HTML and short deadline",
					function*() {
					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: this.user.id,
						destination: "parliament",
						title: "Hello, world!",

						published_at: DateFns.addDays(
							new Date,
							-Config.minSigningDeadlineDays
						)
					}))

					var text = textsDb.create(new ValidText({
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

					var endsOn = DateFns.addDays(
						DateFns.startOfDay(new Date),
						Config.minSigningDeadlineDays - 1
					)

					var initiativePath = `/initiatives/${initiative.id}`
					var res = yield this.request(initiativePath, {
						method: "PUT",
						form: {
							language: text.language,
							status: "voting",
							endsOn: formatIsoDate(endsOn)
						}
					})

					res.statusCode.must.equal(303)
					res.statusMessage.must.equal("Initiative Sent to Signing")
					res.headers.location.must.equal(initiativePath + "-hello-world")

					var cookies = parseCookies(res.headers["set-cookie"])
					res = yield this.request(res.headers.location, {
						headers: {Cookie: serializeCookies(cookies)}
					})

					res.statusCode.must.equal(200)
					res.body.must.include(t("INITIATIVE_SIGN_PHASE_UPDATED"))

					var html = Initiative.renderForParliament(text)
					html.must.include("Rest in peace!")

					initiativesDb.search(sql`
						SELECT * FROM initiatives
					`).must.eql([{
						__proto__: initiative,
						phase: "sign",
						signing_started_at: new Date,
						signing_ends_at: DateFns.addDays(endsOn, 1),
						title: text.title,
						text: html,
						text_type: new MediaType("text/html"),
						text_sha256: sha256(html)
					}])
				})

				it("must respond with 403 if less than 3 days passed since publish",
					function*() {
					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: this.user.id,
						destination: "parliament",

						published_at: DateFns.addDays(
							new Date,
							-Config.minSigningDeadlineDays + 1
						)
					}))

					var res = yield this.request(`/initiatives/${initiative.id}`, {
						method: "PUT",
						form: {
							status: "voting",
							endsOn: formatIsoDate(DateFns.addDays(new Date, 30))
						}
					})

					res.statusCode.must.equal(403)
					res.statusMessage.must.equal("Cannot Update to Sign Phase")
					initiativesDb.read(initiative).must.eql(initiative)
				})

				it("must respond with 422 if setting an invalid date", function*() {
					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: this.user.id,
						destination: "parliament",

						published_at: DateFns.addDays(
							new Date,
							-Config.minSigningDeadlineDays
						)
					}))

					var res = yield this.request(`/initiatives/${initiative.id}`, {
						method: "PUT",
						form: {status: "voting", endsOn: "foo"}
					})

					res.statusCode.must.equal(422)
					res.statusMessage.must.equal("Deadline Too Near or Too Far")
					initiativesDb.read(initiative).must.eql(initiative)
				})

				it("must respond with 422 if setting a too short deadline",
					function*() {
					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: this.user.id,
						destination: "parliament",

						published_at: DateFns.addDays(
							new Date,
							-Config.minSigningDeadlineDays
						)
					}))

					var res = yield this.request(`/initiatives/${initiative.id}`, {
						method: "PUT",
						form: {
							status: "voting",
							endsOn: formatIsoDate(
								DateFns.addDays(new Date, Config.minSigningDeadlineDays - 2)
							)
						}
					})

					res.statusCode.must.equal(422)
					res.statusMessage.must.equal("Deadline Too Near or Too Far")
					initiativesDb.read(initiative).must.eql(initiative)
				})

				it("must update initiative if setting a short deadline", function*() {
					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: this.user.id,
						destination: "parliament",
						title: "Hello, world!",

						published_at: DateFns.addDays(
							new Date,
							-Config.minEditingDeadlineDays
						)
					}))

					var text = textsDb.create(new ValidText({
						initiative_uuid: initiative.uuid,
						user_id: this.user.id
					}))

					var endsOn = DateFns.addDays(
						new Date,
						Config.minSigningDeadlineDays - 1
					)

					var initiativePath = `/initiatives/${initiative.id}`
					var res = yield this.request(initiativePath, {
						method: "PUT",
						form: {
							status: "voting",
							language: text.language,
							endsOn: formatIsoDate(endsOn)
						}
					})

					res.statusCode.must.equal(303)
					res.statusMessage.must.equal("Initiative Sent to Signing")
					res.headers.location.must.equal(initiativePath + "-hello-world")

					initiative = initiativesDb.read(initiative)
					initiative.phase.must.equal("sign")
					initiative.signing_ends_at.must.eql(DateFns.addDays(endsOn, 1))
				})

				it("must update initiative if setting a long deadline", function*() {
					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: this.user.id,
						destination: "parliament",
						title: "Hello, world!",

						published_at: DateFns.addDays(
							new Date,
							-Config.minEditingDeadlineDays
						)
					}))

					var text = textsDb.create(new ValidText({
						initiative_uuid: initiative.uuid,
						user_id: this.user.id
					}))

					var endsOn = DateFns.addDays(DateFns.addMonths(
						DateFns.startOfDay(new Date),
						Config.maxSigningDeadlineMonths
					), -1)

					var initiativePath = `/initiatives/${initiative.id}`
					var res = yield this.request(initiativePath, {
						method: "PUT",
						form: {
							status: "voting",
							language: text.language,
							endsOn: formatIsoDate(endsOn)
						}
					})

					res.statusCode.must.equal(303)
					res.statusMessage.must.equal("Initiative Sent to Signing")
					res.headers.location.must.equal(initiativePath + "-hello-world")

					initiative = initiativesDb.read(initiative)
					initiative.phase.must.equal("sign")
					initiative.signing_ends_at.must.eql(DateFns.addDays(endsOn, 1))
				})

				it("must respond with 422 if setting a too long deadline", function*() {
					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: this.user.id,
						destination: "parliament",

						published_at: DateFns.addDays(
							new Date,
							-Config.minSigningDeadlineDays
						)
					}))

					var res = yield this.request(`/initiatives/${initiative.id}`, {
						method: "PUT",
						form: {
							status: "voting",
							endsOn: formatIsoDate(
								DateFns.addMonths(new Date, Config.maxSigningDeadlineMonths)
							)
						}
					})

					res.statusCode.must.equal(422)
					res.statusMessage.must.equal("Deadline Too Near or Too Far")
					initiativesDb.read(initiative).must.eql(initiative)
				})

				it("must respond with 403 if Estonian translation missing",
					function*() {
					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: this.user.id,
						language: "en",
						destination: "parliament",

						published_at: DateFns.addDays(
							new Date,
							-Config.minSigningDeadlineDays
						)
					}))

					var english = textsDb.create(new ValidText({
						initiative_uuid: initiative.uuid,
						user_id: this.user.id,
						language: "en"
					}))

					var res = yield this.request("/initiatives/" + initiative.id, {
						method: "PUT",
						form: {
							status: "voting",
							language: english.language,

							endsOn: formatIsoDate(DateFns.addDays(
								DateFns.startOfDay(new Date),
								Config.minSigningDeadlineDays - 1
							))
						}
					})

					res.statusCode.must.equal(403)
					res.statusMessage.must.equal("No Estonian Translation")
				})

				it("must update if Estonian translation present", function*() {
					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: this.user.id,
						language: "en",
						destination: "parliament",

						published_at: DateFns.addDays(
							new Date,
							-Config.minSigningDeadlineDays
						)
					}))

					var english = textsDb.create(new ValidText({
						initiative_uuid: initiative.uuid,
						user_id: this.user.id,
						language: "en"
					}))

					textsDb.create(new ValidText({
						initiative_uuid: initiative.uuid,
						user_id: this.user.id,
						language: "et"
					}))

					var endsOn = DateFns.addDays(
						DateFns.startOfDay(new Date),
						Config.minSigningDeadlineDays - 1
					)

					var res = yield this.request("/initiatives/" + initiative.id, {
						method: "PUT",
						form: {
							status: "voting",
							language: english.language,
							endsOn: formatIsoDate(endsOn)
						}
					})

					res.statusCode.must.equal(303)
					res.statusMessage.must.equal("Initiative Sent to Signing")

					var html = Initiative.renderForParliament(english)

					initiativesDb.search(sql`
						SELECT * FROM initiatives
					`).must.eql([{
						__proto__: initiative,
						phase: "sign",
						signing_started_at: new Date,
						signing_ends_at: DateFns.addDays(endsOn, 1),
						title: english.title,
						text: html,
						text_type: new MediaType("text/html"),
						text_sha256: sha256(html)
					}])
				})

				it("must update initiative if coauthor", function*() {
					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: usersDb.create(new ValidUser).id,
						destination: "parliament",

						published_at: DateFns.addDays(
							new Date,
							-Config.minSigningDeadlineDays
						)
					}))

					coauthorsDb.create(new ValidCoauthor({
						initiative: initiative,
						user: this.user,
						status: "accepted"
					}))

					var text = textsDb.create(new ValidText({
						initiative_uuid: initiative.uuid,
						user_id: this.user.id
					}))

					var res = yield this.request(`/initiatives/${initiative.id}`, {
						method: "PUT",
						form: {
							status: "voting",
							language: text.language,
							endsOn: formatIsoDate(DateFns.addDays(new Date, 30))
						}
					})

					res.statusCode.must.equal(303)
					res.statusMessage.must.equal("Initiative Sent to Signing")
				})

				it("must update initiative if language updated", function*() {
					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: this.user.id,
						destination: "parliament",
						title: "Estonian FTW",
						language: "et",

						published_at: DateFns.addDays(
							new Date,
							-Config.minSigningDeadlineDays
						)
					}))

					var text = textsDb.create(new ValidText({
						initiative_uuid: initiative.uuid,
						user_id: this.user.id,
						language: "en",
						title: "English FTW",
						created_at: new Date(2015, 5, 18, 13, 37, 41)
					}))

					textsDb.create(new ValidText({
						initiative_uuid: initiative.uuid,
						user_id: this.user.id,
						language: initiative.language,
						title: "Estonian FTW",
						created_at: new Date(2015, 5, 18, 13, 37, 42),
					}))

					var endsOn = DateFns.addDays(DateFns.startOfDay(new Date), 30)
					var res = yield this.request(`/initiatives/${initiative.id}`, {
						method: "PUT",
						form: {
							status: "voting",
							language: text.language,
							endsOn: formatIsoDate(endsOn)
						}
					})

					res.statusCode.must.equal(303)
					res.statusMessage.must.equal("Initiative Sent to Signing")

					var html = Initiative.renderForParliament(text)

					initiativesDb.read(initiative).must.eql({
						__proto__: initiative,
						phase: "sign",
						signing_started_at: new Date,
						signing_ends_at: DateFns.addDays(endsOn, 1),
						title: text.title,
						language: text.language,
						text: html,
						text_type: new MediaType("text/html"),
						text_sha256: sha256(html)
					})
				})

				it("must use the latest text of given language", function*() {
					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: this.user.id,
						destination: "parliament",

						published_at: DateFns.addDays(
							new Date,
							-Config.minSigningDeadlineDays
						)
					}))

					textsDb.create(new ValidText({
						initiative_uuid: initiative.uuid,
						user_id: this.user.id
					}))

					var b = textsDb.create(new ValidText({
						initiative_uuid: initiative.uuid,
						user_id: this.user.id
					}))

					var endsOn = DateFns.addDays(DateFns.startOfDay(new Date), 30)
					var res = yield this.request(`/initiatives/${initiative.id}`, {
						method: "PUT",
						form: {
							status: "voting",
							language: b.language,
							endsOn: formatIsoDate(endsOn)
						}
					})

					res.statusCode.must.equal(303)
					res.statusMessage.must.equal("Initiative Sent to Signing")

					var html = Initiative.renderForParliament(b)

					initiativesDb.read(initiative).must.eql({
						__proto__: initiative,
						phase: "sign",
						signing_started_at: new Date,
						signing_ends_at: DateFns.addDays(endsOn, 1),
						title: b.title,
						text: html,
						text_type: new MediaType("text/html"),
						text_sha256: sha256(html)
					})
				})

				it("must update initiative if on fast-track", function*() {
					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: this.user.id,
						destination: "parliament",
						published_at: new Date,
						tags: ["fast-track"],

						created_at: DateFns.addDays(
							new Date,
							1 - Config.minSigningDeadlineDays
						)
					}))

					var text = textsDb.create(new ValidText({
						initiative_uuid: initiative.uuid,
						user_id: this.user.id
					}))

					var endsOn = DateFns.addDays(DateFns.endOfDay(new Date), 30)

					var res = yield this.request(`/initiatives/${initiative.id}`, {
						method: "PUT",
						form: {
							status: "voting",
							language: text.language,
							endsOn: formatIsoDate(endsOn)
						}
					})

					res.statusCode.must.equal(303)
					res.statusMessage.must.equal("Initiative Sent to Signing")
				})

				it("must email subscribers of parliament signable initiatives and events", function*() {
					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: this.user.id,
						destination: "parliament",
						title: "Hello, world!",

						published_at: DateFns.addDays(
							new Date,
							-Config.minSigningDeadlineDays
						)
					}))

					var text = textsDb.create(new ValidText({
						initiative_uuid: initiative.uuid,
						user_id: this.user.id
					}))

					subscriptionsDb.create([
						new ValidSubscription({
							initiative_uuid: initiative.uuid,
							confirmed_at: new Date,
							signable_interest: false
						}),

						new ValidSubscription({
							initiative_uuid: null,
							confirmed_at: new Date,
							signable_interest: false
						}),

						new ValidSubscription({
							initiative_destination: "tallinn",
							confirmed_at: new Date,
							signable_interest: true
						}),

						new ValidSubscription({
							initiative_uuid: initiative.uuid,
							confirmed_at: new Date,
							event_interest: false
						}),

						new ValidSubscription({
							initiative_uuid: null,
							confirmed_at: new Date,
							event_interest: false
						}),

						new ValidSubscription({
							initiative_destination: "tallinn",
							confirmed_at: new Date,
							event_interest: true
						})
					])

					var subscriptions = subscriptionsDb.create([
						new ValidSubscription({
							initiative_uuid: null,
							confirmed_at: new Date,
							signable_interest: true
						}),

						new ValidSubscription({
							initiative_uuid: initiative.uuid,
							confirmed_at: new Date,
							signable_interest: true
						}),

						new ValidSubscription({
							initiative_destination: initiative.destination,
							confirmed_at: new Date,
							signable_interest: true
						}),

						new ValidSubscription({
							initiative_uuid: null,
							confirmed_at: new Date,
							event_interest: true
						}),

						new ValidSubscription({
							initiative_uuid: initiative.uuid,
							confirmed_at: new Date,
							event_interest: true
						}),

						new ValidSubscription({
							initiative_destination: initiative.destination,
							confirmed_at: new Date,
							event_interest: true
						})
					])

					var res = yield this.request(`/initiatives/${initiative.id}`, {
						method: "PUT",
						form: {
							status: "voting",
							language: text.language,
							endsOn: formatIsoDate(
								DateFns.addDays(new Date, Config.minSigningDeadlineDays - 1)
							)
						}
					})

					res.statusCode.must.equal(303)

					var messages = messagesDb.search(sql`
						SELECT * FROM initiative_messages
					`)

					var message = messages[0]
					var emails = subscriptions.map((s) => s.email).sort()

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

							initiativeUrl:
								`${Config.url}/initiatives/${initiative.id}-hello-world`,
						}),

						sent_at: new Date,
						sent_to: emails
					}])

					this.emails.length.must.equal(1)
					var email = this.emails[0]

					email.envelope.to.must.eql(emails)
					email.headers.subject.must.equal(message.title)

					JSON.parse(email.headers["x-mailgun-recipient-variables"]).must.eql(
						serializeMailgunVariables(subscriptions)
					)
				})

				it("must email subscribers of local signable initiatives and events",
					function*() {
					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: this.user.id,
						destination: "tallinn",
						title: "Hello, world!",

						published_at: DateFns.addDays(
							new Date,
							-Config.minSigningDeadlineDays
						)
					}))

					var text = textsDb.create(new ValidText({
						initiative_uuid: initiative.uuid,
						user_id: this.user.id
					}))

					subscriptionsDb.create([
						new ValidSubscription({
							initiative_uuid: initiative.uuid,
							confirmed_at: new Date,
							signable_interest: false
						}),

						new ValidSubscription({
							initiative_uuid: null,
							confirmed_at: new Date,
							signable_interest: false
						}),

						new ValidSubscription({
							initiative_destination: "parliament",
							confirmed_at: new Date,
							signable_interest: true
						}),

						new ValidSubscription({
							initiative_uuid: initiative.uuid,
							confirmed_at: new Date,
							event_interest: false
						}),

						new ValidSubscription({
							initiative_uuid: null,
							confirmed_at: new Date,
							event_interest: false
						}),

						new ValidSubscription({
							initiative_destination: "parliament",
							confirmed_at: new Date,
							event_interest: true
						})
					])

					var subscriptions = subscriptionsDb.create([
						new ValidSubscription({
							initiative_uuid: null,
							confirmed_at: new Date,
							signable_interest: true
						}),

						new ValidSubscription({
							initiative_uuid: initiative.uuid,
							confirmed_at: new Date,
							signable_interest: true
						}),

						new ValidSubscription({
							initiative_destination: initiative.destination,
							confirmed_at: new Date,
							signable_interest: true
						}),

						new ValidSubscription({
							initiative_uuid: null,
							confirmed_at: new Date,
							event_interest: true
						}),

						new ValidSubscription({
							initiative_uuid: initiative.uuid,
							confirmed_at: new Date,
							event_interest: true
						}),

						new ValidSubscription({
							initiative_destination: initiative.destination,
							confirmed_at: new Date,
							event_interest: true
						})
					])

					var res = yield this.request(`/initiatives/${initiative.id}`, {
						method: "PUT",
						form: {
							status: "voting",
							language: text.language,
							endsOn: formatIsoDate(
								DateFns.addDays(new Date, Config.minSigningDeadlineDays - 1)
							)
						}
					})

					res.statusCode.must.equal(303)

					var messages = messagesDb.search(sql`
						SELECT * FROM initiative_messages
					`)

					var message = messages[0]
					var emails = subscriptions.map((s) => s.email).sort()

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

							initiativeUrl:
								`${Config.url}/initiatives/${initiative.id}-hello-world`,
						}),

						sent_at: new Date,
						sent_to: emails
					}])

					this.emails.length.must.equal(1)
					var email = this.emails[0]

					email.envelope.to.must.eql(emails)
					email.headers.subject.must.equal(message.title)

					JSON.parse(email.headers["x-mailgun-recipient-variables"]).must.eql(
						serializeMailgunVariables(subscriptions)
					)
				})

				it("must not email subscribers twice", function*() {
					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: this.user.id,
						destination: "parliament",
						title: "Hello, world!",

						published_at: DateFns.addDays(
							new Date,
							-Config.minSigningDeadlineDays
						)
					}))

					var text = textsDb.create(new ValidText({
						initiative_uuid: initiative.uuid,
						user_id: this.user.id
					}))

					var john = "john@example.com"
					var mary = "mary@example.com"

					subscriptionsDb.create([
						new ValidSubscription({
							email: john,
							confirmed_at: new Date,
							signable_interest: true
						}),

						new ValidSubscription({
							email: john,
							initiative_uuid: initiative.uuid,
							confirmed_at: new Date,
							event_interest: true
						}),

						new ValidSubscription({
							email: mary,
							confirmed_at: new Date,
							signable_interest: true
						}),

						new ValidSubscription({
							email: mary,
							initiative_uuid: initiative.uuid,
							confirmed_at: new Date,
							event_interest: true
						}),
					])

					var res = yield this.request(`/initiatives/${initiative.id}`, {
						method: "PUT",
						form: {
							status: "voting",
							language: text.language,
							endsOn: formatIsoDate(
								DateFns.addDays(new Date, Config.minSigningDeadlineDays - 1)
							)
						}
					})

					res.statusCode.must.equal(303)

					var messages = messagesDb.search(sql`
						SELECT * FROM initiative_messages
					`)

					var message = messages[0]
					var emails = [john, mary].sort()

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

							initiativeUrl:
								`${Config.url}/initiatives/${initiative.id}-hello-world`,
						}),

						sent_at: new Date,
						sent_to: emails
					}])

					this.emails.length.must.equal(1)
					var email = this.emails[0]

					email.envelope.to.must.eql(emails)
					email.headers.subject.must.equal(message.title)
				})

				describe("when already in sign phase", function() {
					it("must respond with 422 if setting a too short deadline",
						function*() {
						var startedAt = DateFns.addDays(new Date, -1)

						var initiative = initiativesDb.create(new ValidInitiative({
							user_id: this.user.id,
							phase: "sign",
							signing_started_at: startedAt
						}))

						var endsOn = DateFns.addDays(
							DateFns.startOfDay(startedAt),
							Config.minSigningDeadlineDays - 2
						)

						var res = yield this.request(`/initiatives/${initiative.id}`, {
							method: "PUT",
							form: {status: "voting", endsOn: formatIsoDate(endsOn)}
						})

						res.statusCode.must.equal(422)
						res.statusMessage.must.equal("Deadline Too Near or Too Far")
						initiativesDb.read(initiative).must.eql(initiative)
					})

					it("must update initiative if setting a short deadline", function*() {
						var initiative = initiativesDb.create(new ValidInitiative({
							user_id: this.user.id,
							phase: "sign",
							signing_started_at: DateFns.addDays(new Date, -1)
						}))

						var endsOn = DateFns.addDays(
							DateFns.startOfDay(initiative.signing_started_at),
							Config.minSigningDeadlineDays - 1
						)

						var res = yield this.request(`/initiatives/${initiative.id}`, {
							method: "PUT",
							form: {status: "voting", endsOn: formatIsoDate(endsOn)}
						})

						res.statusCode.must.equal(303)
						res.statusMessage.must.equal("Initiative Updated")

						var cookies = parseCookies(res.headers["set-cookie"])
						res = yield this.request(res.headers.location, {
							headers: {Cookie: serializeCookies(cookies)}
						})

						res.statusCode.must.equal(200)
						res.body.must.include(t("INITIATIVE_SIGNING_DEADLINE_UPDATED"))

						initiativesDb.read(initiative).must.eql({
							__proto__: initiative,
							signing_ends_at: DateFns.addDays(endsOn, 1),
						})
					})

					it("must update initiative if setting a long deadline", function*() {
						var startedAt = DateFns.addDays(new Date, -90)

						var initiative = initiativesDb.create(new ValidInitiative({
							user_id: this.user.id,
							phase: "sign",
							signing_started_at: startedAt
						}))

						var endsOn = DateFns.addDays(DateFns.addMonths(
							DateFns.startOfDay(startedAt),
							Config.maxSigningDeadlineMonths
						), -1)

						var res = yield this.request(`/initiatives/${initiative.id}`, {
							method: "PUT",
							form: {status: "voting", endsOn: formatIsoDate(endsOn)}
						})

						res.statusCode.must.equal(303)
						res.statusMessage.must.equal("Initiative Updated")

						initiativesDb.read(initiative).must.eql({
							__proto__: initiative,
							signing_ends_at: DateFns.addDays(endsOn, 1),
						})
					})

					it("must respond with 422 if setting a too long deadline", function*() {
						var startedAt = DateFns.addDays(new Date, -90)

						var initiative = initiativesDb.create(new ValidInitiative({
							user_id: this.user.id,
							phase: "sign",
							signing_started_at: startedAt
						}))

						var endsOn = DateFns.addMonths(
							DateFns.startOfDay(startedAt),
							Config.maxSigningDeadlineMonths
						)

						var res = yield this.request(`/initiatives/${initiative.id}`, {
							method: "PUT",
							form: {status: "voting", endsOn: formatIsoDate(endsOn)}
						})

						res.statusCode.must.equal(422)
						res.statusMessage.must.equal("Deadline Too Near or Too Far")
						initiativesDb.read(initiative).must.eql(initiative)
					})

					it("must update initiative if coauthor", function*() {
						var initiative = initiativesDb.create(new ValidInitiative({
							user_id: usersDb.create(new ValidUser).id,
							phase: "sign",
							signing_started_at: DateFns.addDays(new Date, -90)
						}))

						coauthorsDb.create(new ValidCoauthor({
							initiative: initiative,
							user: this.user,
							status: "accepted"
						}))

						var res = yield this.request(`/initiatives/${initiative.id}`, {
							method: "PUT",
							form: {
								status: "voting",
								endsOn: formatIsoDate(
									DateFns.addDays(new Date, Config.minSigningDeadlineDays - 1)
								)
							}
						})

						res.statusCode.must.equal(303)
						res.statusMessage.must.equal("Initiative Updated")
					})

					it("must clear end email", function*() {
						var initiative = initiativesDb.create(new ValidInitiative({
							user_id: this.user.id,
							phase: "sign",
							signing_started_at: new Date,
							discussion_end_email_sent_at: new Date,
							signing_end_email_sent_at: new Date
						}))

						var endsOn = DateFns.addDays(
							DateFns.startOfDay(initiative.signing_started_at),
							Config.minSigningDeadlineDays - 1
						)

						var res = yield this.request(`/initiatives/${initiative.id}`, {
							method: "PUT",
							form: {status: "voting", endsOn: formatIsoDate(endsOn)}
						})

						res.statusCode.must.equal(303)
						res.statusMessage.must.equal("Initiative Updated")

						initiativesDb.read(initiative).must.eql({
							__proto__: initiative,
							signing_ends_at: DateFns.addDays(endsOn, 1),
							signing_end_email_sent_at: null
						})
					})

					it("must not clear end email when setting signing end time to past",
						function*() {
						var initiative = initiativesDb.create(new ValidInitiative({
							user_id: this.user.id,
							phase: "sign",
							signing_started_at: DateFns.addDays(new Date, -5),
							discussion_end_email_sent_at: DateFns.addDays(new Date, -1),
							signing_end_email_sent_at: new Date
						}))

						var endsOn = DateFns.addDays(
							DateFns.startOfDay(initiative.signing_started_at),
							Config.minSigningDeadlineDays - 1
						)

						var res = yield this.request(`/initiatives/${initiative.id}`, {
							method: "PUT",
							form: {status: "voting", endsOn: formatIsoDate(endsOn)}
						})

						res.statusCode.must.equal(303)
						res.statusMessage.must.equal("Initiative Updated")

						var cookies = parseCookies(res.headers["set-cookie"])
						res = yield this.request(res.headers.location, {
							headers: {Cookie: serializeCookies(cookies)}
						})

						res.statusCode.must.equal(200)
						res.body.must.include(t("INITIATIVE_SIGNING_DEADLINE_UPDATED"))

						initiativesDb.read(initiative).must.eql(_.clone({
							__proto__: initiative,
							signing_ends_at: DateFns.addDays(endsOn, 1),
						}))
					})

					it("must not update text if updating deadline", function*() {
						var initiative = initiativesDb.create(new ValidInitiative({
							user_id: this.user.id,
							phase: "sign",
							signing_started_at: pseudoDateTime(),
							text: "Hello, world!",
							text_type: "text/plain",
							text_sha256: sha256("Hello, world!")
						}))

						var endsOn = DateFns.addDays(
							DateFns.startOfDay(initiative.signing_started_at),
							Config.minSigningDeadlineDays - 1
						)

						var res = yield this.request(`/initiatives/${initiative.id}`, {
							method: "PUT",
							form: {status: "voting", endsOn: formatIsoDate(endsOn)}
						})

						res.statusCode.must.equal(303)

						initiativesDb.read(initiative).must.eql({
							__proto__: initiative,
							signing_ends_at: DateFns.addDays(endsOn, 1),
							signing_end_email_sent_at: null
						})
					})

					it("must respond with 403 if not in sign phase", function*() {
						var initiative = initiativesDb.create(new ValidInitiative({
							user_id: this.user.id,
							phase: "parliament"
						}))

						var endsOn = DateFns.addDays(
							DateFns.startOfDay(initiative.signing_started_at),
							Config.minSigningDeadlineDays - 1
						)

						var res = yield this.request(`/initiatives/${initiative.id}`, {
							method: "PUT",
							form: {status: "voting", endsOn: formatIsoDate(endsOn)}
						})

						res.statusCode.must.equal(403)
						res.statusMessage.must.equal("Cannot Update to Sign Phase")
						initiativesDb.read(initiative).must.eql(initiative)
					})

					it("must respond with 403 if signing expired", function*() {
						var initiative = initiativesDb.create(new ValidInitiative({
							user_id: this.user.id,
							phase: "sign",
							signing_expired_at: new Date
						}))

						var endsOn = DateFns.addDays(
							DateFns.startOfDay(initiative.signing_started_at),
							Config.minSigningDeadlineDays - 1
						)

						var res = yield this.request(`/initiatives/${initiative.id}`, {
							method: "PUT",
							form: {status: "voting", endsOn: formatIsoDate(endsOn)}
						})

						res.statusCode.must.equal(403)
						res.statusMessage.must.equal("Cannot Update to Sign Phase")
						initiativesDb.read(initiative).must.eql(initiative)
					})
				})
			})

			describe("given status=followUp", function() {
				describe("when destined for parliament", function() {
					it("must render update page if author", function*() {
						var initiative = initiativesDb.create(new ValidInitiative({
							user_id: this.user.id,
							phase: "sign"
						}))

						citizenosSignaturesDb.create(_.times(
							Config.votesRequired / 2,
							() => new ValidCitizenosSignature({
								initiative_uuid: initiative.uuid
							})
						))

						signaturesDb.create(_.times(Config.votesRequired / 2, () => (
							new ValidSignature({initiative_uuid: initiative.uuid})
						)))

						var res = yield this.request("/initiatives/" + initiative.id, {
							method: "PUT",
							form: {status: "followUp"}
						})

						res.statusCode.must.equal(200)
						res.body.must.include(t("SEND_TO_PARLIAMENT_HEADER"))
						res.body.must.include(t("SEND_TO_PARLIAMENT_TEXT"))
					})

					it("must respond with 403 if not author", function*() {
						var initiative = initiativesDb.create(new ValidInitiative({
							user_id: usersDb.create(new ValidUser).id,
							published_at: new Date
						}))

						var res = yield this.request("/initiatives/" + initiative.id, {
							method: "PUT",
							form: {status: "followUp"}
						})

						res.statusCode.must.equal(403)
						res.statusMessage.must.equal("No Permission to Edit")
					})

					it("must respond with 403 if coauthor", function*() {
						var initiative = initiativesDb.create(new ValidInitiative({
							user_id: usersDb.create(new ValidUser).id,
							published_at: new Date
						}))

						coauthorsDb.create(new ValidCoauthor({
							initiative: initiative,
							user: this.user,
							status: "accepted"
						}))

						var res = yield this.request("/initiatives/" + initiative.id, {
							method: "PUT",
							form: {status: "followUp"}
						})

						res.statusCode.must.equal(403)
						res.statusMessage.must.equal("No Permission to Edit")
					})

					_.without(COAUTHOR_STATUSES, "accepted").forEach(function(status) {
						it(`must respond with 403 if ${status} coauthor`, function*() {
							var initiative = initiativesDb.create(new ValidInitiative({
								user_id: usersDb.create(new ValidUser).id,
								published_at: new Date
							}))

							coauthorsDb.create(new ValidCoauthor({
								initiative: initiative,
								user: this.user,
								status: status
							}))

							var res = yield this.request("/initiatives/" + initiative.id, {
								method: "PUT",
								form: {status: "followUp"}
							})

							res.statusCode.must.equal(403)
							res.statusMessage.must.equal("No Permission to Edit")
						})
					})

					it("must render update page if has paper signatures", function*() {
						var initiative = initiativesDb.create(new ValidInitiative({
							user_id: this.user.id,
							phase: "sign",
							has_paper_signatures: true
						}))

						signaturesDb.create(new ValidSignature({
							initiative_uuid: initiative.uuid
						}))

						var res = yield this.request("/initiatives/" + initiative.id, {
							method: "PUT",
							form: {status: "followUp"}
						})

						res.statusCode.must.equal(200)
					})

					it("must respond with 403 if initiative not successful", function*() {
						var initiative = initiativesDb.create(new ValidInitiative({
							user_id: this.user.id,
							phase: "sign"
						}))

						citizenosSignaturesDb.create(_.times(
							Config.votesRequired / 2 - 1,
							() => new ValidCitizenosSignature({
								initiative_uuid: initiative.uuid
							})
						))

						signaturesDb.create(_.times(
							Config.votesRequired / 2,
							() => new ValidSignature({initiative_uuid: initiative.uuid})
						))

						var res = yield this.request("/initiatives/" + initiative.id, {
							method: "PUT",
							form: {status: "followUp"}
						})

						res.statusCode.must.equal(403)
						res.statusMessage.must.equal("Cannot Send")
					})

					it("must respond with 403 if only has paper signatures", function*() {
						var initiative = initiativesDb.create(new ValidInitiative({
							user_id: this.user.id,
							phase: "sign",
							has_paper_signatures: true
						}))

						var res = yield this.request("/initiatives/" + initiative.id, {
							method: "PUT",
							form: {status: "followUp"}
						})

						res.statusCode.must.equal(403)
						res.statusMessage.must.equal("Cannot Send")
					})

					it("must update initiative and email parliament", function*() {
						var initiative = initiativesDb.create(new ValidInitiative({
							user_id: this.user.id,
							phase: "sign",
							title: "Hello, world!"
						}))

						var signatureCount = Config.votesRequired + 1

						signaturesDb.create(_.times(signatureCount, () => (
							new ValidSignature({initiative_uuid: initiative.uuid})
						)))

						var initiativePath = `/initiatives/${initiative.id}`
						var res = yield this.request(initiativePath, {
							method: "PUT",
							form: {
								status: "followUp",
								"contact[name]": "John",
								"contact[email]": "john@example.com",
								"contact[phone]": "42"
							}
						})

						res.statusCode.must.equal(303)
						res.headers.location.must.equal(initiativePath + "-hello-world")

						var cookies = parseCookies(res.headers["set-cookie"])
						res = yield this.request(res.headers.location, {
							headers: {Cookie: serializeCookies(cookies)}
						})

						res.statusCode.must.equal(200)
						res.body.must.include(t("SENT_TO_PARLIAMENT_CONTENT"))

						var updatedInitiative = initiativesDb.read(initiative)

						updatedInitiative.must.eql({
							__proto__: initiative,
							phase: "parliament",
							sent_to_parliament_at: new Date,
							parliament_token: updatedInitiative.parliament_token,
							signature_threshold: Config.votesRequired,
							signature_threshold_at: new Date
						})

						updatedInitiative.parliament_token.must.exist()

						this.emails.length.must.equal(1)
						var email = this.emails[0]
						email.envelope.to.must.eql([Config.parliamentEmail])

						var vars = email.headers["x-mailgun-recipient-variables"]
						JSON.parse(vars).must.eql({[Config.parliamentEmail]: {}})

						email.headers.subject.must.equal(t(
							"EMAIL_INITIATIVE_TO_PARLIAMENT_TITLE",
							{initiativeTitle: initiative.title}
						))

						var initiativeUrl = `${Config.url}/initiatives/${initiative.id}`

						var token = updatedInitiative.parliament_token.toString("hex")
						var signaturesUrl = initiativeUrl + "/signatures.asice"
						signaturesUrl += `?parliament-token=${token}`

						var signaturesCsvUrl = initiativeUrl + "/signatures.csv"
						signaturesCsvUrl += `?parliament-token=${token}`

						email.body.must.equal(t("EMAIL_INITIATIVE_TO_PARLIAMENT_BODY", {
							initiativeUuid: initiative.uuid,
							initiativeTitle: initiative.title,
							initiativeUrl: initiativeUrl + "-hello-world",
							signatureCount: signatureCount,
							undersignedSignaturesUrl: signaturesUrl,
							signaturesCsvUrl: signaturesCsvUrl,
							authorName: "John",
							authorEmail: "john@example.com",
							authorPhone: "42",
							siteUrl: Config.url,
							facebookUrl: Config.facebookUrl
						}))
					})

					it("must email subscribers", function*() {
						var initiative = initiativesDb.create(new ValidInitiative({
							user_id: this.user.id,
							destination: "parliament",
							phase: "sign",
							title: "Hello, world!"
						}))

						citizenosSignaturesDb.create(_.times(
							Config.votesRequired / 2 + 3,
							() => new ValidCitizenosSignature({
								initiative_uuid: initiative.uuid
							})
						))

						signaturesDb.create(_.times(Config.votesRequired / 2, () => (
							new ValidSignature({initiative_uuid: initiative.uuid})
						)))

						subscriptionsDb.create([
							new ValidSubscription({
								initiative_uuid: initiative.uuid,
								confirmed_at: new Date,
								event_interest: false
							}),

							new ValidSubscription({
								initiative_uuid: null,
								confirmed_at: new Date,
								event_interest: false
							}),

							new ValidSubscription({
								initiative_destination: "tallinn",
								confirmed_at: new Date,
								event_interest: true
							})
						])

						var subscriptions = subscriptionsDb.create([
							new ValidSubscription({
								initiative_uuid: initiative.uuid,
								confirmed_at: new Date,
								event_interest: true
							}),

							new ValidSubscription({
								initiative_uuid: null,
								confirmed_at: new Date,
								event_interest: true
							}),

							new ValidSubscription({
								initiative_destination: "parliament",
								confirmed_at: new Date,
								event_interest: true
							})
						])

						var res = yield this.request(`/initiatives/${initiative.id}`, {
							method: "PUT",
							form: {
								status: "followUp",
								"contact[name]": "John",
								"contact[email]": "john@example.com",
								"contact[phone]": "42"
							}
						})

						res.statusCode.must.equal(303)

						var messages = messagesDb.search(sql`
							SELECT * FROM initiative_messages
						`)

						var emails = subscriptions.map((s) => s.email).sort()

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

								initiativeUrl:
									`${Config.url}/initiatives/${initiative.id}-hello-world`,

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

						email.body.must.equal(t("SENT_TO_PARLIAMENT_MESSAGE_BODY", {
							initiativeTitle: initiative.title,

							initiativeUrl:
								`${Config.url}/initiatives/${initiative.id}-hello-world`,

							signatureCount: Config.votesRequired + 3,
							authorName: "John",
							unsubscribeUrl: `${Config.url}%recipient.unsubscribeUrl%`,
							siteUrl: Config.url,
							facebookUrl: Config.facebookUrl
						}))

						JSON.parse(email.headers["x-mailgun-recipient-variables"]).must.eql(
							serializeMailgunVariables(subscriptions)
						)
					})
				})

				describe("when destined for local", function() {
					beforeEach(function() {
						LOCAL_GOVERNMENTS["muhu-vald"].initiativesEmails = [
							"muhu@example.org",
							"muhu-cc@example.org"
						]
					})

					it("must render update page", function*() {
						var initiative = initiativesDb.create(new ValidInitiative({
							user_id: this.user.id,
							destination: "muhu-vald",
							phase: "sign"
						}))

						var {signatureThreshold} = LOCAL_GOVERNMENTS["muhu-vald"]

						signaturesDb.create(_.times(signatureThreshold, () => (
							new ValidSignature({initiative_uuid: initiative.uuid})
						)))

						var res = yield this.request("/initiatives/" + initiative.id, {
							method: "PUT",
							form: {status: "followUp"}
						})

						res.statusCode.must.equal(200)
						res.body.must.include(t("SEND_TO_LOCAL_GOVERNMENT_HEADER"))
						res.body.must.include(t("SEND_TO_LOCAL_GOVERNMENT_TEXT"))
					})

					it("must render update page if has paper signatures", function*() {
						var initiative = initiativesDb.create(new ValidInitiative({
							user_id: this.user.id,
							destination: "muhu-vald",
							phase: "sign",
							has_paper_signatures: true
						}))

						signaturesDb.create(new ValidSignature({
							initiative_uuid: initiative.uuid
						}))

						var res = yield this.request("/initiatives/" + initiative.id, {
							method: "PUT",
							form: {status: "followUp"}
						})

						res.statusCode.must.equal(200)
					})

					it("must respond with 403 if local government emails empty",
						function*() {
						LOCAL_GOVERNMENTS["muhu-vald"].initiativesEmails = []

						var initiative = initiativesDb.create(new ValidInitiative({
							user_id: this.user.id,
							destination: "muhu-vald",
							phase: "sign"
						}))

						var {signatureThreshold} = LOCAL_GOVERNMENTS["muhu-vald"]

						signaturesDb.create(_.times(signatureThreshold, () => (
							new ValidSignature({initiative_uuid: initiative.uuid})
						)))

						var res = yield this.request("/initiatives/" + initiative.id, {
							method: "PUT",
							form: {status: "followUp"}
						})

						res.statusCode.must.equal(403)
						res.statusMessage.must.equal("Cannot Send")
					})

					it("must respond with 403 if initiative not successful", function*() {
						var initiative = initiativesDb.create(new ValidInitiative({
							user_id: this.user.id,
							destination: "muhu-vald",
							phase: "sign"
						}))

						var {signatureThreshold} = LOCAL_GOVERNMENTS["muhu-vald"]

						signaturesDb.create(_.times(signatureThreshold - 1, () => (
							new ValidSignature({initiative_uuid: initiative.uuid})
						)))

						var res = yield this.request("/initiatives/" + initiative.id, {
							method: "PUT",
							form: {status: "followUp"}
						})

						res.statusCode.must.equal(403)
						res.statusMessage.must.equal("Cannot Send")
					})

					it("must respond with 403 if only has paper signatures", function*() {
						var initiative = initiativesDb.create(new ValidInitiative({
							user_id: this.user.id,
							destination: "muhu-vald",
							phase: "sign",
							has_paper_signatures: true
						}))

						var res = yield this.request("/initiatives/" + initiative.id, {
							method: "PUT",
							form: {status: "followUp"}
						})

						res.statusCode.must.equal(403)
						res.statusMessage.must.equal("Cannot Send")
					})

					it("must update initiative and email local government", function*() {
						var initiative = initiativesDb.create(new ValidInitiative({
							user_id: this.user.id,
							title: "Hello, world!",
							destination: "muhu-vald",
							phase: "sign"
						}))

						var {signatureThreshold} = LOCAL_GOVERNMENTS["muhu-vald"]
						var signatureCount = signatureThreshold + 1

						signaturesDb.create(_.times(signatureCount, () => (
							new ValidSignature({initiative_uuid: initiative.uuid})
						)))

						var initiativePath = `/initiatives/${initiative.id}`
						var res = yield this.request(initiativePath, {
							method: "PUT",

							form: {
								status: "followUp",
								"contact[name]": "John",
								"contact[email]": "john@example.com",
								"contact[phone]": "42"
							}
						})

						res.statusCode.must.equal(303)
						res.headers.location.must.equal(initiativePath + "-hello-world")

						var cookies = parseCookies(res.headers["set-cookie"])
						res = yield this.request(res.headers.location, {
							headers: {Cookie: serializeCookies(cookies)}
						})

						res.statusCode.must.equal(200)
						res.body.must.include(t("SENT_TO_LOCAL_GOVERNMENT_CONTENT"))

						var updatedInitiative = initiativesDb.read(initiative)

						updatedInitiative.must.eql({
							__proto__: initiative,
							phase: "government",
							sent_to_government_at: new Date,
							parliament_token: updatedInitiative.parliament_token,
							signature_threshold: signatureThreshold,
							signature_threshold_at: new Date
						})

						updatedInitiative.parliament_token.must.exist()

						this.emails.length.must.equal(1)
						var email = this.emails[0]

						email.envelope.to.must.eql([
							"muhu@example.org",
							"muhu-cc@example.org",
						])

						var vars = email.headers["x-mailgun-recipient-variables"]
						JSON.parse(vars).must.eql({
							"muhu@example.org": {},
							"muhu-cc@example.org": {}
						})

						email.headers.subject.must.equal(t(
							"EMAIL_INITIATIVE_TO_LOCAL_GOVERNMENT_TITLE",
							{initiativeTitle: initiative.title}
						))

						var initiativeUrl = `${Config.url}/initiatives/${initiative.id}`

						var token = updatedInitiative.parliament_token.toString("hex")
						var signaturesUrl = initiativeUrl + "/signatures.asice"
						signaturesUrl += `?parliament-token=${token}`

						var signaturesCsvUrl = initiativeUrl + "/signatures.csv"
						signaturesCsvUrl += `?parliament-token=${token}`

						email.body.must.equal(
							t("EMAIL_INITIATIVE_TO_LOCAL_GOVERNMENT_BODY", {
								initiativeUuid: initiative.uuid,
								initiativeTitle: initiative.title,
								initiativeUrl: initiativeUrl + "-hello-world",
								signatureCount: signatureCount,
								undersignedSignaturesUrl: signaturesUrl,
								signaturesCsvUrl: signaturesCsvUrl,
								authorName: "John",
								authorEmail: "john@example.com",
								authorPhone: "42",
								guideUrl: Config.url + "/help/kov-guide",
								siteUrl: Config.url,
								facebookUrl: Config.facebookUrl
							})
						)
					})

					it("must email subscribers", function*() {
						var initiative = initiativesDb.create(new ValidInitiative({
							user_id: this.user.id,
							destination: "muhu-vald",
							phase: "sign",
							title: "Hello, world!"
						}))

						var {signatureThreshold} = LOCAL_GOVERNMENTS["muhu-vald"]

						signaturesDb.create(_.times(signatureThreshold, () => (
							new ValidSignature({initiative_uuid: initiative.uuid})
						)))

						subscriptionsDb.create([
							new ValidSubscription({
								initiative_uuid: initiative.uuid,
								confirmed_at: new Date,
								event_interest: false
							}),

							new ValidSubscription({
								initiative_uuid: null,
								confirmed_at: new Date,
								event_interest: false
							}),

							new ValidSubscription({
								initiative_destination: "parliament",
								confirmed_at: new Date,
								event_interest: true
							})
						])

						var subscriptions = subscriptionsDb.create([
							new ValidSubscription({
								initiative_uuid: initiative.uuid,
								confirmed_at: new Date,
								event_interest: true
							}),

							new ValidSubscription({
								initiative_uuid: null,
								confirmed_at: new Date,
								event_interest: true
							}),

							new ValidSubscription({
								initiative_destination: initiative.destination,
								confirmed_at: new Date,
								event_interest: true
							})
						])

						var res = yield this.request(`/initiatives/${initiative.id}`, {
							method: "PUT",
							form: {
								status: "followUp",
								"contact[name]": "John",
								"contact[email]": "john@example.com",
								"contact[phone]": "42"
							}
						})

						res.statusCode.must.equal(303)

						var messages = messagesDb.search(sql`
							SELECT * FROM initiative_messages
						`)

						var emails = subscriptions.map((s) => s.email).sort()

						var initiativeUrl = `${Config.url}/initiatives/${initiative.id}`

						messages.must.eql([{
							id: messages[0].id,
							initiative_uuid: initiative.uuid,
							created_at: new Date,
							updated_at: new Date,
							origin: "status",

							title: t("SENT_TO_LOCAL_GOVERNMENT_MESSAGE_TITLE", {
								initiativeTitle: initiative.title
							}),

							text: renderEmail("SENT_TO_LOCAL_GOVERNMENT_MESSAGE_BODY", {
								authorName: "John",
								initiativeTitle: initiative.title,
								initiativeUrl: initiativeUrl + "-hello-world",
								signatureCount: signatureThreshold
							}),

							sent_at: new Date,
							sent_to: emails
						}])

						this.emails.length.must.equal(2)
						var email = this.emails[1]
						email.envelope.to.must.eql(emails)

						email.headers.subject.must.equal(t(
							"SENT_TO_LOCAL_GOVERNMENT_MESSAGE_TITLE",
							{initiativeTitle: initiative.title}
						))

						email.body.must.equal(t("SENT_TO_LOCAL_GOVERNMENT_MESSAGE_BODY", {
							initiativeTitle: initiative.title,
							initiativeUrl: initiativeUrl + "-hello-world",
							signatureCount: signatureThreshold,
							authorName: "John",
							unsubscribeUrl: `${Config.url}%recipient.unsubscribeUrl%`,
							siteUrl: Config.url,
							facebookUrl: Config.facebookUrl
						}))

						JSON.parse(email.headers["x-mailgun-recipient-variables"]).must.eql(
							serializeMailgunVariables(subscriptions)
						)
					})
				})

				it("must respond with 403 if Estonian translation missing",
					function*() {
					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: this.user.id,
						phase: "sign",
						language: "en",
					}))

					signaturesDb.create(_.times(Config.votesRequired, () => (
						new ValidSignature({initiative_uuid: initiative.uuid})
					)))

					textsDb.create(new ValidText({
						initiative_uuid: initiative.uuid,
						user_id: this.user.id,
						language: "en"
					}))

					var res = yield this.request("/initiatives/" + initiative.id, {
						method: "PUT",
						form: {status: "followUp"}
					})

					res.statusCode.must.equal(403)
					res.statusMessage.must.equal("No Estonian Translation")
				})

				it("must render if Estonian translation present", function*() {
					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: this.user.id,
						phase: "sign",
						language: "en",
					}))

					signaturesDb.create(_.times(Config.votesRequired, () => (
						new ValidSignature({initiative_uuid: initiative.uuid})
					)))

					textsDb.create(new ValidText({
						initiative_uuid: initiative.uuid,
						user_id: this.user.id,
						language: "et"
					}))

					var res = yield this.request("/initiatives/" + initiative.id, {
						method: "PUT",
						form: {status: "followUp"}
					})

					res.statusCode.must.equal(200)
				})

				it("must respond with 403 if signing expired", function*() {
					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: this.user.id,
						phase: "sign",
						signing_expired_at: new Date
					}))

					signaturesDb.create(_.times(Config.votesRequired, () => (
						new ValidSignature({initiative_uuid: initiative.uuid})
					)))

					var res = yield this.request("/initiatives/" + initiative.id, {
						method: "PUT",
						form: {status: "followUp"}
					})

					res.statusCode.must.equal(403)
					res.statusMessage.must.equal("Cannot Send")
				})
			})

			describe("given author_personal_id", function() {
				it("must respond with 403 if not author", function*() {
					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: usersDb.create(new ValidUser).id,
						published_at: new Date
					}))

					var res = yield this.request("/initiatives/" + initiative.id, {
						method: "PUT",
						form: {author_personal_id: "38706181337"}
					})

					res.statusCode.must.equal(403)
					res.statusMessage.must.equal("No Permission to Edit")
				})

				it("must respond with 403 if coauthor", function*() {
					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: usersDb.create(new ValidUser).id,
						published_at: new Date
					}))

					coauthorsDb.create(new ValidCoauthor({
						initiative: initiative,
						user: this.user,
						status: "accepted"
					}))

					var res = yield this.request("/initiatives/" + initiative.id, {
						method: "PUT",
						form: {author_personal_id: "38706181337"}
					})

					res.statusCode.must.equal(403)
					res.statusMessage.must.equal("Only Author Can Update Author")
				})

				_.without(PHASES, "edit").forEach(function(phase) {
					it(`must respond with 403 in ${phase} phase`, function*() {
						var initiative = initiativesDb.create(new ValidInitiative({
							user_id: this.user.id,
							phase
						}))

						var res = yield this.request("/initiatives/" + initiative.id, {
							method: "PUT",
							form: {author_personal_id: "38706181337"}
						})

						res.statusCode.must.equal(403)
						res.statusMessage.must.equal("Can Only Update Author In Edit")
					})
				})

				it("must update author", function*() {
					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: this.user.id,
						title: "Hello, world!",
						phase: "edit"
					}))

					var coauthor = usersDb.create(new ValidUser)

					var coauthorship = coauthorsDb.create(new ValidCoauthor({
						initiative: initiative,
						user: coauthor,
						status: "accepted"
					}))

					var initiativePath = "/initiatives/" + initiative.id
					var res = yield this.request(initiativePath, {
						method: "PUT",
						form: {author_personal_id: serializePersonalId(coauthor)}
					})

					res.statusCode.must.equal(303)
					res.statusMessage.must.equal("Author Updated")
					res.headers.location.must.equal(initiativePath + "-hello-world")

					var cookies = parseCookies(res.headers["set-cookie"])
					res = yield this.request(res.headers.location, {
						cookies: _.mapValues(cookies, (c) => c.value)
					})

					res.statusCode.must.equal(200)
					res.body.must.include(t("INITIATIVE_UPDATE_AUTHOR_UPDATED", {
						name: coauthor.name
					}))

					initiativesDb.read(initiative).must.eql({
						__proto__: initiative,
						user_id: coauthor.id
					})

					coauthorsDb.search(sql`
						SELECT * FROM initiative_coauthors
					`).must.eql([{
						__proto__: coauthorship,
						status: "promoted",
						status_updated_at: new Date,
						status_updated_by_id: this.user.id
					}, new ValidCoauthor({
						id: coauthorship.id + 1,
						initiative: initiative,
						user: this.user,
						status: "accepted"
					})])
				})

				it("must respond with 422 if given personal id not coauthor",
					function*() {
					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: this.user.id,
						phase: "edit"
					}))

					var res = yield this.request("/initiatives/" + initiative.id, {
						method: "PUT",
						form: {author_personal_id: "38706181337"}
					})

					res.statusCode.must.equal(422)
					res.statusMessage.must.equal("No Such Coauthor")
				})

				_.without(COAUTHOR_STATUSES, "accepted").forEach(function(status) {
					it(`must not update author to ${status} coauthor`, function*() {
						var initiative = initiativesDb.create(new ValidInitiative({
							user_id: this.user.id,
							phase: "edit"
						}))

						var coauthor = coauthorsDb.create(new ValidCoauthor({
							initiative: initiative,
							user: usersDb.create(new ValidUser),
							status: status
						}))

						var res = yield this.request("/initiatives/" + initiative.id, {
							method: "PUT",
							form: {author_personal_id: serializePersonalId(coauthor)}
						})

						res.statusCode.must.equal(422)
						res.statusMessage.must.equal("No Such Coauthor")
					})
				})

				it("must respond with 422 given coauthor from another initiative",
					function*() {
					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: this.user.id,
						phase: "edit"
					}))

					var otherInitiative = initiativesDb.create(new ValidInitiative({
						user_id: this.user.id,
					}))

					var coauthor = coauthorsDb.create(new ValidCoauthor({
						initiative: otherInitiative,
						user: usersDb.create(new ValidUser),
						status: "accepted"
					}))

					var res = yield this.request("/initiatives/" + initiative.id, {
						method: "PUT",
						form: {author_personal_id: serializePersonalId(coauthor)}
					})

					res.statusCode.must.equal(422)
					res.statusMessage.must.equal("No Such Coauthor")
				})

				it("must respond with 422 given coauthor from another country",
					function*() {
					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: this.user.id,
						phase: "edit"
					}))

					var coauthor = coauthorsDb.create(new ValidCoauthor({
						initiative: initiative,
						user: usersDb.create(new ValidUser),
						status: "accepted"
					}))

					var res = yield this.request("/initiatives/" + initiative.id, {
						method: "PUT",
						form: {author_personal_id: "LV" + coauthor.personal_id}
					})

					res.statusCode.must.equal(422)
					res.statusMessage.must.equal("No Such Coauthor")
				})

				it("must respond with 422 given coauthor with another personal id",
					function*() {
					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: this.user.id,
						phase: "edit"
					}))

					var coauthor = coauthorsDb.create(new ValidCoauthor({
						initiative: initiative,
						user: usersDb.create(new ValidUser),
						status: "accepted"
					}))

					var res = yield this.request("/initiatives/" + initiative.id, {
						method: "PUT",
						form: {author_personal_id: coauthor.country + "38706181337"}
					})

					res.statusCode.must.equal(422)
					res.statusMessage.must.equal("No Such Coauthor")
				})
			})
		})
	})

	describe("DELETE /:id", function() {
		describe("when not logged in", function() {
			it("must respond with 401", function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: usersDb.create(new ValidUser).id,
					published_at: new Date
				}))

				var res = yield this.request(`/initiatives/${initiative.id}`, {
					method: "DELETE"
				})

				res.statusCode.must.equal(401)
				res.statusMessage.must.equal("Unauthorized")
			})
		})

		describe("when logged in", function() {
			require("root/test/fixtures").user()

			it("must delete unpublished initiative in edit phase", function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.user.id,
					published_at: null
				}))

				textsDb.create(new ValidText({
					initiative_uuid: initiative.uuid,
					user_id: this.user.id
				}))

				var res = yield this.request("/initiatives/" + initiative.id, {
					method: "DELETE"
				})

				res.statusCode.must.equal(303)
				res.headers.location.must.equal(`/initiatives`)

				var cookies = parseCookies(res.headers["set-cookie"])
				res = yield this.request(res.headers.location, {
					headers: {Cookie: serializeCookies(cookies)}
				})

				res.statusCode.must.equal(200)
				res.body.must.include(t("INITIATIVE_DELETED"))

				initiativesDb.search(sql`SELECT * FROM initiatives`).must.be.empty()
				textsDb.search(sql`SELECT * FROM initiative_texts`).must.be.empty()
			})

			it("must delete published initiative in edit phase", function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.user.id,
					published_at: new Date
				}))

				textsDb.create(new ValidText({
					initiative_uuid: initiative.uuid,
					user_id: this.user.id
				}))

				var res = yield this.request("/initiatives/" + initiative.id, {
					method: "DELETE"
				})

				res.statusCode.must.equal(303)
				res.headers.location.must.equal(`/initiatives`)

				initiativesDb.search(sql`SELECT * FROM initiatives`).must.be.empty()
				textsDb.search(sql`SELECT * FROM initiative_texts`).must.be.empty()
			})

			it("must delete if initiative is unpublished and has comments",
				function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.user.id,
					published_at: null
				}))

				commentsDb.create(new ValidComment({
					initiative_uuid: initiative.uuid,
					user_id: this.user.id,
					user_uuid: _.serializeUuid(this.user.uuid)
				}))

				var res = yield this.request("/initiatives/" + initiative.id, {
					method: "DELETE"
				})

				res.statusCode.must.equal(303)
				res.headers.location.must.equal(`/initiatives`)

				initiativesDb.search(sql`SELECT * FROM initiatives`).must.be.empty()
			})

			it("must not delete if initiative is published and has comments",
				function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.user.id,
					title: "Hello, world!",
					published_at: new Date
				}))

				var text = textsDb.create(new ValidText({
					initiative_uuid: initiative.uuid,
					user_id: this.user.id
				}))

				commentsDb.create(new ValidComment({
					initiative_uuid: initiative.uuid,
					user_id: this.user.id,
					user_uuid: _.serializeUuid(this.user.uuid)
				}))

				var initiativePath = "/initiatives/" + initiative.id
				var res = yield this.request(initiativePath, {method: "DELETE"})

				res.statusCode.must.equal(303)
				res.headers.location.must.equal(initiativePath + "-hello-world")

				var cookies = parseCookies(res.headers["set-cookie"])
				res = yield this.request(res.headers.location, {
					headers: {Cookie: serializeCookies(cookies)}
				})

				res.statusCode.must.equal(200)
				res.body.must.include(t("INITIATIVE_CANNOT_BE_DELETED_HAS_COMMENTS"))

				initiativesDb.read(initiative).must.eql(initiative)
				textsDb.read(text).must.eql(text)
			})

			it("must not delete texts of other initiatives", function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.user.id,
					published_at: null
				}))

				textsDb.create(new ValidText({
					initiative_uuid: initiative.uuid,
					user_id: this.user.id
				}))

				var other = initiativesDb.create(new ValidInitiative({
					user_id: this.user.id
				}))

				var otherText = textsDb.create(new ValidText({
					initiative_uuid: other.uuid,
					user_id: this.user.id
				}))

				var res = yield this.request("/initiatives/" + initiative.id, {
					method: "DELETE"
				})

				res.statusCode.must.equal(303)
				res.headers.location.must.equal(`/initiatives`)

				initiativesDb.search(sql`SELECT * FROM initiatives`).must.eql([other])

				textsDb.search(sql`
					SELECT * FROM initiative_texts
				`).must.eql([otherText])
			})

			it("must delete subscribers of unpublished initiative", function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.user.id,
					published_at: null
				}))

				textsDb.create(new ValidText({
					initiative_uuid: initiative.uuid,
					user_id: this.user.id
				}))

				subscriptionsDb.create(new ValidSubscription({
					initiative_uuid: initiative.uuid
				}))

				var res = yield this.request("/initiatives/" + initiative.id, {
					method: "DELETE"
				})

				res.statusCode.must.equal(303)
				res.headers.location.must.equal(`/initiatives`)

				initiativesDb.search(sql`SELECT * FROM initiatives`).must.be.empty()
				textsDb.search(sql`SELECT * FROM initiative_texts`).must.be.empty()

				subscriptionsDb.search(sql`
					SELECT * FROM initiative_subscriptions
				`).must.be.empty()
			})

			it("must not delete subscribers of other initiatives", function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.user.id,
					published_at: null
				}))

				textsDb.create(new ValidText({
					initiative_uuid: initiative.uuid,
					user_id: this.user.id
				}))

				var other = initiativesDb.create(new ValidInitiative({
					user_id: this.user.id
				}))

				var subscription = subscriptionsDb.create(new ValidSubscription({
					initiative_uuid: other.uuid
				}))

				var res = yield this.request("/initiatives/" + initiative.id, {
					method: "DELETE"
				})

				res.statusCode.must.equal(303)
				res.headers.location.must.equal(`/initiatives`)

				initiativesDb.search(sql`SELECT * FROM initiatives`).must.eql([other])

				subscriptionsDb.read(sql`
					SELECT * FROM initiative_subscriptions
				`).must.eql(subscription)
			})

			it("must respond with 405 given initiative in sign phase", function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.user.id,
					phase: "sign"
				}))

				var res = yield this.request("/initiatives/" + initiative.id, {
					method: "DELETE"
				})

				res.statusCode.must.equal(405)
				res.statusMessage.must.must.equal("Can Only Delete Discussions")
			})

			it("must respond with 405 if not author", function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: usersDb.create(new ValidUser).id,
					published_at: new Date
				}))

				var res = yield this.request("/initiatives/" + initiative.id, {
					method: "DELETE"
				})

				res.statusCode.must.equal(403)
				res.statusMessage.must.must.equal("No Permission to Delete")
			})

			it("must respond with 405 if coauthor", function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: usersDb.create(new ValidUser).id,
					published_at: new Date
				}))

				coauthorsDb.create(new ValidCoauthor({
					initiative: initiative,
					user: this.user,
					status: "accepted"
				}))

				var res = yield this.request("/initiatives/" + initiative.id, {
					method: "DELETE"
				})

				res.statusCode.must.equal(403)
				res.statusMessage.must.must.equal("No Permission to Delete")
			})

			_.without(COAUTHOR_STATUSES, "accepted").forEach(function(status) {
				it(`must respond with 405 if ${status} coauthor`, function*() {
					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: usersDb.create(new ValidUser).id,
						published_at: new Date
					}))

					coauthorsDb.create(new ValidCoauthor({
						initiative: initiative,
						user: this.user,
						status: status
					}))

					var res = yield this.request("/initiatives/" + initiative.id, {
						method: "DELETE"
					})

					res.statusCode.must.equal(403)
					res.statusMessage.must.must.equal("No Permission to Delete")
				})
			})
		})
	})

	describe("GET /:id/edit", function() {
		describe("when not logged in", function() {
			it("must respond with 401 if not published", function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: usersDb.create(new ValidUser).id
				}))

				var res = yield this.request(`/initiatives/${initiative.id}/edit`)
				res.statusCode.must.equal(401)
				res.statusMessage.must.equal("Initiative Not Public")
			})

			it("must respond with 401 if published", function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: usersDb.create(new ValidUser).id,
					published_at: new Date
				}))

				var res = yield this.request(`/initiatives/${initiative.id}/edit`)
				res.statusCode.must.equal(401)
				res.statusMessage.must.equal("Unauthorized")
			})
		})

		describe("when logged in", function() {
			require("root/test/fixtures").user()

			it("must respond with 403 if not the author", function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: usersDb.create(new ValidUser).id,
					published_at: new Date
				}))

				var res = yield this.request(`/initiatives/${initiative.id}/edit`)
				res.statusCode.must.equal(403)
				res.statusMessage.must.equal("No Permission to Edit")
			})

			_.without(COAUTHOR_STATUSES, "accepted").forEach(function(status) {
				it(`must respond with 403 if ${status} coauthor`, function*() {
					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: usersDb.create(new ValidUser).id,
						published_at: new Date
					}))

					coauthorsDb.create(new ValidCoauthor({
						initiative: initiative,
						user: this.user,
						status: status
					}))

					var res = yield this.request(`/initiatives/${initiative.id}/edit`)
					res.statusCode.must.equal(403)
					res.statusMessage.must.equal("No Permission to Edit")
				})
			})

			it("must redirect to /new if no existing texts", function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.user.id
				}))

				var initiativePath = `/initiatives/${initiative.id}`
				var res = yield this.request(initiativePath + "/edit")
				res.statusCode.must.equal(302)

				res.headers.location.must.equal(
					initiativePath + "/texts/new?language=et"
				)
			})

			it("must redirect to latest text", function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.user.id
				}))

				var text = textsDb.create(new ValidText({
					initiative_uuid: initiative.uuid,
					user_id: this.user.id,
					created_at: new Date(2015, 5, 18, 13, 37, 42)
				}))

				textsDb.create(new ValidText({
					initiative_uuid: initiative.uuid,
					user_id: this.user.id,
					created_at: new Date(2015, 5, 18, 13, 37, 41)
				}))

				var initiativePath = `/initiatives/${initiative.id}`
				var res = yield this.request(initiativePath + "/edit")
				res.statusCode.must.equal(302)
				res.headers.location.must.equal(initiativePath + "/texts/" + text.id)
			})

			it("must redirect if coauthor", function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: usersDb.create(new ValidUser).id
				}))

				coauthorsDb.create(new ValidCoauthor({
					initiative: initiative,
					user: this.user,
					status: "accepted"
				}))

				var initiativePath = `/initiatives/${initiative.id}`
				var res = yield this.request(initiativePath + "/edit")
				res.statusCode.must.equal(302)

				res.headers.location.must.equal(
					initiativePath + "/texts/new?language=et"
				)
			})
		})
	})

	describe(".serializeApiInitiative", function() {
		it("must serialize parliament initiative", function() {
			var initiative = _.assign(new ValidInitiative({
				id: 42,
				uuid: "b5e594c2-2aef-4420-9780-3a5b1c00e1c0",
				destination: "parliament",
				title: "Hello, world!",
				phase: "sign",
				signing_ends_at: new Date(2015, 5, 20, 13, 37, 44, 666)
			}), {
				signature_count: 666
			})

			serializeApiInitiative(initiative).must.eql({
				id: initiative.uuid,
				for: initiative.destination,
				title: initiative.title,
				phase: initiative.phase,
				signingEndsAt: initiative.signing_ends_at.toJSON(),
				signatureCount: 666,
				signatureThreshold: Config.votesRequired
			})
		})

		it("must serialize local government initiative", function() {
			var initiative = _.assign(new ValidInitiative({
				id: 42,
				uuid: "b5e594c2-2aef-4420-9780-3a5b1c00e1c0",
				destination: "muhu-vald",
				title: "Hello, world!",
				phase: "sign",
				signing_ends_at: new Date(2015, 5, 20, 13, 37, 44, 666)
			}), {
				signature_count: 666
			})

			serializeApiInitiative(initiative).must.eql({
				id: initiative.uuid,
				for: initiative.destination,
				title: initiative.title,
				phase: initiative.phase,
				signingEndsAt: initiative.signing_ends_at.toJSON(),
				signatureCount: 666,
				signatureThreshold: Initiative.getSignatureThreshold(initiative)
			})
		})

		it("must serialize external initiative", function() {
			var initiative = _.assign(new ValidInitiative({
				id: 42,
				uuid: "b5e594c2-2aef-4420-9780-3a5b1c00e1c0",
				destination: "parliament",
				title: "Hello, world!",
				phase: "parliament",
				external: true
			}))

			serializeApiInitiative(initiative).must.eql({
				id: initiative.uuid,
				for: initiative.destination,
				title: initiative.title,
				phase: initiative.phase,
				signingEndsAt: null,
				signatureCount: null,
				signatureThreshold: Config.votesRequired
			})
		})
	})

	describe(".serializeCsvInitiative", function() {
		it("must serialize initiative", function() {
			var initiative = _.assign(new ValidInitiative({
				id: 42,
				uuid: "b5e594c2-2aef-4420-9780-3a5b1c00e1c0",
				destination: "muhu-vald",
				title: "Hello, world!",
				author_name: "John Smith",
				phase: "sign",
				published_at: new Date(2015, 5, 18, 13, 37, 42, 666),
				signing_started_at: new Date(2015, 5, 19, 13, 37, 43, 666),
				signing_ends_at: new Date(2015, 5, 20, 13, 37, 44, 666),
				sent_to_parliament_at: new Date(2015, 5, 21, 13, 37, 45, 666),
				finished_in_parliament_at: new Date(2015, 5, 22, 13, 37, 46, 666),
				parliament_committee: "Keskkonnakomisjon",
				sent_to_government_at: new Date(2015, 5, 23, 13, 37, 47, 666),
				finished_in_government_at: new Date(2015, 5, 24, 13, 37, 48, 666),
			}), {
				user_name: "Mary Smith",
				signature_count: 666,
				last_signed_at: new Date(2015, 5, 20, 13, 37, 43, 705)
			})

			serializeCsvInitiative(initiative).must.equal(Csv.serialize([
				initiative.id,
				initiative.uuid,
				initiative.title,
				"John Smith\nMary Smith",
				initiative.destination,
				initiative.phase,
				initiative.published_at.toJSON(),
				initiative.signing_started_at.toJSON(),
				initiative.signing_ends_at.toJSON(),
				666,
				initiative.last_signed_at.toJSON(),
				initiative.sent_to_parliament_at.toJSON(),
				initiative.parliament_committee,
				initiative.finished_in_parliament_at.toJSON(),
				initiative.sent_to_government_at.toJSON(),
				initiative.finished_in_government_at.toJSON()
			]))
		})
	})
})

function createInitiativesForAllDestinations(author) {
	return initiativesDb.create([
		new ValidInitiative({
			user_id: author.id,
			phase: "sign",
			destination: "parliament"
		}),

		new ValidInitiative({
			user_id: author.id,
			phase: "edit",
			destination: null,
			published_at: new Date
		}),

		new ValidInitiative({
			user_id: author.id,
			phase: "sign",
			destination: "muhu-vald"
		})
	])
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
			title: event.querySelector("h3").textContent,
			at: new Date(event.querySelector(".metadata time").dateTime),
			author: author && author.textContent,
			content: event.querySelectorAll(".metadata ~ *:not(.files)"),
			phase: phase ? phase[1] : null
		}
	}).reverse()
}
