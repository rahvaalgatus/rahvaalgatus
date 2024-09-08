var _ = require("root/lib/underscore")
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
		require("root/test/fixtures").admin()

		describe("when merging", function() {
			it("must merge initiatives, comments and more", function*() {
				var source = usersDb.create(new ValidUser({
					country: null,
					personal_id: null,
					email: "john@example.com",
					email_confirmed_at: new Date
				}))

				var target = usersDb.create(new ValidUser({
					country: "EE",
					personal_id: "38706181337"
				}))

				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: source.id
				}))

				var comment = commentsDb.create(new ValidComment({
					initiative_uuid: initiative.uuid,
					user_id: source.id,
					user_uuid: _.serializeUuid(source.id)
				}))

				var event = eventsDb.create(new ValidEvent({
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

				usersDb.read(source).must.eql({
					__proto__: source,
					merged_with_id: target.id
				})

				usersDb.read(target).must.eql(target)

				initiativesDb.read(initiative.id).must.eql({
					__proto__: initiative,
					last_comment_created_at: comment.created_at,
					user_id: target.id
				})

				commentsDb.read(comment).must.eql({
					__proto__: comment,
					user_id: target.id,
					user_uuid: _.serializeUuid(target.uuid)
				})

				eventsDb.read(event).must.eql({
					__proto__: event,
					user_id: target.id,
					created_by: _.serializeUuid(target.uuid)
				})
			})

			it("must not touch unrelated rows", function*() {
				var other = usersDb.create(new ValidUser)

				var source = usersDb.create(new ValidUser({
					country: null,
					personal_id: null,
					email: "john@example.com",
					email_confirmed_at: new Date
				}))

				var target = usersDb.create(new ValidUser({
					country: "EE",
					personal_id: "38706181337"
				}))

				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: other.id
				}))

				var comment = commentsDb.create(new ValidComment({
					initiative_uuid: initiative.uuid,
					user_id: other.id,
					user_uuid: _.serializeUuid(other.id)
				}))

				var event = eventsDb.create(new ValidEvent({
					initiative_uuid: initiative.uuid,
					user_id: other.id,
					created_by: _.serializeUuid(other.id)
				}))

				var res = yield this.request(`/users/${source.id}`, {
					method: "PUT",
					form: {mergedWithPersonalId: target.personal_id}
				})

				res.statusCode.must.equal(303)

				initiativesDb.read(initiative.id).must.eql(_.defaults({
					last_comment_created_at: comment.created_at
				}, initiative))

				commentsDb.read(comment).must.eql(comment)
				eventsDb.read(event).must.eql(event)
			})
		})
	})
})
