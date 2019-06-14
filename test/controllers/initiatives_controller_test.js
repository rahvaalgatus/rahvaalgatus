var _ = require("root/lib/underscore")
var O = require("oolong")
var Url = require("url")
var Atom = require("root/lib/atom")
var DateFns = require("date-fns")
var Config = require("root/config")
var ValidDbInitiative = require("root/test/valid_db_initiative")
var ValidSubscription = require("root/test/valid_db_initiative_subscription")
var sql = require("sqlate")
var t = require("root/lib/i18n").t.bind(null, "et")
var renderEmail = require("root/lib/i18n").email.bind(null, "et")
var tHtml = _.compose(_.escapeHtml, t)
var respond = require("root/test/fixtures").respond
var newPartner = require("root/test/citizenos_fixtures").newPartner
var newUser = require("root/test/citizenos_fixtures").newUser
var newTopic = require("root/test/citizenos_fixtures").newTopic
var newVote = require("root/test/citizenos_fixtures").newVote
var createPartner = require("root/test/citizenos_fixtures").createPartner
var createUser = require("root/test/citizenos_fixtures").createUser
var createTopic = require("root/test/citizenos_fixtures").createTopic
var createVote = require("root/test/citizenos_fixtures").createVote
var concat = Array.prototype.concat.bind(Array.prototype)
var encodeBase64 = require("root/lib/crypto").encodeBase64
var initiativesDb = require("root/db/initiatives_db")
var subscriptionsDb = require("root/db/initiative_subscriptions_db")
var eventsDb = require("root/db/initiative_events_db")
var messagesDb = require("root/db/initiative_messages_db")
var signaturesDb = require("root/db/initiative_signatures_db")
var encodeMime = require("nodemailer/lib/mime-funcs").encodeWord
var UUID = "5f9a82a5-e815-440b-abe9-d17311b0b366"
var VOTES = require("root/config").votesRequired
var INITIATIVE_TYPE = "application/vnd.rahvaalgatus.initiative+json; v=1"
var ATOM_TYPE = "application/atom+xml"
var EMPTY_RES = {data: {rows: []}}

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

var FAILED_INITIATIVE = O.merge({}, INITIATIVE, {
	vote: {
		endsAt: new Date(Date.now() - 3600 * 1000),
		options: {rows: [{value: "Yes", voteCount: VOTES / 2}]}
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
				yield initiativesDb.create({
					uuid: UUID,
					sent_to_parliament_at: new Date
				})

				this.router.get(`/api/topics/${UUID}`,
					respond.bind(null, {data: PROCESSED_FAILED_INITIATIVE}))
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

				yield signaturesDb.create({
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

				it("must update visibility and set discussion end time", function*() {
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
				})

				it("must clear end email when setting signing end time", function*() {
					var dbInitiative = yield initiativesDb.create({
						uuid: UUID,
						discussion_end_email_sent_at: new Date,
						signing_end_email_sent_at: new Date
					})

					this.router.get(`/api/users/self/topics/${UUID}`, respond.bind(null, {
						data: _.assign({}, INITIATIVE, {permission: {level: "admin"}})
					}))

					var path = `/api/users/self/topics/${UUID}`
					path += `/votes/${INITIATIVE.vote.id}`
					this.router.put(path, endResponse)

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
					`).must.then.eql([
						_.defaults({signing_end_email_sent_at: null}, dbInitiative)
					])
				})

				it("must email subscribers", function*() {
					this.router.get(`/api/users/self/topics/${UUID}`, respond.bind(null, {
						data: _.assign({}, DISCUSSION, {permission: {level: "admin"}})
					}))

					this.router.post(`/api/users/self/topics/${UUID}/votes`, endResponse)

					var subscriptions = yield subscriptionsDb.create([
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
					var emails = subscriptions.map((s) => s.email).sort()

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
					subscriptions.forEach((s) => msg.must.include(s.update_token))
				})
			})

			describe("given status=followUp", function() {
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

					yield initiativesDb.search(sql`
						SELECT * FROM initiatives
					`).must.then.eql([
						new ValidDbInitiative({
							uuid: UUID,
							sent_to_parliament_at: new Date
						})
					])
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

					var emails = subscriptions.map((s) => s.email).sort()

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
							signatureCount: 2
						}),

						sent_at: new Date,
						sent_to: emails
					}])

					this.emails.length.must.equal(1)
					this.emails[0].envelope.to.must.eql(emails)
					var msg = String(this.emails[0].message)
					msg.match(/^Subject: .*/m)[0].must.include(INITIATIVE.title)
					subscriptions.forEach((s) => msg.must.include(s.update_token))
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
							notes: "Hello, world"
						}
					})

					res.statusCode.must.equal(303)
					res.headers.location.must.equal(`/initiatives/${UUID}`)

					yield initiativesDb.search(sql`
						SELECT * FROM initiatives
					`).must.then.eql([
						new ValidDbInitiative({
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

					yield initiativesDb.search(sql`
						SELECT * FROM initiatives
					`).must.then.eql([new ValidDbInitiative({uuid: UUID})])
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

				var signature = yield signaturesDb.create({
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

				yield signaturesDb.search(sql`
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

				var signature = yield signaturesDb.create({
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

				yield signaturesDb.search(sql`
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

				var signature = yield signaturesDb.create({
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

				yield signaturesDb.search(sql`
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

				var signature = yield signaturesDb.read(sql`
					SELECT * FROM initiative_signatures
					WHERE (initiative_uuid, user_uuid) = (${INITIATIVE.id}, ${user.id})
				`)

				signature.hidden.must.be.true()
				res.statusCode.must.equal(303)
				res.headers.location.must.equal(`/initiatives/${UUID}`)
			})
		})
	})
})

function fakeJwt(obj) {
	var header = encodeBase64(JSON.stringify({typ: "JWT", alg: "RS256"}))
	var body = encodeBase64(JSON.stringify(obj))
	return header + "." + body + ".fakesignature"
}

function endResponse(_req, res) { res.end() }
