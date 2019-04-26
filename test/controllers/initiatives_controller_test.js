var _ = require("root/lib/underscore")
var O = require("oolong")
var Url = require("url")
var DateFns = require("date-fns")
var Config = require("root/config")
var ValidDbInitiative = require("root/test/valid_db_initiative")
var ValidDbInitiativeSubscription =
	require("root/test/valid_db_initiative_subscription")
var sql = require("root/lib/sql")
var t = require("root/lib/i18n").t.bind(null, "et")
var tHtml = _.compose(_.escapeHtml, t)
var respond = require("root/test/fixtures").respond
var concat = Array.prototype.concat.bind(Array.prototype)
var encodeBase64 = require("root/lib/crypto").encodeBase64
var randomHex = require("root/lib/crypto").randomHex
var sqlite = require("root").sqlite
var initiativeSubscriptionsDb = require("root/db/initiative_subscriptions_db")
var initiativeSignaturesDb = require("root/db/initiative_signatures_db")
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
	title: "My future thoughts",
	description: "<body><h1>My future thoughts.</h1></body>",
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

var SIGNED_INITIATIVE = O.merge({}, INITIATIVE, {
	vote: {options: {rows: [{value: "Yes", voteCount: 1, selected: true}]}}
})

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
				res.body.must.include(t("DISCUSSION_DEADLINE"))
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
				res.body.must.include(tHtml("VOTING_DEADLINE"))
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
				res.body.must.not.include(tHtml("VOTING_DEADLINE"))
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

			it("must render signed initiative", function*() {
				this.router.get(`/api/users/self/topics/${UUID}`,
					respond.bind(null, {data: SIGNED_INITIATIVE}))
				this.router.get(`/api/users/self/topics/${UUID}/comments`,
					respond.bind(null, EMPTY_RES))

				var res = yield this.request("/initiatives/" + UUID)
				res.statusCode.must.equal(200)
				res.body.must.include(tHtml("THANKS_FOR_SIGNING"))
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

				this.router.get(`/api/users/self/topics/${UUID}/comments`,
					respond.bind(null, EMPTY_RES))

				yield initiativeSignaturesDb.create({
					initiative_uuid: UUID,
					user_uuid: this.user.id,
					hidden: true
				})

				var res = yield this.request("/initiatives/" + UUID)
				res.statusCode.must.equal(200)
				res.body.must.not.include(tHtml("THANKS_FOR_SIGNING"))
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
		require("root/test/time")(Date.UTC(2015, 5, 18))

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

				yield sqlite.search(sql`SELECT * FROM initiatives`).must.then.eql([
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

					yield sqlite.search(sql`SELECT * FROM initiatives`).must.then.eql([
						new ValidDbInitiative({uuid: UUID, notes: "Hello, world"})
					])
				})

				it("must not update other initiatives", function*() {
					this.router.get(`/api/users/self/topics/${UUID}`,
						respond.bind(null, {data: PRIVATE_DISCUSSION}))

					var other = yield sqlite.create("initiatives", {
						uuid: "a8166697-7f68-43e4-a729-97a7868b4d51"
					})

					var res = yield this.request(`/initiatives/${UUID}`, {
						method: "PUT",
						form: {_csrf_token: this.csrfToken, notes: "Hello, world"}
					})

					res.statusCode.must.equal(303)
					res.headers.location.must.equal(`/initiatives/${UUID}/edit`)

					yield sqlite.search(sql`SELECT * FROM initiatives`).must.then.eql([
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

					yield sqlite.search(sql`SELECT * FROM initiatives`).must.then.eql([
						new ValidDbInitiative({uuid: UUID})
					])
				})
			})
		})
	})

	describe("POST /:id/signature", function() {
		require("root/test/fixtures").csrf()
		require("root/test/time")(Date.UTC(2015, 5, 18))

		describe("when signing via Id-Card", function() {
			var USER_ID = "bb7abca5-dac0-47c2-86c2-88dbd4850b7a"
			var AUTH_TOKEN = "deadbeef"
			var SIGN_TOKEN = "feedfed"
			var BDOC_URL = "http://example.com/api/users/self/topics/" + UUID
			BDOC_URL += `/votes/${INITIATIVE.vote.id}/downloads/bdocs/user`
			BDOC_URL += "?token=" + fakeJwt({userId: USER_ID})

			it("must send signature to CitizenOS", function*() {
				this.router.get(`/api/topics/${UUID}`,
					respond.bind(null, {data: INITIATIVE}))
				
				var created = 0
				this.router.post(`/api/topics/${UUID}/votes/${INITIATIVE.vote.id}/sign`,
					function(req, res) {
					++created
					req.body.must.eql({token: AUTH_TOKEN, signatureValue: SIGN_TOKEN})
					respond({data: {bdocUri: BDOC_URL}}, req, res)
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

				created.must.equal(1)
				res.statusCode.must.equal(303)
				res.headers.location.must.equal(`/initiatives/${UUID}`)
			})

			it("must unhide signature", function*() {
				this.router.get(`/api/topics/${UUID}`,
					respond.bind(null, {data: INITIATIVE}))
				
				this.router.post(`/api/topics/${UUID}/votes/${INITIATIVE.vote.id}/sign`,
					respond.bind(null, {data: {bdocUri: BDOC_URL}})
				)

				var signature = yield initiativeSignaturesDb.create({
					initiative_uuid: UUID,
					user_uuid: USER_ID,
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

				yield initiativeSignaturesDb.search(sql`
					SELECT * FROM initiative_signatures
				`).must.then.eql([{
					__proto__: signature,
					hidden: false,
					updated_at: new Date
				}])

				res.statusCode.must.equal(303)
			})

			it("must not unhide other initiative's signature", function*() {
				this.router.get(`/api/topics/${UUID}`,
					respond.bind(null, {data: INITIATIVE}))
				
				this.router.post(`/api/topics/${UUID}/votes/${INITIATIVE.vote.id}/sign`,
					respond.bind(null, {data: {bdocUri: BDOC_URL}})
				)

				var signature = yield initiativeSignaturesDb.create({
					initiative_uuid: "5a1f604a-fedc-496c-9e21-ef0b9e971861",
					user_uuid: USER_ID,
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

				yield initiativeSignaturesDb.search(sql`
					SELECT * FROM initiative_signatures
				`).must.then.eql([signature])

				res.statusCode.must.equal(303)
			})

			it("must not unhide other user's signature", function*() {
				this.router.get(`/api/topics/${UUID}`,
					respond.bind(null, {data: INITIATIVE}))
				
				this.router.post(`/api/topics/${UUID}/votes/${INITIATIVE.vote.id}/sign`,
					respond.bind(null, {data: {bdocUri: BDOC_URL}})
				)

				var signature = yield initiativeSignaturesDb.create({
					initiative_uuid: UUID,
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

				yield initiativeSignaturesDb.search(sql`
					SELECT * FROM initiative_signatures
				`).must.then.eql([signature])

				res.statusCode.must.equal(303)
			})
		})

		describe("when signing via Mobile-Id", function() {
			it("must send mobile-id signature to CitizenOS", function*() {
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
	})

	describe("PUT /:id/signature", function() {
		require("root/test/fixtures").csrf()

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

				yield initiativeSignaturesDb.search(sql`
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

				yield initiativeSignaturesDb.search(sql`
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

				var signature = yield initiativeSignaturesDb.create({
					initiative_uuid: UUID,
					user_uuid: user.id,
					hidden: false
				})

				var res = yield this.request(`/initiatives/${UUID}/signature`, {
					method: "PUT",
					form: {_csrf_token: this.csrfToken, hidden: true}
				})

				yield initiativeSignaturesDb.search(sql`
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

				yield initiativeSignaturesDb.create({
					initiative_uuid: UUID,
					user_uuid: user.id,
					hidden: true
				})

				var res = yield this.request(`/initiatives/${UUID}/signature`, {
					method: "PUT",
					form: {_csrf_token: this.csrfToken, hidden: true}
				})

				var signature = yield initiativeSignaturesDb.read(sql`
					SELECT * FROM initiative_signatures
					WHERE (initiative_uuid, user_uuid) = (${INITIATIVE.id}, ${user.id})
				`).then(_.first)

				signature.hidden.must.be.true()
				res.statusCode.must.equal(303)
				res.headers.location.must.equal(`/initiatives/${UUID}`)
			})
		})
	})

	describe("POST /:id/subscriptions", function() {
		require("root/test/fixtures").csrf()
		require("root/test/email")()
		require("root/test/time")(Date.UTC(2015, 5, 18))

		O.each({
			discussion: DISCUSSION,
			initiative: INITIATIVE
		}, function(initiative, name) {
			it(`must subscribe to ${name}`, function*() {
				this.router.get(`/api/topics/${UUID}`,
					respond.bind(null, {data: initiative}))

				var email = "User@example.com"
				var res = yield this.request(`/initiatives/${UUID}/subscriptions`, {
					method: "POST",
					form: {_csrf_token: this.csrfToken, email: email}
				})

				res.statusCode.must.equal(303)
				res.headers.location.must.equal("/initiatives/" + UUID)

				var subscriptions = yield initiativeSubscriptionsDb.search(sql`
					SELECT * FROM initiative_subscriptions
				`)

				subscriptions.length.must.equal(1)
				var subscription = subscriptions[0]

				subscription.must.eql(new ValidDbInitiativeSubscription({
					initiative_uuid: UUID,
					email: email,
					created_at: new Date,
					updated_at: new Date,
					confirmation_token: subscriptions[0].confirmation_token,
					confirmation_sent_at: new Date,
					update_token: subscription.update_token
				}))

				subscription.confirmation_token.must.exist()

				this.emails.length.must.equal(1)
				this.emails[0].envelope.to.must.eql([email])
				var body = String(this.emails[0].message)
				body.match(/^Subject: .*/m)[0].must.include(initiative.title)
				body.must.include(subscription.confirmation_token)
			})

			it(`must subscribe to ${name} only once case-insensitively`,
				function*() {
				this.router.get(`/api/topics/${UUID}`,
					respond.bind(null, {data: initiative}))

				var createdAt = new Date(2015, 5, 18, 13, 37, 42, 666)
				var email = "User@example.com"

				var subscription = new ValidDbInitiativeSubscription({
					initiative_uuid: UUID,
					email: email,
					created_at: createdAt,
					updated_at: createdAt,
					confirmed_at: createdAt
				})

				yield initiativeSubscriptionsDb.create(subscription)

				var res = yield this.request(`/initiatives/${UUID}/subscriptions`, {
					method: "POST",
					form: {_csrf_token: this.csrfToken, email: email.toUpperCase()}
				})

				res.statusCode.must.equal(303)
				res.headers.location.must.equal("/initiatives/" + UUID)

				yield initiativeSubscriptionsDb.search(sql`
					SELECT * FROM initiative_subscriptions
				`).must.then.eql([subscription])

				this.emails.length.must.equal(0)
			})
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

			var res = yield this.request(`/initiatives/${UUID}/subscriptions`, {
				method: "POST",
				form: {_csrf_token: this.csrfToken, email: ""}
			})

			res.statusCode.must.equal(422)
		})

		it("must respond with 422 given invalid email", function*() {
			this.router.get(`/api/topics/${UUID}`,
				respond.bind(null, {data: INITIATIVE}))

			var res = yield this.request(`/initiatives/${UUID}/subscriptions`, {
				method: "POST",
				form: {_csrf_token: this.csrfToken, email: "fubar"}
			})

			res.statusCode.must.equal(422)
		})
	})

	describe("GET /:id/subscriptions/new", function() {
		require("root/test/fixtures").csrf()
		require("root/test/time")(Date.UTC(2015, 5, 18))

		it("must confirm given a confirmation token", function*() {
			this.router.get(`/api/topics/${UUID}`,
				respond.bind(null, {data: INITIATIVE}))

			var createdAt = new Date(2015, 5, 18, 13, 37, 42, 666)
			var token = randomHex(8)

			var subscription = new ValidDbInitiativeSubscription({
				initiative_uuid: UUID,
				created_at: createdAt,
				updated_at: createdAt,
				confirmation_token: token,
				confirmation_sent_at: createdAt
			})

			yield initiativeSubscriptionsDb.create(subscription)

			var res = yield this.request(
				`/initiatives/${UUID}/subscriptions/new?confirmation_token=${token}`
			)

			res.statusCode.must.equal(303)
			res.headers.location.must.equal("/initiatives/" + UUID)

			yield initiativeSubscriptionsDb.read(token).must.then.eql({
				__proto__: subscription,
				confirmed_at: new Date,
				confirmation_sent_at: null,
				updated_at: new Date
			})
		})

		it("must not confirm twice", function*() {
			this.router.get(`/api/topics/${UUID}`,
				respond.bind(null, {data: INITIATIVE}))

			var createdAt = new Date(2015, 5, 18, 13, 37, 42, 666)
			var token = randomHex(8)

			var subscription = new ValidDbInitiativeSubscription({
				initiative_uuid: UUID,
				created_at: createdAt,
				updated_at: createdAt,
				confirmed_at: createdAt,
				confirmation_token: token
			})

			yield initiativeSubscriptionsDb.create(subscription)

			var res = yield this.request(
				`/initiatives/${UUID}/subscriptions/new?confirmation_token=${token}`
			)

			res.statusCode.must.equal(303)
			res.headers.location.must.equal("/initiatives/" + UUID)
			yield initiativeSubscriptionsDb.read(token).must.then.eql(subscription)
		})

		it("must not confirm given the wrong token", function*() {
			this.router.get(`/api/topics/${UUID}`,
				respond.bind(null, {data: INITIATIVE}))
			this.router.get(`/api/topics/${UUID}/comments`,
				respond.bind(null, EMPTY_RES))

			var createdAt = new Date(2015, 5, 18, 13, 37, 42, 666)
			var token = randomHex(8)

			var subscription = new ValidDbInitiativeSubscription({
				initiative_uuid: UUID,
				created_at: createdAt,
				updated_at: createdAt,
				confirmation_token: token,
				confirmation_sent_at: createdAt
			})

			yield initiativeSubscriptionsDb.create(subscription)

			var res = yield this.request(
				`/initiatives/${UUID}/subscriptions/new?confirmation_token=deadbeef`
			)

			res.statusCode.must.equal(404)
			yield initiativeSubscriptionsDb.read(token).must.then.eql(subscription)
		})
	})

	describe("GET /:id/subscriptions/:token", function() {
		require("root/test/fixtures").csrf()

		it("must show subscription page", function*() {
			this.router.get(`/api/topics/${UUID}`,
				respond.bind(null, {data: INITIATIVE}))

			var subscription = new ValidDbInitiativeSubscription({
				initiative_uuid: UUID,
				confirmed_at: new Date
			})

			yield initiativeSubscriptionsDb.create(subscription)

			var res = yield this.request(
				`/initiatives/${UUID}/subscriptions/${subscription.update_token}`
			)

			res.statusCode.must.equal(200)
			res.body.must.include("Lõpeta teavituse tellimine")
		})

		it("must respond with 404 given invalid update token", function*() {
			this.router.get(`/api/topics/${UUID}`,
				respond.bind(null, {data: INITIATIVE}))

			// Still have a single subscription to ensure it's not picking randomly.
			yield initiativeSubscriptionsDb.create(new ValidDbInitiativeSubscription({
				initiative_uuid: UUID,
				confirmed_at: new Date
			}))

			var res = yield this.request(`/initiatives/${UUID}/subscriptions/beef`)
			res.statusCode.must.equal(404)
			res.body.must.include(t("SUBSCRIPTION_NOT_FOUND_TITLE"))
		})
	})

	describe("DELETE /:id/subscriptions/:token", function() {
		require("root/test/fixtures").csrf()

		it("must delete subscription", function*() {
			this.router.get(`/api/topics/${UUID}`,
				respond.bind(null, {data: INITIATIVE}))

			var subscription = new ValidDbInitiativeSubscription({
				initiative_uuid: UUID,
				confirmed_at: new Date
			})

			yield initiativeSubscriptionsDb.create(subscription)

			var res = yield this.request(
				`/initiatives/${UUID}/subscriptions/${subscription.update_token}`, {
				method: "POST",
				form: {_method: "delete", _csrf_token: this.csrfToken}
			})

			res.statusCode.must.equal(303)
			res.headers.location.must.equal("/initiatives/" + UUID)

			yield initiativeSubscriptionsDb.search(sql`
				SELECT * FROM initiative_subscriptions
			`).must.then.be.empty()
		})

		it("must respond with 404 given invalid update token", function*() {
			this.router.get(`/api/topics/${UUID}`,
				respond.bind(null, {data: INITIATIVE}))

			// Still have a single subscription to ensure it's not picking randomly.
			var subscription = new ValidDbInitiativeSubscription({
				initiative_uuid: UUID,
				confirmed_at: new Date
			})

			yield initiativeSubscriptionsDb.create(subscription)

			var res = yield this.request(
				`/initiatives/${UUID}/subscriptions/deadbeef`, {
				method: "POST",
				form: {_method: "delete", _csrf_token: this.csrfToken}
			})

			res.statusCode.must.equal(404)
			res.body.must.include(t("SUBSCRIPTION_NOT_FOUND_TITLE"))

			yield initiativeSubscriptionsDb.search(sql`
				SELECT * FROM initiative_subscriptions
			`).must.then.eql([subscription])
		})

		it("must not delete other subscription on same initiative", function*() {
			this.router.get(`/api/topics/${UUID}`,
				respond.bind(null, {data: INITIATIVE}))

			var other = new ValidDbInitiativeSubscription({
				initiative_uuid: UUID,
				confirmed_at: new Date
			})

			var subscription = new ValidDbInitiativeSubscription({
				initiative_uuid: UUID,
				confirmed_at: new Date,
			})

			yield initiativeSubscriptionsDb.create([other, subscription])

			var res = yield this.request(
				`/initiatives/${UUID}/subscriptions/${subscription.update_token}`, {
				method: "POST",
				form: {_method: "delete", _csrf_token: this.csrfToken}
			})

			res.statusCode.must.equal(303)
			res.headers.location.must.equal("/initiatives/" + UUID)

			yield initiativeSubscriptionsDb.search(sql`
				SELECT * FROM initiative_subscriptions
			`).must.then.eql([other])
		})
	})
})

function fakeJwt(obj) {
	var header = encodeBase64(JSON.stringify({typ: "JWT", alg: "RS256"}))
	var body = encodeBase64(JSON.stringify(obj))
	return header + "." + body + ".fakesignature"
}
