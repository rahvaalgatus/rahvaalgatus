var _ = require("root/lib/underscore")
var HeavenError = require("heaven/error")
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

			it("must throw if not found", function*() {
				var err
				try { yield initiativesDb.read("fcefc082-1889-42a6-9bdb-e08ab268d141") }
				catch (ex) { err = ex }
				err.must.be.an.error(HeavenError)
				err.code.must.equal(404)
				yield sqlite.search("SELECT * FROM initiatives").must.then.eql([])
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

		describe("given an array of uuids", function() {
			it("must return initiatives", function*() {
				var a = new ValidDbInitiative
				var b = new ValidDbInitiative
				yield sqlite.create("initiatives", a)
				yield sqlite.create("initiatives", b)
				var initiatives = yield initiativesDb.read([a.uuid, b.uuid])
				_.sortBy(initiatives, "uuid").must.eql(_.sortBy([a, b], "uuid"))
			})

			it("must throw if not all found", function*() {
				var a = new ValidDbInitiative
				var b = new ValidDbInitiative
				yield sqlite.create("initiatives", a)

				var err
				try { yield initiativesDb.read([a.uuid, b.uuid]) }
				catch (ex) { err = ex }
				err.must.be.an.error(HeavenError)
				err.code.must.equal(404)
				yield sqlite.search("SELECT * FROM initiatives").must.then.eql([a])
			})

			it("must return and create initiatives when creating", function*() {
				var a = new ValidDbInitiative({notes: "A"})
				var b = new ValidDbInitiative
				var c = new ValidDbInitiative({notes: "C"})
				yield sqlite.create("initiatives", a)
				yield sqlite.create("initiatives", c)

				var initiatives = yield initiativesDb.read([a.uuid, b.uuid, c.uuid], {
					create: true
				})

				_.sortBy(initiatives, "uuid").must.eql(_.sortBy([a, c, b], "uuid"))
			})
		})
	})
})
