var ValidUser = require("root/test/valid_user")
var ValidInitiative = require("root/test/valid_initiative")
var ValidText = require("root/test/valid_initiative_text")
var SqliteError = require("root/lib/sqlite_error")
var initiativesDb = require("root/db/initiatives_db")
var textsDb = require("root/db/initiative_texts_db")
var usersDb = require("root/db/users_db")
var sql = require("sqlate")

describe("InitiativeTextsDb", function() {
	require("root/test/db")()

	beforeEach(function() {
		this.initiative = initiativesDb.create(new ValidInitiative({
			user_id: usersDb.create(new ValidUser).id
		}))
	})

	describe(".prototype.create", function() {
		it("must create text", function() {
			var text = new ValidText({
				id: 1,
				initiative_uuid: this.initiative.uuid,
				user_id: this.initiative.user_id
			})

			textsDb.create(text)
			textsDb.read(sql`SELECT * FROM initiative_texts`).must.eql(text)
		})

		it("must permit basis from the same initiative", function() {
			var basis = new ValidText({
				initiative_uuid: this.initiative.uuid,
				user_id: this.initiative.user_id
			})

			textsDb.create(new ValidText({
				initiative_uuid: this.initiative.uuid,
				user_id: this.initiative.user_id,
				basis_id: basis.id
			}))
		})

		it("must not permit basis from another initiative", function() {
			var other = initiativesDb.create(new ValidInitiative({
				user_id: this.initiative.user_id
			}))

			var basis = textsDb.create(new ValidText({
				initiative_uuid: other.uuid,
				user_id: this.initiative.user_id
			}))

			var text = new ValidText({
				initiative_uuid: this.initiative.uuid,
				user_id: this.initiative.user_id,
				basis_id: basis.id
			})

			var err
			try { textsDb.create(text) } catch (ex) { err = ex }
			err.must.be.an.error(SqliteError)
			err.code.must.equal("constraint")
			err.type.must.equal("foreign_key")
		})
	})
})
