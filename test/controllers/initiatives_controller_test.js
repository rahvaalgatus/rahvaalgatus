var _ = require("root/lib/underscore")
var O = require("oolong")
var Url = require("url")
var DateFns = require("date-fns")
var Config = require("root/config")
var Sinon = require("sinon")
var ValidDbInitiative = require("root/test/valid_db_initiative")
var t = require("root/lib/i18n").t.bind(null, "et")
var tHtml = _.compose(_.escape, t)
var respond = require("root/test/fixtures").respond
var concat = Array.prototype.concat.bind(Array.prototype)
var randomHex = require("root/lib/crypto").randomHex
var md5 = require("root/lib/crypto").md5
var db = require("root").db
var UUID = "5f9a82a5-e815-440b-abe9-d17311b0b366"
var VOTES = require("root/config").votesRequired
var PARTNER_ID = Config.apiPartnerId
var EXTERNAL_PARTNER_ID = O.keys(Config.partners)[0]
var PARTNER_IDS = concat(PARTNER_ID, O.keys(Config.partners))
var INITIATIVE_TYPE = "application/vnd.rahvaalgatus.initiative+json; v=1"
var EMPTY_RES = {data: {rows: []}}

var DISCUSSION = {
	id: UUID,
	createdAt: new Date(2000, 0, 1),
	sourcePartnerId: PARTNER_ID,
	status: "inProgress",
	description: "<body><h1>My thoughts.</h1></body>",
	creator: {name: "John"},
	visibility: "public",
	permission: {level: "read"}
}

var PRIVATE_DISCUSSION = O.merge({}, DISCUSSION, {
	visibility: "private",
	permission: {level: "admin"}
})

var CLOSED_DISCUSSION = O.merge({}, DISCUSSION, {
	status: "closed",
	events: {count: 0}
})

var CLOSED_EXTERNAL_DISCUSSION = O.merge({}, CLOSED_DISCUSSION, {
	sourcePartnerId: EXTERNAL_PARTNER_ID
})

var PROPOSABLE_DISCUSSION = O.merge({}, DISCUSSION, {
	permission: {level: "admin"}
})

var INITIATIVE = {
	id: UUID,
	createdAt: new Date(2000, 0, 1),
	sourcePartnerId: PARTNER_ID,
	status: "voting",
	title: "My thoughts",
	description: "<body><h1>My thoughts</h1></body>",
	creator: {name: "John"},
	visibility: "public",
	permission: {level: "read"},

	vote: {
		id: "396b0e5b-cca7-4255-9238-19b464e60b65",
		endsAt: new Date(3000, 0, 1),
		options: {rows: [{value: "Yes", voteCount: 0}]}
	}
}

var SUCCESSFUL_INITIATIVE = O.merge({}, INITIATIVE, {
	vote: {
		endsAt: new Date(Date.now() - 3600 * 1000),
		options: {rows: [{value: "Yes", voteCount: VOTES}]}
	}
})

var PROCEEDING_INITIATIVE = O.merge({}, SUCCESSFUL_INITIATIVE, {
	status: "followUp"
})

var FAILED_INITIATIVE = O.merge({}, INITIATIVE, {
	vote: {
		endsAt: new Date(Date.now() - 3600 * 1000),
		options: {rows: [{value: "Yes", voteCount: VOTES / 2}]}
	}
})

var PROCESSED_FAILED_INITIATIVE = O.merge({}, FAILED_INITIATIVE, {
	status: "closed",
	events: {count: 0}
})

var PROCESSED_SUCCESSFUL_INITIATIVE = O.merge({}, SUCCESSFUL_INITIATIVE, {
	status: "closed",
	events: {count: 1}
})

//var PROCESSED_FAILED_INITIATIVE_IN_PARLIAMENT = O.merge({}, FAILED_INITIATIVE, {
//  status: "closed",
//  events: {count: 0}
//})

describe("InitiativesController", function() {
	require("root/test/web")()
	require("root/test/mitm")()
	require("root/test/db")()
	beforeEach(require("root/test/mitm").router)

	describe("GET /", function() {
		describe("when not logged in", function() {
			it("must request initiatives", function*() {
				var requested = 0
				this.router.get("/api/topics", function(req, res) {
					++requested
					var query = Url.parse(req.url, true).query
					query["include[]"].must.be.a.permutationOf(["vote", "event"])
					query["sourcePartnerId[]"].must.be.a.permutationOf(PARTNER_IDS)

					respond({data: {rows: []}}, req, res)
				})

				var res = yield this.request("/initiatives")
				res.statusCode.must.equal(200)
				requested.must.equal(4)
			})

			it("must show processed initiative", function*() {
				this.router.get("/api/topics", function(req, res) {
					var initiatives
					switch (Url.parse(req.url, true).query.statuses) {
						case "closed":
							initiatives = [PROCESSED_SUCCESSFUL_INITIATIVE]
							break

						default: initiatives = []
					}

					respond({data: {rows: initiatives}}, req, res)
				})

				var res = yield this.request("/initiatives")
				res.statusCode.must.equal(200)
				res.body.must.include(UUID)
			})

			it("must show closed discussions", function*() {
				this.router.get("/api/topics", function(req, res) {
					var initiatives
					switch (Url.parse(req.url, true).query.statuses) {
						case "closed": initiatives = [CLOSED_DISCUSSION]; break
						default: initiatives = []
					}

					respond({data: {rows: initiatives}}, req, res)
				})

				var res = yield this.request("/initiatives")
				res.statusCode.must.equal(200)
				res.body.must.include(UUID)
			})

			it("must not show closed discussions of other sites", function*() {
				this.router.get("/api/topics", function(req, res) {
					var initiatives
					switch (Url.parse(req.url, true).query.statuses) {
						case "closed": initiatives = [CLOSED_EXTERNAL_DISCUSSION]; break
						default: initiatives = []
					}

					respond({data: {rows: initiatives}}, req, res)
				})

				var res = yield this.request("/initiatives")
				res.statusCode.must.equal(200)
				res.body.must.not.include(UUID)
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

			it("must escape title", function*() {
				var created = 0
				this.router.post("/api/users/self/topics", function(req, res) {
					++created
					req.headers.authorization.must.exist(0)

					var title = "Hello &lt;mike&gt;!"
					var html = t("INITIATIVE_DEFAULT_HTML", {title: title})
					req.body.visibility.must.equal("private")
					req.body.description.must.equal(html)

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
				res.headers.location.must.equal("/initiatives/" + UUID + "/edit")
				created.must.equal(1)
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

				this.router.get(`/api/topics/${UUID}/comments`,
					respond.bind(null, EMPTY_RES))

				var res = yield this.request("/initiatives/" + UUID)
				res.statusCode.must.equal(200)
			})

			it("must render discussion", function*() {
				this.router.get(`/api/topics/${UUID}`,
					respond.bind(null, {data: DISCUSSION}))
				this.router.get(`/api/topics/${UUID}/comments`,
					respond.bind(null, EMPTY_RES))

				var res = yield this.request("/initiatives/" + UUID)
				res.statusCode.must.equal(200)
				res.body.must.include(tHtml("INITIATIVE_IN_DISCUSSION"))
			})

			it("must render initiative", function*() {
				this.router.get(`/api/topics/${UUID}`,
					respond.bind(null, {data: INITIATIVE}))
				this.router.get(`/api/topics/${UUID}/comments`,
					respond.bind(null, EMPTY_RES))

				var res = yield this.request("/initiatives/" + UUID)
				res.statusCode.must.equal(200)
				res.body.must.not.include(tHtml("INITIATIVE_IN_DISCUSSION"))
				res.body.must.not.include(tHtml("VOTING_SUCCEEDED"))
				res.body.must.not.include(tHtml("VOTING_FAILED"))
			})

			it("must render successful initiative", function*() {
				this.router.get(`/api/topics/${UUID}`,
					respond.bind(null, {data: SUCCESSFUL_INITIATIVE}))
				this.router.get(`/api/topics/${UUID}/comments`,
					respond.bind(null, EMPTY_RES))

				var res = yield this.request("/initiatives/" + UUID)
				res.statusCode.must.equal(200)
				res.body.must.include(tHtml("VOTING_SUCCEEDED"))
			})

			it("must render proceeding initiative", function*() {
				this.router.get(`/api/topics/${UUID}`,
					respond.bind(null, {data: PROCEEDING_INITIATIVE}))
				this.router.get(`/api/topics/${UUID}/comments`,
					respond.bind(null, EMPTY_RES))
				this.router.get(`/api/topics/${UUID}/events`,
					respond.bind(null, EMPTY_RES))

				var res = yield this.request("/initiatives/" + UUID)
				res.statusCode.must.equal(200)
				res.body.must.include(tHtml("INITIATIVE_IN_PARLIAMENT"))
			})

			it("must render failed initiative", function*() {
				this.router.get(`/api/topics/${UUID}`,
					respond.bind(null, {data: FAILED_INITIATIVE}))
				this.router.get(`/api/topics/${UUID}/comments`,
					respond.bind(null, EMPTY_RES))

				var res = yield this.request("/initiatives/" + UUID)
				res.statusCode.must.equal(200)
				res.body.must.include(tHtml("VOTING_FAILED"))
			})

			// This was a bug on Dec 13, 2018 where the code checking to display vote
			// results assumed a closed initiative had been voted on.
			it("must render closed discussion", function*() {
				this.router.get(`/api/topics/${UUID}`,
					respond.bind(null, {data: CLOSED_DISCUSSION}))
				this.router.get(`/api/topics/${UUID}/comments`,
					respond.bind(null, EMPTY_RES))

				var res = yield this.request("/initiatives/" + UUID)
				res.statusCode.must.equal(200)
				res.body.must.not.include(tHtml("INITIATIVE_IN_DISCUSSION"))
			})

			it("must render processed failed initiative", function*() {
				this.router.get(`/api/topics/${UUID}`,
					respond.bind(null, {data: PROCESSED_FAILED_INITIATIVE}))
				this.router.get(`/api/topics/${UUID}/comments`,
					respond.bind(null, EMPTY_RES))
				this.router.get(`/api/topics/${UUID}/events`,
					respond.bind(null, EMPTY_RES))

				var res = yield this.request("/initiatives/" + UUID)
				res.statusCode.must.equal(200)
				res.body.must.include(tHtml("VOTING_FAILED"))
				res.body.must.not.include(tHtml("VOTING_SUCCEEDED"))
				res.body.must.not.include(tHtml("INITIATIVE_PROCESSED"))
			})

			it("must render processed successful initiative", function*() {
				this.router.get(`/api/topics/${UUID}`,
					respond.bind(null, {data: PROCESSED_SUCCESSFUL_INITIATIVE}))
				this.router.get(`/api/topics/${UUID}/comments`,
					respond.bind(null, EMPTY_RES))
				this.router.get(`/api/topics/${UUID}/events`,
					respond.bind(null, EMPTY_RES))

				var res = yield this.request("/initiatives/" + UUID)
				res.statusCode.must.equal(200)
				res.body.must.include(tHtml("INITIATIVE_PROCESSED"))
				res.body.must.not.include(tHtml("VOTING_SUCCEEDED"))
				res.body.must.not.include(tHtml("VOTING_FAILED"))
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

				this.router.get(`/api/topics/${UUID}/comments`,
					respond.bind(null, EMPTY_RES))

				var res = yield this.request("/initiatives/" + UUID)
				res.statusCode.must.equal(200)
				res.body.must.include("MSG_ERROR_HWCRYPTO_NO_CERTIFICATES")
			})
		})

		describe("when logged in", function() {
			require("root/test/fixtures").user()

			it("must render discussion", function*() {
				this.router.get(`/api/users/self/topics/${UUID}`, respond.bind(null, {
					data: DISCUSSION
				}))

				this.router.get(`/api/users/self/topics/${UUID}/comments`,
					respond.bind(null, EMPTY_RES)
				)

				var res = yield this.request("/initiatives/" + UUID)
				res.statusCode.must.equal(200)
			})
		})
	})

	describe(`GET /:id with ${INITIATIVE_TYPE}`, function() {
		it("must respond with JSON", function*() {
			this.router.get(`/api/topics/${UUID}`, respond.bind(null, {
				data: INITIATIVE
			}))

			this.router.get(`/api/topics/${UUID}/comments`,
				respond.bind(null, EMPTY_RES))

			var res = yield this.request("/initiatives/" + UUID, {
				headers: {Accept: INITIATIVE_TYPE}
			})

			res.statusCode.must.equal(200)
			res.headers["content-type"].must.equal(INITIATIVE_TYPE)

			res.body.must.eql({
				title: INITIATIVE.title,
				signatureCount: 0
			})
		})
	})

	describe("PUT /:id", function() {
		beforeEach(function() {
			this.time = Sinon.useFakeTimers(Date.UTC(2015, 5, 18), "Date")
		})

		afterEach(function() { this.time.restore() })

		describe("when logged in", function() {
			require("root/test/fixtures").user()

			it("must render update visibility page", function*() {
				this.router.get(`/api/users/self/topics/${UUID}`,
					respond.bind(null, {data: PRIVATE_DISCUSSION}))

				var res = yield this.request("/initiatives/" + UUID, {
					method: "PUT",
					form: {_csrf_token: this.csrfToken, visibility: "public"}
				})

				res.statusCode.must.equal(200)
			})

			it("must update visibility", function*() {
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
			})

			it("must render update status for voting page", function*() {
				this.router.get(`/api/users/self/topics/${UUID}`,
					respond.bind(null, {data: PROPOSABLE_DISCUSSION}))

				var res = yield this.request("/initiatives/" + UUID, {
					method: "PUT",
					form: {_csrf_token: this.csrfToken, status: "voting"}
				})

				res.statusCode.must.equal(200)
			})

			it("must update status to followUp", function*() {
				this.router.get(`/api/users/self/topics/${UUID}`, respond.bind(null, {
					data: {
						id: UUID,
						status: "voting",
						description: "<body><h1>My thoughts.</h1></body>",
						creator: {name: "John"},
						permission: {level: "admin"},
						vote: {options: {rows: [{value: "Yes", voteCount: VOTES}]}}
					}
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

				yield db.search("SELECT * FROM initiatives").must.then.eql([
					new ValidDbInitiative({
						uuid: UUID,
						sent_to_parliament_at: new Date().toISOString()
					})
				])
			})

			describe("given notes", function() {
				it("must update notes", function*() {
					this.router.get(`/api/users/self/topics/${UUID}`,
						respond.bind(null, {data: PRIVATE_DISCUSSION}))

					var res = yield this.request(`/initiatives/${UUID}`, {
						method: "PUT",
						form: {_csrf_token: this.csrfToken, notes: "Hello, world"}
					})

					res.statusCode.must.equal(303)
					res.headers.location.must.equal(`/initiatives/${UUID}/edit`)

					yield db.search("SELECT * FROM initiatives").must.then.eql([
						new ValidDbInitiative({uuid: UUID, notes: "Hello, world"})
					])
				})

				it("must not update other initiatives", function*() {
					this.router.get(`/api/users/self/topics/${UUID}`,
						respond.bind(null, {data: PRIVATE_DISCUSSION}))

					var other = yield db.create("initiatives", {
						uuid: "a8166697-7f68-43e4-a729-97a7868b4d51"
					})

					var res = yield this.request(`/initiatives/${UUID}`, {
						method: "PUT",
						form: {_csrf_token: this.csrfToken, notes: "Hello, world"}
					})

					res.statusCode.must.equal(303)
					res.headers.location.must.equal(`/initiatives/${UUID}/edit`)

					yield db.search("SELECT * FROM initiatives").must.then.eql([
						other,
						new ValidDbInitiative({uuid: UUID, notes: "Hello, world"})
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

					yield db.search("SELECT * FROM initiatives").must.then.eql([
						new ValidDbInitiative({uuid: UUID})
					])
				})
			})
		})
	})

	describe("PUT /:id/signature", function() {
		require("root/test/fixtures").csrf()

		it("must send mobile-id vote", function*() {
			this.router.get(`/api/topics/${UUID}`,
				respond.bind(null, {data: INITIATIVE}))

			var created = 0
			this.router.post(`/api/topics/${UUID}/votes/${INITIATIVE.vote.id}`,
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
				this.router.post(`/api/topics/${UUID}/votes/${INITIATIVE.vote.id}`,
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

	describe("POST /:id/subscriptions", function() {
		require("root/test/fixtures").csrf()

		var MAILCHIMP_INTERESTS_PATH = [
			"/3.0/lists",
			Config.mailchimpListId,
			"interest-categories",
			Config.mailchimpInterestCategoryId,
			"interests"
		].join("/")

		var MAILCHIMP_MEMBERS_PATH = `/3.0/lists/${Config.mailchimpListId}/members`

		O.each({
			discussion: DISCUSSION,
			initiative: INITIATIVE
		}, function(initiative, name) {
			it(`must subscribe to ${name}'s Mailchimp list`, function*() {
				this.router.get(`/api/topics/${UUID}`,
					respond.bind(null, {data: initiative}))

				var interestId = randomHex(10)
				yield db.create("initiatives", {
					uuid: UUID,
					mailchimp_interest_id: interestId
				})

				var email = "User@example.com"
				var emailHash = hashEmail(email)

				var path = `/3.0/lists/${Config.mailchimpListId}/members/${emailHash}`
				this.router.put(path, function(req, res) {
					req.body.must.eql({
						email_address: email,
						status_if_new: "pending",
						interests: {[interestId]: true},
						ip_signup: "127.0.0.1"
					})

					res.end()
				})

				var res = yield this.request(`/initiatives/${UUID}/subscriptions`, {
					method: "POST",
					form: {_csrf_token: this.csrfToken, email: email}
				})

				res.statusCode.must.equal(303)
				res.headers.location.must.equal("/initiatives/" + UUID)
			})
		})

		it("must create Mailchimp group before subscribing", function*() {
			this.router.get(`/api/topics/${UUID}`,
				respond.bind(null, {data: INITIATIVE}))

			var interestId = randomHex(10)
			this.router.post(MAILCHIMP_INTERESTS_PATH, function(req, res) {
				req.body.must.eql({name: INITIATIVE.title})
				respond({id: interestId}, req, res)
			})

			var email = "User@example.com"
			var emailHash = hashEmail(email)
			this.router.put(MAILCHIMP_MEMBERS_PATH + "/" + emailHash, (req, res) => {
				req.body.interests.must.eql({[interestId]: true})
				res.end()
			})

			var res = yield this.request(`/initiatives/${UUID}/subscriptions`, {
				method: "POST",
				form: {_csrf_token: this.csrfToken, email: email}
			})

			res.statusCode.must.equal(303)

			yield db.search("SELECT * FROM initiatives").must.then.eql([
				new ValidDbInitiative({uuid: UUID, mailchimp_interest_id: interestId})
			])
		})

		// A bug noticed on Dec 11, 2018 with SQLite that interpreted the id
		// "452e778485" as a number in scientific notation because the column type
		// was STRING, not TEXT.
		it("must create Mailchimp group if id in scientific notation",
			function*() {
			this.router.get(`/api/topics/${UUID}`,
				respond.bind(null, {data: INITIATIVE}))

			var interestId = "452e778485"
			this.router.post(MAILCHIMP_INTERESTS_PATH, function(req, res) {
				req.body.must.eql({name: INITIATIVE.title})
				respond({id: interestId}, req, res)
			})

			var email = "User@example.com"
			var emailHash = hashEmail(email)
			this.router.put(MAILCHIMP_MEMBERS_PATH + "/" + emailHash, (req, res) => {
				req.body.interests.must.eql({[interestId]: true})
				res.end()
			})

			var res = yield this.request(`/initiatives/${UUID}/subscriptions`, {
				method: "POST",
				form: {_csrf_token: this.csrfToken, email: email}
			})

			res.statusCode.must.equal(303)

			yield db.search("SELECT * FROM initiatives").must.then.eql([
				new ValidDbInitiative({uuid: UUID, mailchimp_interest_id: interestId})
			])
		})

		it("must not update other initiatives", function*() {
			this.router.get(`/api/topics/${UUID}`,
				respond.bind(null, {data: INITIATIVE}))

			var interestId = randomHex(10)
			this.router.post(MAILCHIMP_INTERESTS_PATH,
				respond.bind(null, {id: interestId}))

			var email = "user@example.com"
			var emailHash = hashEmail(email)
			this.router.put(MAILCHIMP_MEMBERS_PATH + "/" + emailHash, endRequest)

			var other = yield db.create("initiatives", {
				uuid: "a8166697-7f68-43e4-a729-97a7868b4d51"
			})

			var res = yield this.request(`/initiatives/${UUID}/subscriptions`, {
				method: "POST",
				form: {_csrf_token: this.csrfToken, email: email}
			})

			res.statusCode.must.equal(303)

			yield db.search("SELECT * FROM initiatives").must.then.eql([
				other,
				new ValidDbInitiative({uuid: UUID, mailchimp_interest_id: interestId})
			])
		})

		it("must increment title if already exists", function*() {
			this.router.get(`/api/topics/${UUID}`,
				respond.bind(null, {data: INITIATIVE}))

			var created = 0
			var interestId = randomHex(10)
			this.router.post(MAILCHIMP_INTERESTS_PATH, function(req, res) {
				if (!created++) respondWithMailchimpError({
					title: "Invalid Resource",
					status: 400,
					detail: `Cannot add "${INITIATIVE.title}" because it already exists on the list.`,
					instance: "a660879b-b8d7-4165-989d-60851ff36a10"
				}, req, res)
				else {
					req.body.must.eql({name: INITIATIVE.title + " (2000-01-01)"})
					respond({id: interestId}, req, res)
				}
			})

			var email = "User@example.com"
			var emailHash = hashEmail(email)
			var path = `/3.0/lists/${Config.mailchimpListId}/members/${emailHash}`
			this.router.put(path, function(req, res) {
				req.body.interests.must.eql({[interestId]: true})
				res.end()
			})

			var res = yield this.request(`/initiatives/${UUID}/subscriptions`, {
				method: "POST",
				form: {_csrf_token: this.csrfToken, email: email}
			})

			res.statusCode.must.equal(303)

			yield db.search("SELECT * FROM initiatives").must.then.eql([
				new ValidDbInitiative({uuid: UUID, mailchimp_interest_id: interestId})
			])
		})

		it("must respond with 403 Forbidden if discussion not public", function*() {
			PRIVATE_DISCUSSION.visibility.must.not.equal("public")

			this.router.get(`/api/topics/${UUID}`,
				respond.bind(null, {data: PRIVATE_DISCUSSION}))

			var res = yield this.request(`/initiatives/${UUID}/subscriptions`, {
				method: "POST",
				form: {_csrf_token: this.csrfToken, email: "user@example.com"}
			})

			res.statusCode.must.equal(403)
		})

		it("must respond with 422 given missing email", function*() {
			this.router.get(`/api/topics/${UUID}`,
				respond.bind(null, {data: INITIATIVE}))

			var path = `/3.0/lists/${Config.mailchimpListId}/members/${hashEmail("")}`
			this.router.put(path, respondWithMailchimpError.bind(null, {
				type: "http://developer.mailchimp.com/documentation/mailchimp/guides/error-glossary/",
				title: "Invalid Resource",
				status: 400,
				detail: "The resource submitted could not be validated. For field-specific details, see the \"errors\" array.",
				instance: "88d753ef-5540-42e2-8976-d05754580e9e",

				errors: [{
					field: "email_address", message: "This value should not be blank."
				}]
			}))

			yield db.create("initiatives", {uuid: UUID, mailchimp_interest_id: "x"})

			var res = yield this.request(`/initiatives/${UUID}/subscriptions`, {
				method: "POST",
				form: {_csrf_token: this.csrfToken, email: ""}
			})

			res.statusCode.must.equal(422)
		})

		it("must respond with 422 given invalid email", function*() {
			this.router.get(`/api/topics/${UUID}`,
				respond.bind(null, {data: INITIATIVE}))

			var email = "fubar"
			var emailHash = hashEmail(email)
			var path = `/3.0/lists/${Config.mailchimpListId}/members/${emailHash}`
			this.router.put(path, respondWithMailchimpError.bind(null, {
				type: "http://developer.mailchimp.com/documentation/mailchimp/guides/error-glossary/",
				title: "Invalid Resource",
				status: 400,
				detail: "Please provide a valid email address.",
				instance: "fec7d7c0-6c0e-405d-a090-0a05cf988f19"
			}))

			yield db.create("initiatives", {uuid: UUID, mailchimp_interest_id: "x"})

			var res = yield this.request(`/initiatives/${UUID}/subscriptions`, {
				method: "POST",
				form: {_csrf_token: this.csrfToken, email: email}
			})

			res.statusCode.must.equal(422)
		})
	})
})


function respondWithMailchimpError(json, _req, res) {
	if (res.statusCode === 200) res.statusCode = 400
	res.writeHead(res.statusCode, {"Content-Type": "application/problem+json"})
	res.end(JSON.stringify(json))
}

function hashEmail(email) { return md5(email.toLowerCase()) }
function endRequest(_req, res) { res.end() }
