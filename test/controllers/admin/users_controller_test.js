var _ = require("root/lib/underscore")
var Config = require("root/config")
var ValidUser = require("root/test/valid_user")
var ValidInitiative = require("root/test/valid_initiative")
var ValidComment = require("root/test/valid_comment")
var ValidEvent = require("root/test/valid_initiative_event")
var usersDb = require("root/db/users_db")
var initiativesDb = require("root/db/initiatives_db")
var commentsDb = require("root/db/comments_db")
var eventsDb = require("root/db/initiative_events_db")

describe("AdminUsersController", function() {
	require("root/test/adm")()
	require("root/test/mitm")()
	require("root/test/db")()
	require("root/test/time")()
	require("root/test/email")()
	require("root/test/fixtures").csrf()
	beforeEach(require("root/test/mitm").router)

	describe("PUT /users/:id", function() {
		require("root/test/fixtures").user({
			country: Config.adminPersonalIds[0].slice(0, 2),
			personal_id: Config.adminPersonalIds[0].slice(2)
		})

		describe("when merging", function() {
			it("must merge initiatives, comments and more", function*() {
				var source = yield usersDb.create(new ValidUser({
					country: null,
					personal_id: null,
					email: "john@example.com",
					email_confirmed_at: new Date
				}))

				var target = yield usersDb.create(new ValidUser({
					country: "EE",
					personal_id: "38706181337"
				}))

				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: source.id
				}))

				var comment = yield commentsDb.create(new ValidComment({
					initiative_uuid: initiative.uuid,
					user_id: source.id,
					user_uuid: _.serializeUuid(source.id)
				}))

				var event = yield eventsDb.create(new ValidEvent({
					initiative_uuid: initiative.uuid,
					user_id: source.id,
					created_by: _.serializeUuid(source.id)
				}))

				var res = yield this.request(`/users/${source.id}`, {
					method: "PUT",
					form: {mergedWithPersonalId: target.personal_id}
				})

				res.statusCode.must.equal(303)
				res.headers.location.must.equal(`/users/${source.id}`)

				yield usersDb.read(source).must.then.eql({
					__proto__: source,
					merged_with_id: target.id
				})

				yield usersDb.read(target).must.then.eql(target)

				yield initiativesDb.read(initiative).must.then.eql({
					__proto__: initiative,
					user_id: target.id
				})

				yield commentsDb.read(comment).must.then.eql({
					__proto__: comment,
					user_id: target.id,
					user_uuid: _.serializeUuid(target.uuid)
				})

				yield eventsDb.read(event).must.then.eql({
					__proto__: event,
					user_id: target.id,
					created_by: _.serializeUuid(target.uuid)
				})
			})

			it("must not touch unrelated rows", function*() {
				var other = yield usersDb.create(new ValidUser)

				var source = yield usersDb.create(new ValidUser({
					country: null,
					personal_id: null,
					email: "john@example.com",
					email_confirmed_at: new Date
				}))

				var target = yield usersDb.create(new ValidUser({
					country: "EE",
					personal_id: "38706181337"
				}))

				var initiative = yield initiativesDb.create(new ValidInitiative({
					user_id: other.id
				}))

				var comment = yield commentsDb.create(new ValidComment({
					initiative_uuid: initiative.uuid,
					user_id: other.id,
					user_uuid: _.serializeUuid(other.id)
				}))

				var event = yield eventsDb.create(new ValidEvent({
					initiative_uuid: initiative.uuid,
					user_id: other.id,
					created_by: _.serializeUuid(other.id)
				}))

				var res = yield this.request(`/users/${source.id}`, {
					method: "PUT",
					form: {mergedWithPersonalId: target.personal_id}
				})

				res.statusCode.must.equal(303)

				yield initiativesDb.read(initiative).must.then.eql(initiative)
				yield commentsDb.read(comment).must.then.eql(comment)
				yield eventsDb.read(event).must.then.eql(event)
			})
		})
	})
})