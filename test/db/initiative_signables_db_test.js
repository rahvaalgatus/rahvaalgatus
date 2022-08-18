var ValidUser = require("root/test/valid_user")
var ValidInitiative = require("root/test/valid_initiative")
var ValidSignable = require("root/test/valid_signable")
var usersDb = require("root/db/users_db")
var initiativesDb = require("root/db/initiatives_db")
var signablesDb = require("root/db/initiative_signables_db")

describe("InitiativeSignablesDb", function() {
	require("root/test/db")()

	beforeEach(function() {
		this.initiative = initiativesDb.create(new ValidInitiative({
			user_id: usersDb.create(new ValidUser).id
		}))
	})

	describe(".read", function() {
		it("must parse a signable", function() {
			var signable = new ValidSignable({
				initiative_uuid: this.initiative.uuid,
				created_at: new Date(2015, 5, 18, 13, 37, 42, 666),
				updated_at: new Date(2015, 5, 18, 14, 37, 42, 666)
			})

			signablesDb.read(signablesDb.create(signable)).must.eql(signable)
		})
	})
})
