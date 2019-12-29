var SqliteError = require("root/lib/sqlite_error")
var ValidInitiative = require("root/test/valid_db_initiative")
var initiativesDb = require("root/db/initiatives_db")
var db = require("root/db/comments_db")

describe("CommentsDb", function() {
	require("root/test/db")()

	beforeEach(function*() {
		this.initiative = yield initiativesDb.create(new ValidInitiative)
	})
	
	describe(".create", function() {
		it("must throw given duplicate UUIDs", function*() {
			var attrs = {
				initiative_uuid: this.initiative.uuid,
				uuid: "245e3e1f-9d64-48bb-b008-817448e79c79",
				user_uuid: "49a506c8-1a2e-4995-bd2e-75bf0c722a19",
				title: "Hello, world!",
				text: "How are you?"
			}

			yield db.create(attrs)

			var err
			try { yield db.create(attrs) } catch (ex) { err = ex }
			err.must.be.an.error(SqliteError)
			err.code.must.equal("constraint")
			err.type.must.equal("unique")
			err.columns.must.eql(["uuid"])
		})
	})
})
