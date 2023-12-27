var _ = require("root/lib/underscore")
var DateFns = require("date-fns")
var ValidInitiative = require("root/test/valid_initiative")
var ValidSubscription = require("root/test/valid_subscription")
var ValidEvent = require("root/test/valid_initiative_event")
var ValidUser = require("root/test/valid_user")
var ValidCoauthor = require("root/test/valid_initiative_coauthor")
var Initiative = require("root/lib/initiative")
var {serializeMailgunVariables} = require("root/lib/subscription")
var initiativesDb = require("root/db/initiatives_db")
var subscriptionsDb = require("root/db/initiative_subscriptions_db")
var eventsDb = require("root/db/initiative_events_db")
var usersDb = require("root/db/users_db")
var coauthorsDb = require("root/db/initiative_coauthors_db")
var messagesDb = require("root/db/initiative_messages_db")
var t = require("root/lib/i18n").t.bind(null, "et")
var renderEmail = require("root/lib/i18n").email.bind(null, "et")
var sql = require("sqlate")
var EVENT_RATE = 3
var EVENTABLE_PHASES = _.without(Initiative.PHASES, "edit")
var NONEVENTABLE_PHASES = _.difference(Initiative.PHASES, EVENTABLE_PHASES)

describe("InitiativeEventsController", function() {
	require("root/test/web")()
	require("root/test/mitm")()
	require("root/test/db")()
	require("root/test/email")()
	require("root/test/time")(Date.UTC(2015, 5, 18))
	require("root/test/fixtures").csrf()
	beforeEach(require("root/test/mitm").router)

	describe("GET /new", function() {
		describe("when not logged in", function() {
			it("must respond with 401", function*() {
				var author = usersDb.create(new ValidUser)

				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: author.id,
					published_at: new Date
				}))

				var path = `/initiatives/${initiative.id}/events/new`
				var res = yield this.request(path)
				res.statusCode.must.equal(401)
				res.statusMessage.must.equal("Unauthorized")
			})
		})

		describe("when logged in", function() {
			require("root/test/fixtures").user()

			mustRateLimit(function() {
				return this.request(`/initiatives/${this.initiative.id}/events/new`)
			})

			NONEVENTABLE_PHASES.forEach(function(phase) {
				it(`must respond with 403 if in ${phase} phase`, function*() {
					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: this.user.id,
						phase: phase,
						published_at: new Date
					}))

					var path = `/initiatives/${initiative.id}/events/new`
					var res = yield this.request(path)
					res.statusCode.must.equal(403)
					res.statusMessage.must.equal("Cannot Create Events")
				})
			})

			EVENTABLE_PHASES.forEach(function(phase) {
				it(`must render if in ${phase} phase`, function*() {
					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: this.user.id,
						phase: phase
					}))

					var path = `/initiatives/${initiative.id}/events/new`
					var res = yield this.request(path)
					res.statusCode.must.equal(200)
				})
			})

			;["text", "media-coverage"].forEach(function(type) {
				it(`must render ${type} page`, function*() {
					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: this.user.id,
						phase: "sign"
					}))

					var path = `/initiatives/${initiative.id}/events/new?type=${type}`
					var res = yield this.request(path)
					res.statusCode.must.equal(200)
				})
			})

			it("must respond with 403 if archived", function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.user.id,
					phase: "sign",
					published_at: new Date,
					archived_at: new Date
				}))

				var path = `/initiatives/${initiative.id}/events/new`
				var res = yield this.request(path)
				res.statusCode.must.equal(403)
				res.statusMessage.must.equal("Cannot Create Events")
			})

			it("must render if coauthor", function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: usersDb.create(new ValidUser).id,
					phase: "sign"
				}))

				coauthorsDb.create(new ValidCoauthor({
					initiative: initiative,
					user: this.user,
					status: "accepted"
				}))

				var path = `/initiatives/${initiative.id}/events/new`
				var res = yield this.request(path)
				res.statusCode.must.equal(200)
			})

			it("must respond with 403 if not author", function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: usersDb.create(new ValidUser).id,
					published_at: new Date
				}))

				var path = `/initiatives/${initiative.id}/events/new`
				var res = yield this.request(path)
				res.statusCode.must.equal(403)
				res.statusMessage.must.equal("No Permission to Edit")
			})
		})
	})

	describe("GET /:id", function() {
		it("must redirect to initiative page given event id", function*() {
			var initiative = initiativesDb.create(new ValidInitiative({
				phase: "parliament",
				title: "Hello, world!",
				external: true
			}))

			var event = eventsDb.create(new ValidEvent({
				initiative_uuid: initiative.uuid,
				title: "We sent it.",
				content: "To somewhere."
			}))

			var path = `/initiatives/${initiative.id}/events/${event.id}`
			var res = yield this.request(path)
			res.statusCode.must.equal(302)

			res.headers.location.must.equal(
				`/initiatives/${initiative.id}-hello-world#event-${event.id}`
			)
		})

		it("must redirect to initiative page given virtual event id",
			function*() {
			var initiative = initiativesDb.create(new ValidInitiative({
				phase: "parliament",
				title: "Hello, world!",
				external: true
			}))

			var path = `/initiatives/${initiative.id}/events/finished-in-government`
			var res = yield this.request(path)
			res.statusCode.must.equal(302)

			res.headers.location.must.equal(
				`/initiatives/${initiative.id}-hello-world#event-finished-in-government`
			)
		})
	})

	describe("POST /", function() {
		describe("when logged in", function() {
			require("root/test/fixtures").user()

			mustRateLimit(function() {
				return this.request(`/initiatives/${this.initiative.id}/events`, {
					method: "POST",
					form: {
						type: "text",
						title: "Something happened",
						content: "You shouldn't miss it."
					}
				})
			})

			NONEVENTABLE_PHASES.forEach(function(phase) {
				it(`must respond with 403 if in ${phase} phase`, function*() {
					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: this.user.id,
						phase: phase,
						published_at: new Date
					}))

					var path = `/initiatives/${initiative.id}/events`
					var res = yield this.request(path, {method: "POST"})

					res.statusCode.must.equal(403)
					res.statusMessage.must.equal("Cannot Create Events")
				})
			})

			it("must respond with 403 if archived", function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.user.id,
					phase: "sign",
					published_at: new Date,
					archived_at: new Date
				}))

				var path = `/initiatives/${initiative.id}/events`
				var res = yield this.request(path, {method: "POST"})

				res.statusCode.must.equal(403)
				res.statusMessage.must.equal("Cannot Create Events")
			})

			it("must respond with 422 given invalid type", function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.user.id,
					phase: "sign"
				}))

				var path = `/initiatives/${initiative.id}/events`
				var res = yield this.request(path, {
					method: "POST",
					form: {type: "parliament-finished"}
				})

				res.statusCode.must.equal(422)
				res.statusMessage.must.equal("Invalid Event Type")
			})

			describe("given text event", function() {
				EVENTABLE_PHASES.forEach(function(phase) {
					it(`must create event if in ${phase} phase`, function*() {
						var initiative = initiativesDb.create(new ValidInitiative({
							user_id: this.user.id,
							phase: phase,
							title: "Hello, world!"
						}))

						var path = `/initiatives/${initiative.id}/events`
						var res = yield this.request(path, {
							method: "POST",
							form: {
								type: "text",
								title: "Something happened",
								content: "You shouldn't miss it."
							}
						})

						res.statusCode.must.equal(302)

						res.headers.location.must.equal(
							`/initiatives/${initiative.id}-hello-world`
						)

						var events = eventsDb.search(sql`
							SELECT * FROM initiative_events
						`)

						events.must.eql([new ValidEvent({
							id: events[0].id,
							initiative_uuid: initiative.uuid,
							user_id: this.user.id,
							type: "text",
							origin: "author",
							title: "Something happened",
							content: "You shouldn't miss it."
						})])
					})
				})

				it("must email parliament initiative subscribers interested in events",
					function*() {
					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: this.user.id,
						destination: "parliament",
						phase: "sign"
					}))

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
							initiative_destination: initiative.destination,
							confirmed_at: new Date,
							event_interest: true
						})
					])

					var path = `/initiatives/${initiative.id}/events`
					var res = yield this.request(path, {
						method: "POST",
						form: {
							type: "text",
							title: "Something happened",
							content: "You shouldn't miss it."
						}
					})

					res.statusCode.must.equal(302)

					var messages = messagesDb.search(sql`
						SELECT * FROM initiative_messages
					`)

					var emails = subscriptions.map((s) => s.email).sort()

					messages.must.eql([{
						id: messages[0].id,
						initiative_uuid: initiative.uuid,
						created_at: new Date,
						updated_at: new Date,
						origin: "event",

						title: t("EMAIL_INITIATIVE_AUTHOR_TEXT_EVENT_TITLE", {
							title: "Something happened",
							initiativeTitle: initiative.title
						}),

						text: renderEmail("EMAIL_INITIATIVE_AUTHOR_TEXT_EVENT_BODY", {
							initiativeTitle: initiative.title,
							initiativeUrl: Initiative.slugUrl(initiative),
							title: "Something happened",
							text: "> You shouldn't miss it.",
							unsubscribeUrl: "{{unsubscribeUrl}}"
						}),

						sent_at: new Date,
						sent_to: emails
					}])

					this.emails.length.must.equal(1)

					var email = this.emails[0]
					email.envelope.to.must.eql(emails)
					email.headers.subject.must.equal(messages[0].title)

					JSON.parse(email.headers["x-mailgun-recipient-variables"]).must.eql(
						serializeMailgunVariables(subscriptions)
					)
				})

				it("must email local initiative subscribers interested in events",
					function*() {
					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: this.user.id,
						destination: "tallinn",
						phase: "sign"
					}))

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

					var path = `/initiatives/${initiative.id}/events`
					var res = yield this.request(path, {
						method: "POST",
						form: {
							type: "text",
							title: "Something happened",
							content: "You shouldn't miss it."
						}
					})

					res.statusCode.must.equal(302)

					var messages = messagesDb.search(sql`
						SELECT * FROM initiative_messages
					`)

					var emails = subscriptions.map((s) => s.email).sort()

					messages.must.eql([{
						id: messages[0].id,
						initiative_uuid: initiative.uuid,
						created_at: new Date,
						updated_at: new Date,
						origin: "event",

						title: t("EMAIL_INITIATIVE_AUTHOR_TEXT_EVENT_TITLE", {
							title: "Something happened",
							initiativeTitle: initiative.title
						}),

						text: renderEmail("EMAIL_INITIATIVE_AUTHOR_TEXT_EVENT_BODY", {
							initiativeTitle: initiative.title,
							initiativeUrl: Initiative.slugUrl(initiative),
							title: "Something happened",
							text: "> You shouldn't miss it.",
							unsubscribeUrl: "{{unsubscribeUrl}}"
						}),

						sent_at: new Date,
						sent_to: emails
					}])

					this.emails.length.must.equal(1)

					var email = this.emails[0]
					email.envelope.to.must.eql(emails)
					email.headers.subject.must.equal(messages[0].title)

					JSON.parse(email.headers["x-mailgun-recipient-variables"]).must.eql(
						serializeMailgunVariables(subscriptions)
					)
				})

				_.each({
					"too long title": {title: _.repeat("a", 401)},
					"too long content": {title: _.repeat("a", 40001)}
				}, function(attrs, title) {
					it(`must respond with 422 given ${title}`, function*() {
						var initiative = initiativesDb.create(new ValidInitiative({
							user_id: this.user.id,
							phase: "sign"
						}))

						var path = `/initiatives/${initiative.id}/events`
						var res = yield this.request(path, {
							method: "POST",
							form: _.assign({type: "text"}, attrs)
						})

						res.statusCode.must.equal(422)
						res.statusMessage.must.equal("Invalid Attributes")

						eventsDb.search(sql`
							SELECT * FROM initiative_events
						`).must.be.empty()
					})
				})
			})

			describe("given media-coverage event", function() {
				it("must create event", function*() {
					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: this.user.id,
						phase: "sign",
						title: "Hello, world!"
					}))

					var path = `/initiatives/${initiative.id}/events`
					var res = yield this.request(path, {
						method: "POST",
						form: {
							type: "media-coverage",
							title: "Something happened",
							publisher: "Old York Times",
							url: "http://example.com/article"
						}
					})

					res.statusCode.must.equal(302)

					res.headers.location.must.equal(
						`/initiatives/${initiative.id}-hello-world`
					)

					var events = eventsDb.search(sql`
						SELECT * FROM initiative_events
					`)

					events.must.eql([new ValidEvent({
						id: events[0].id,
						initiative_uuid: initiative.uuid,
						user_id: this.user.id,
						origin: "author",
						type: "media-coverage",
						title: "Something happened",

						content: {
							publisher: "Old York Times",
							url: "http://example.com/article"
						}
					})])
				})

				it("must email parliament initiative subscribers interested in events",
					function*() {
					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: this.user.id,
						destination: "parliament",
						phase: "sign"
					}))

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
							initiative_destination: initiative.destination,
							confirmed_at: new Date,
							event_interest: true
						})
					])

					var path = `/initiatives/${initiative.id}/events`
					var res = yield this.request(path, {
						method: "POST",
						form: {
							type: "media-coverage",
							title: "Something happened",
							publisher: "Old York Times",
							url: "http://example.com/article"
						}
					})

					res.statusCode.must.equal(302)

					var messages = messagesDb.search(sql`
						SELECT * FROM initiative_messages
					`)

					var emails = subscriptions.map((s) => s.email).sort()

					messages.must.eql([{
						id: messages[0].id,
						initiative_uuid: initiative.uuid,
						created_at: new Date,
						updated_at: new Date,
						origin: "event",

						title: t("EMAIL_INITIATIVE_AUTHOR_MEDIA_COVERAGE_EVENT_TITLE", {
							initiativeTitle: initiative.title
						}),

						text: renderEmail(
							"EMAIL_INITIATIVE_AUTHOR_MEDIA_COVERAGE_EVENT_BODY", {
							initiativeTitle: initiative.title,
							initiativeUrl: Initiative.slugUrl(initiative),
							title: "Something happened",
							publisher: "Old York Times",
							url: "http://example.com/article",
							unsubscribeUrl: "{{unsubscribeUrl}}"
						}),

						sent_at: new Date,
						sent_to: emails
					}])

					this.emails.length.must.equal(1)

					var email = this.emails[0]
					email.envelope.to.must.eql(emails)
					email.headers.subject.must.equal(messages[0].title)

					JSON.parse(email.headers["x-mailgun-recipient-variables"]).must.eql(
						serializeMailgunVariables(subscriptions)
					)
				})

				it("must email local initiative subscribers interested in events",
					function*() {
					var initiative = initiativesDb.create(new ValidInitiative({
						user_id: this.user.id,
						destination: "tallinn",
						phase: "sign"
					}))

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

					var path = `/initiatives/${initiative.id}/events`
					var res = yield this.request(path, {
						method: "POST",
						form: {
							type: "media-coverage",
							title: "Something happened",
							publisher: "Old York Times",
							url: "http://example.com/article"
						}
					})

					res.statusCode.must.equal(302)

					var messages = messagesDb.search(sql`
						SELECT * FROM initiative_messages
					`)

					var emails = subscriptions.map((s) => s.email).sort()

					messages.must.eql([{
						id: messages[0].id,
						initiative_uuid: initiative.uuid,
						created_at: new Date,
						updated_at: new Date,
						origin: "event",

						title: t("EMAIL_INITIATIVE_AUTHOR_MEDIA_COVERAGE_EVENT_TITLE", {
							initiativeTitle: initiative.title
						}),

						text: renderEmail(
							"EMAIL_INITIATIVE_AUTHOR_MEDIA_COVERAGE_EVENT_BODY", {
							initiativeTitle: initiative.title,
							initiativeUrl: Initiative.slugUrl(initiative),
							title: "Something happened",
							publisher: "Old York Times",
							url: "http://example.com/article",
							unsubscribeUrl: "{{unsubscribeUrl}}"
						}),

						sent_at: new Date,
						sent_to: emails
					}])

					this.emails.length.must.equal(1)

					var email = this.emails[0]
					email.envelope.to.must.eql(emails)
					email.headers.subject.must.equal(messages[0].title)

					JSON.parse(email.headers["x-mailgun-recipient-variables"]).must.eql(
						serializeMailgunVariables(subscriptions)
					)
				})

				_.each({
					"too long title": {title: _.repeat("a", 401)},
					"too long url": {url: _.repeat("a", 1025)},
					"too long publisher": {url: _.repeat("a", 201)}
				}, function(attrs, title) {
					it(`must respond with 422 given ${title}`, function*() {
						var initiative = initiativesDb.create(new ValidInitiative({
							user_id: this.user.id,
							phase: "sign"
						}))

						var path = `/initiatives/${initiative.id}/events`
						var res = yield this.request(path, {
							method: "POST",
							form: _.assign({type: "media-coverage"}, attrs)
						})

						res.statusCode.must.equal(422)
						res.statusMessage.must.equal("Invalid Attributes")

						eventsDb.search(sql`
							SELECT * FROM initiative_events
						`).must.be.empty()
					})
				})
			})

			it("must create event if coauthor", function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: usersDb.create(new ValidUser).id,
					phase: "sign",
					title: "Hello, world!"
				}))

				coauthorsDb.create(new ValidCoauthor({
					initiative: initiative,
					user: this.user,
					status: "accepted"
				}))

				var path = `/initiatives/${initiative.id}/events`
				var res = yield this.request(path, {
					method: "POST",
					form: {
						type: "text",
						title: "Something happened",
						content: "You shouldn't miss it."
					}
				})

				res.statusCode.must.equal(302)

				res.headers.location.must.equal(
					`/initiatives/${initiative.id}-hello-world`
				)

				var events = eventsDb.search(sql`
					SELECT * FROM initiative_events
				`)

				events.must.eql([new ValidEvent({
					id: events[0].id,
					initiative_uuid: initiative.uuid,
					user_id: this.user.id,
					origin: "author",
					title: "Something happened",
					content: "You shouldn't miss it."
				})])
			})

			it("must respond with 403 if not author", function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: usersDb.create(new ValidUser).id,
					published_at: new Date
				}))

				var res = yield this.request(`/initiatives/${initiative.id}/events`, {
					method: "POST"
				})

				res.statusCode.must.equal(403)
				res.statusMessage.must.equal("No Permission to Edit")
			})
		})
	})
})

function mustRateLimit(request) {
	describe("as a rate limited endpoint", function() {
		beforeEach(function() {
			this.initiative = initiativesDb.create(new ValidInitiative({
				user_id: this.user.id,
				phase: "sign"
			}))
		})

		it(`must respond with 429 if created ${EVENT_RATE} events in the last 15m`,
			function*() {
			eventsDb.create(_.times(EVENT_RATE, (_i) => new ValidEvent({
				initiative_uuid: this.initiative.uuid,
				created_at: DateFns.addSeconds(DateFns.addMinutes(new Date, -15), 1),
				user_id: this.user.id
			})))

			var res = yield request.call(this)
			res.statusCode.must.equal(429)
		})

		it(`must not respond with 429 if created <${EVENT_RATE} events in the last 15m`, function*() {
			eventsDb.create(_.times(EVENT_RATE - 1, (_i) => new ValidEvent({
				initiative_uuid: this.initiative.uuid,
				created_at: DateFns.addSeconds(DateFns.addMinutes(new Date, -15), 1),
				user_id: this.user.id
			})))

			var res = yield request.call(this)
			res.statusCode.must.be.between(200, 399)
		})

		it(`must not respond with 429 if created ${EVENT_RATE} events earlier than 15m`, function*() {
			eventsDb.create(_.times(EVENT_RATE, (_i) => new ValidEvent({
				initiative_uuid: this.initiative.uuid,
				created_at: DateFns.addMinutes(new Date, -15),
				user_id: this.user.id
			})))

			var res = yield request.call(this)
			res.statusCode.must.be.between(200, 399)
		})
	})
}
