var _ = require("root/lib/underscore")
var SqliteError = require("root/lib/sqlite_error")
var ValidUser = require("root/test/valid_user")
var ValidInitiative = require("root/test/valid_db_initiative")
var ValidComment = require("root/test/valid_comment")
var createUser = require("root/test/fixtures").createUser
var initiativesDb = require("root/db/initiatives_db")
var db = require("root/db/comments_db")
var usersDb = require("root/db/users_db")

describe("CommentsDb", function() {
	require("root/test/db")()

	beforeEach(function*() {
		this.initiative = yield initiativesDb.create(new ValidInitiative({
			user_id: (yield usersDb.create(new ValidUser)).id
		}))
	})
	
	describe(".create", function() {
		it("must throw given duplicate UUIDs", function*() {
			var author = yield createUser()

			var comment = yield db.create(new ValidComment({
				uuid: "245e3e1f-9d64-48bb-b008-817448e79c79",
				initiative_uuid: this.initiative.uuid,
				user_id: author.id,
				user_uuid: _.serializeUuid(author.uuid)
			}))

			var err
			try {
				yield db.create(new ValidComment({
					uuid: comment.uuid,
					initiative_uuid: comment.initiative_uuid,
					user_id: comment.user_id,
					user_uuid: comment.user_uuid
				}))
			}
			catch (ex) { err = ex }
			err.must.be.an.error(SqliteError)
			err.code.must.equal("constraint")
			err.type.must.equal("unique")
			err.columns.must.eql(["uuid"])
		})
	})
})
