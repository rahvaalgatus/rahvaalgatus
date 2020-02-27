var _ = require("root/lib/underscore")
var Atom = require("root/lib/atom")
var Config = require("root/config")
var ValidUser = require("root/test/valid_user")
var ValidInitiative = require("root/test/valid_db_initiative")
var ValidEvent = require("root/test/valid_db_initiative_event")
var DateFns = require("date-fns")
var pseudoDateTime = require("root/lib/crypto").pseudoDateTime
var newPartner = require("root/test/citizenos_fixtures").newPartner
var newTopic = require("root/test/citizenos_fixtures").newTopic
var createPartner = require("root/test/citizenos_fixtures").createPartner
var createUser = require("root/test/fixtures").createUser
var createTopic = require("root/test/citizenos_fixtures").createTopic
var initiativesDb = require("root/db/initiatives_db")
var usersDb = require("root/db/users_db")
var eventsDb = require("root/db/initiative_events_db")
var t = require("root/lib/i18n").t.bind(null, "et")
var ATOM_TYPE = "application/atom+xml"
var INITIATIVE_EVENT_TYPE =
	"application/vnd.rahvaalgatus.initiative-event+json; v=1"

describe("InitiativeEventsController", function() {
	require("root/test/web")()
	require("root/test/mitm")()
	require("root/test/db")()
	require("root/test/fixtures").csrf()
	beforeEach(require("root/test/mitm").router)

	describe(`GET / with ${INITIATIVE_EVENT_TYPE}`, function() {
		beforeEach(function*() {
			this.partner = yield createPartner(newPartner({id: Config.apiPartnerId}))
			this.author = yield createUser()
		})

		it("must respond with initiative events", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				user_id: this.author.id
			}))

			yield createTopic(newTopic({
				id: initiative.uuid,
				creatorId: this.author.uuid,
				sourcePartnerId: this.partner.id,
				visibility: "public"
			}))

			var author = yield usersDb.create(new ValidUser({name: "Johnny Lang"}))

			var event = yield eventsDb.create(new ValidEvent({
				initiative_uuid: initiative.uuid,
				user_id: author.id,
				title: "We sent it.",
				occurred_at: new Date(2015, 5, 20)
			}))

			var res = yield this.request("/initiative-events", {
				headers: {Accept: INITIATIVE_EVENT_TYPE}
			})

			res.statusCode.must.equal(200)
			res.headers["content-type"].must.equal(INITIATIVE_EVENT_TYPE)
			res.headers["access-control-allow-origin"].must.equal("*")

			res.body.must.eql([{
				id: event.id,
				initiativeId: initiative.uuid,
				occurredAt: event.occurred_at.toJSON(),
				title: event.title
			}])
		})

		describe("given include", function() {
			it("must respond with initiative if requested", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: this.author.id
				}))

				var topic = yield createTopic(newTopic({
					id: initiative.uuid,
					creatorId: this.author.uuid,
					sourcePartnerId: this.partner.id,
					visibility: "public"
				}))

				var author = yield usersDb.create(new ValidUser)

				var event = yield eventsDb.create(new ValidEvent({
					initiative_uuid: initiative.uuid,
					user_id: author.id,
					title: "We sent it.",
					occurred_at: new Date(2015, 5, 20)
				}))

				var res = yield this.request("/initiative-events?include=initiative", {
					headers: {Accept: INITIATIVE_EVENT_TYPE}
				})

				res.statusCode.must.equal(200)
				res.headers["content-type"].must.equal(INITIATIVE_EVENT_TYPE)
				res.headers["access-control-allow-origin"].must.equal("*")

				res.body.must.eql([{
					id: event.id,
					initiativeId: initiative.uuid,
					occurredAt: event.occurred_at.toJSON(),
					title: event.title,

					initiative: {
						id: initiative.uuid,
						title: topic.title,
						phase: initiative.phase
					}
				}])
			})
		})

		describe("given distinct", function() {
			it("must respond with 400 given invalid distinct", function*() {
				var res = yield this.request("/initiative-events?distinct=foo", {
					headers: {Accept: INITIATIVE_EVENT_TYPE}
				})

				res.statusCode.must.equal(400)
				res.statusMessage.must.equal("Invalid Distinct")

				res.body.must.eql({
					code: 400,
					message: "Invalid Distinct",
					name: "HttpError"
				})
			})

			it("must keep only the first row", function*() {
				var initiatives = yield initiativesDb.create(
					_.times(2, () => new ValidInitiative({user_id: this.author.id}))
				)

				var author = yield usersDb.create(new ValidUser)

				yield initiatives.map((initiative) => createTopic(newTopic({
					id: initiative.uuid,
					creatorId: this.author.uuid,
					sourcePartnerId: this.partner.id,
					status: "voting"
				})))

				var a = yield eventsDb.create(new ValidEvent({
					initiative_uuid: initiatives[0].uuid,
					user_id: author.id,
					occurred_at: new Date(2015, 5, 18, 1)
				}))

				var _b = yield eventsDb.create(new ValidEvent({
					initiative_uuid: initiatives[0].uuid,
					user_id: author.id,
					occurred_at: new Date(2015, 5, 18, 2)
				}))

				var c = yield eventsDb.create(new ValidEvent({
					initiative_uuid: initiatives[1].uuid,
					user_id: author.id,
					occurred_at: new Date(2015, 5, 18, 3)
				}))

				var path = "/initiative-events?distinct=initiativeId"
				var res = yield this.request(path, {
					headers: {Accept: INITIATIVE_EVENT_TYPE}
				})

				res.statusCode.must.equal(200)
				_.map(res.body, "id").must.eql([a.id, c.id])
			})

			it("must apply distinct after order", function*() {
				var initiatives = yield initiativesDb.create(
					_.times(2, () => new ValidInitiative({user_id: this.author.id}))
				)

				var author = yield usersDb.create(new ValidUser)

				yield initiatives.map((initiative) => createTopic(newTopic({
					id: initiative.uuid,
					creatorId: this.author.uuid,
					sourcePartnerId: this.partner.id,
					status: "voting"
				})))

				var _a = yield eventsDb.create(new ValidEvent({
					initiative_uuid: initiatives[0].uuid,
					user_id: author.id,
					occurred_at: new Date(2015, 5, 18, 1)
				}))

				var b = yield eventsDb.create(new ValidEvent({
					initiative_uuid: initiatives[0].uuid,
					user_id: author.id,
					occurred_at: new Date(2015, 5, 18, 2)
				}))

				var c = yield eventsDb.create(new ValidEvent({
					initiative_uuid: initiatives[1].uuid,
					user_id: author.id,
					occurred_at: new Date(2015, 5, 18, 3)
				}))

				var path = "/initiative-events?distinct=initiativeId&order=-occurredAt"
				var res = yield this.request(path, {
					headers: {Accept: INITIATIVE_EVENT_TYPE}
				})

				res.statusCode.must.equal(200)
				_.map(res.body, "id").must.eql([c.id, b.id])
			})

			it("must apply distinct before limit", function*() {
				var initiatives = yield initiativesDb.create(
					_.times(3, () => new ValidInitiative({user_id: this.author.id}))
				)

				var author = yield usersDb.create(new ValidUser)

				yield initiatives.map((initiative) => createTopic(newTopic({
					id: initiative.uuid,
					creatorId: this.author.uuid,
					sourcePartnerId: this.partner.id,
					status: "voting"
				})))

				var a = yield eventsDb.create(new ValidEvent({
					initiative_uuid: initiatives[0].uuid,
					user_id: author.id,
					occurred_at: new Date(2015, 5, 18, 0)
				}))

				var events = yield eventsDb.create(_.times(5, (i) => new ValidEvent({
					initiative_uuid: initiatives[1].uuid,
					user_id: author.id,
					occurred_at: new Date(2015, 5, 18, 1 + i)
				})))

				var c = yield eventsDb.create(new ValidEvent({
					initiative_uuid: initiatives[2].uuid,
					user_id: author.id,
					occurred_at: new Date(2015, 5, 18, 6)
				}))

				var path = "/initiative-events?distinct=initiativeId"
				path += "&order=-occurredAt&limit=3"
				var res = yield this.request(path, {
					headers: {Accept: INITIATIVE_EVENT_TYPE}
				})

				res.statusCode.must.equal(200)
				_.map(res.body, "id").must.eql([c.id, _.last(events).id, a.id])
			})
		})

		describe("given order", function() {
			it("must respond with 400 given invalid order", function*() {
				var res = yield this.request("/initiative-events?order=foo", {
					headers: {Accept: INITIATIVE_EVENT_TYPE}
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
				"occurredAt": _.id,
				"+occurredAt": _.id,
				"-occurredAt": _.reverse,
			}, function(sort, order) {
				it(`must sort by ${order}`, function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative({
						user_id: this.author.id
					}))

					var author = yield usersDb.create(new ValidUser)

					yield createTopic(newTopic({
						id: initiative.uuid,
						creatorId: this.author.uuid,
						sourcePartnerId: this.partner.id,
						visibility: "public"
					}))

					var events = yield eventsDb.create(_.times(5, (i) => new ValidEvent({
						initiative_uuid: initiative.uuid,
						user_id: author.id,
						occurred_at: new Date(2015, 5, 18, -i)
					})))

					var path = "/initiative-events?order=" + encodeURIComponent(order)
					var res = yield this.request(path, {
						headers: {Accept: INITIATIVE_EVENT_TYPE}
					})

					res.statusCode.must.equal(200)
					_.map(res.body, "id").must.eql(sort(_.map(events, "id").reverse()))
				})
			})
		})

		describe("given limit", function() {
			it("must limit initiative events", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: this.author.id
				}))

				yield createTopic(newTopic({
					id: initiative.uuid,
					creatorId: this.author.uuid,
					sourcePartnerId: this.partner.id,
					visibility: "public"
				}))

				var author = yield usersDb.create(new ValidUser({name: "Johnny Lang"}))

				var events = yield eventsDb.create(_.times(10, (i) => new ValidEvent({
					initiative_uuid: initiative.uuid,
					user_id: author.id,
					occurred_at: new Date(2015, 5, 18, i)
				})))

				var res = yield this.request("/initiative-events?limit=5", {
					headers: {Accept: INITIATIVE_EVENT_TYPE}
				})

				res.statusCode.must.equal(200)
				res.headers["content-type"].must.equal(INITIATIVE_EVENT_TYPE)
				res.headers["access-control-allow-origin"].must.equal("*")

				_.map(res.body, "id").must.eql(_.map(events.slice(0, 5), "id"))
			})

			it("must limit initiative events after sorting", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: this.author.id
				}))

				yield createTopic(newTopic({
					id: initiative.uuid,
					creatorId: this.author.uuid,
					sourcePartnerId: this.partner.id,
					visibility: "public"
				}))

				var author = yield usersDb.create(new ValidUser({name: "Johnny Lang"}))

				var events = yield eventsDb.create(_.times(10, (i) => new ValidEvent({
					initiative_uuid: initiative.uuid,
					user_id: author.id,
					occurred_at: new Date(2015, 5, 18, i)
				})))

				var res = yield this.request("/initiative-events?limit=5", {
					headers: {Accept: INITIATIVE_EVENT_TYPE}
				})

				res.statusCode.must.equal(200)
				res.headers["content-type"].must.equal(INITIATIVE_EVENT_TYPE)
				res.headers["access-control-allow-origin"].must.equal("*")

				_.map(res.body, "id").must.eql(_.map(events.slice(0, 5), "id"))
			})
		})
	})

	describe(`GET / with ${ATOM_TYPE}`, function() {
		beforeEach(function*() {
			this.partner = yield createPartner(newPartner({id: Config.apiPartnerId}))
			this.author = yield createUser()
		})

		it("must respond with Atom feed", function*() {
			var initiatives = yield initiativesDb.create([new ValidInitiative({
				user_id: this.author.id,
				created_at: pseudoDateTime()
			}), new ValidInitiative({
				title: "Better life.",
				phase: "parliament",
				external: true,
				created_at: pseudoDateTime()
			})])

			var topic = yield createTopic(newTopic({
				id: initiatives[0].uuid,
				creatorId: this.author.uuid,
				sourcePartnerId: this.partner.id,
				visibility: "public",
				endsAt: DateFns.addSeconds(new Date, 1)
			}))

			initiatives[0].title = topic.title

			var authors = yield [
				yield usersDb.create(new ValidUser({name: "Johnny Lang"})),
				yield usersDb.create(new ValidUser({name: "Kim Mitchell"}))
			]

			var events = yield eventsDb.create([new ValidEvent({
				initiative_uuid: initiatives[0].uuid,
				user_id: authors[0].id,
				title: "We sent it.",
				created_at: new Date(2015, 5, 18),
				updated_at: new Date(2015, 5, 19),
				occurred_at: new Date(2015, 5, 20)
			}), new ValidEvent({
				initiative_uuid: initiatives[0].uuid,
				user_id: authors[0].id,
				title: "They got it.",
				created_at: new Date(2015, 5, 21),
				updated_at: new Date(2015, 5, 22),
				occurred_at: new Date(2015, 5, 23)
			}), new ValidEvent({
				initiative_uuid: initiatives[1].uuid,
				user_id: authors[1].id,
				title: "None got it.",
				created_at: new Date(2015, 5, 24),
				updated_at: new Date(2015, 5, 25),
				occurred_at: new Date(2015, 5, 26)
			})])

			var path = "/initiative-events"
			var res = yield this.request(path, {headers: {Accept: ATOM_TYPE}})
			res.statusCode.must.equal(200)
			res.headers["content-type"].must.equal(ATOM_TYPE)

			var feed = Atom.parse(res.body).feed
			feed.id.$.must.equal(Config.url + path)
			feed.updated.$.must.equal(_.last(events).updated_at.toJSON())
			feed.title.$.must.equal(t("ATOM_INITIATIVE_EVENTS_FEED_TITLE"))

			var links = _.indexBy(feed.link, (link) => link.rel)
			links.self.href.must.equal(Config.url + path + ".atom")
			links.self.type.must.equal(ATOM_TYPE)
			links.alternate.href.must.equal(Config.url)
			links.alternate.type.must.equal("text/html")

			feed.author.name.$.must.equal(Config.title)
			feed.author.uri.$.must.equal(Config.url)

			var initiativesByUuid = _.indexBy(initiatives, "uuid")
			var authorsById = _.indexBy(authors, "id")

			feed.entry.forEach(function(entry, i) {
				var event = events[i]
				var initiative = initiativesByUuid[event.initiative_uuid]
				var author = authorsById[event.user_id]

				var initiativeUrl = `${Config.url}/initiatives/${initiative.uuid}`
				var eventUrl = `${initiativeUrl}#event-${event.id}`

				entry.must.eql({
					id: {$: `${initiativeUrl}/events/${event.id}`},
					link: {rel: "alternate", type: "text/html", href: eventUrl},
					updated: {$: event.updated_at.toJSON()},
					published: {$: event.occurred_at.toJSON()},
					author: {name: {$: author.name}},
					category: {term: "initiator"},
					content: {type: "text", $: event.content},
					title: {$: initiative.title + ": " + event.title},

					source: {
						id: {$: initiativeUrl},

						title: {
							$: t("ATOM_INITIATIVE_FEED_TITLE", {title: initiative.title})
						},

						link: [{
							rel: "self",
							type: "application/atom+xml",
							href: initiativeUrl + ".atom"
						}, {
							rel: "alternate",
							type: "text/html",
							href: initiativeUrl
						}]
					}
				})
			})
		})

		it("must respond with correct feed id given .atom extension", function*() {
			var path = `/initiative-events`
			var res = yield this.request(path + ".atom")
			res.statusCode.must.equal(200)
			res.headers["content-type"].must.equal(ATOM_TYPE)

			var feed = Atom.parse(res.body).feed
			feed.id.$.must.equal(Config.url + path)

			var links = _.indexBy(feed.link, (link) => link.rel)
			links.self.href.must.equal(Config.url + path + ".atom")
			links.self.type.must.equal(ATOM_TYPE)
			links.alternate.href.must.equal(Config.url)
			links.alternate.type.must.equal("text/html")
		})
	})
})
