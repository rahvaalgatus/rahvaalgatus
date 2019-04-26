var _ = require("root/lib/underscore")
var ValidDbInitiative = require("root/test/valid_db_initiative")
var insert = require("heaven-sqlite").insert
var sqlite = require("root").sqlite
var sql = require("sqlate")
var initiativesDb = require("root/db/initiatives_db")

describe("InitiativesDb", function() {
	require("root/test/db")()

	describe(".search", function() {
		describe("given a uuid", function() {
			it("must return initiative", function*() {
				var initiative = new ValidDbInitiative
				yield sqlite(insert("initiatives", initiative))
				yield initiativesDb.search(initiative.uuid).must.then.eql([initiative])
			})

			it("must return null if not found", function*() {
				yield initiativesDb.search("deadbeef").must.then.eql([])
				yield sqlite(sql`SELECT * FROM initiatives`).must.then.eql([])
			})

			it("must return existing initiative when creating", function*() {
				var a = new ValidDbInitiative
				yield sqlite(insert("initiatives", a))
				var b = yield initiativesDb.search(a.uuid, {create: true})
				b.must.eql([a])
				yield sqlite(sql`SELECT * FROM initiatives`).must.then.eql([a])
			})

			it("must create and return a new initiative when creating", function*() {
				var uuid = "133ec861-b719-4d46-8483-4ba59d1d2412"
				var initiatives = yield initiativesDb.search(uuid, {create: true})
				initiatives.must.eql([new ValidDbInitiative({uuid: uuid})])
				yield sqlite(sql`SELECT * FROM initiatives`).must.then.eql(initiatives)
			})
		})

		describe("given an array of uuids", function() {
			it("must return initiatives", function*() {
				var a = new ValidDbInitiative
				var b = new ValidDbInitiative
				yield sqlite(insert("initiatives", a))
				yield sqlite(insert("initiatives", b))
				var initiatives = yield initiativesDb.search([a.uuid, b.uuid])
				_.sortBy(initiatives, "uuid").must.eql(_.sortBy([a, b], "uuid"))
			})

			it("must return only found initiatives", function*() {
				var a = new ValidDbInitiative
				var b = new ValidDbInitiative
				yield sqlite(insert("initiatives", a))

				yield initiativesDb.search([a.uuid, b.uuid]).must.then.eql([a])
				yield sqlite(sql`SELECT * FROM initiatives`).must.then.eql([a])
			})

			it("must return and create initiatives when creating", function*() {
				var a = new ValidDbInitiative({notes: "A"})
				var b = new ValidDbInitiative
				var c = new ValidDbInitiative({notes: "C"})
				yield sqlite(insert("initiatives", a))
				yield sqlite(insert("initiatives", c))

				var initiatives = yield initiativesDb.search([a.uuid, b.uuid, c.uuid], {
					create: true
				})

				_.sortBy(initiatives, "uuid").must.eql(_.sortBy([a, c, b], "uuid"))
			})
		})
	})

	describe(".read", function() {
		describe("given a uuid", function() {
			it("must return initiative", function*() {
				var initiative = new ValidDbInitiative
				yield sqlite(insert("initiatives", initiative))
				yield initiativesDb.read(initiative.uuid).must.then.eql(initiative)
			})

			it("must return null if not found", function*() {
				yield initiativesDb.read("deadbeef").must.then.be.null()
				yield sqlite(sql`SELECT * FROM initiatives`).must.then.eql([])
			})

			it("must return existing initiative when creating", function*() {
				var a = new ValidDbInitiative
				yield sqlite(insert("initiatives", a))
				var b = yield initiativesDb.read(a.uuid, {create: true})
				b.must.eql(a)
				yield sqlite(sql`SELECT * FROM initiatives`).must.then.eql([a])
			})

			it("must create and return a new initiative when creating", function*() {
				var uuid = "133ec861-b719-4d46-8483-4ba59d1d2412"
				var initiative = yield initiativesDb.read(uuid, {create: true})
				initiative.must.eql(new ValidDbInitiative({uuid: uuid}))
				yield sqlite(sql`SELECT * FROM initiatives`).must.then.eql([initiative])
			})
		})
	})
})
