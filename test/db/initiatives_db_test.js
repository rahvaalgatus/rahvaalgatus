var ValidDbInitiative = require("root/test/valid_db_initiative")
var sqlite = require("root").sqlite
var initiativesDb = require("root/db/initiatives_db")

describe("InitiativesDb", function() {
	require("root/test/db")()

	describe(".read", function() {
		describe("given a uuid", function() {
			it("must return initiative", function*() {
				var initiative = new ValidDbInitiative
				initiative = yield sqlite.create("initiatives", initiative)
				yield initiativesDb.read(initiative.uuid).must.then.eql(initiative)
			})

			it("must return existing initiative when creating", function*() {
				var a = yield sqlite.create("initiatives", new ValidDbInitiative)
				var b = yield initiativesDb.read(a.uuid, {create: true})
				a.must.eql(b)
				yield sqlite.search("SELECT * FROM initiatives").must.then.eql([a])
			})

			it("must create and return a new initiative when creating", function*() {
				var uuid = "133ec861-b719-4d46-8483-4ba59d1d2412"
				var initiative = yield initiativesDb.read(uuid, {create: true})
				initiative.must.eql(new ValidDbInitiative({uuid: uuid}))

				yield sqlite.search("SELECT * FROM initiatives").must.then.eql([
					initiative
				])
			})
		})
	})
})
