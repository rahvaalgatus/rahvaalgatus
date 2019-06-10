var _ = require("root/lib/underscore")
var ValidDbInitiative = require("root/test/valid_db_initiative")
var insert = require("heaven-sqlite").insert
var sqlite = require("root").sqlite
var sql = require("sqlate")
var db = require("root/db/initiatives_db")
var serialize = db.serialize

describe("InitiativesDb", function() {
	require("root/test/db")()

	describe(".search", function() {
		describe("given a uuid", function() {
			it("must return initiative", function*() {
				var initiative = new ValidDbInitiative
				yield sqlite(insert("initiatives", serialize(initiative)))
				yield db.search(initiative.uuid).must.then.eql([initiative])
			})

			it("must return null if not found", function*() {
				yield db.search("deadbeef").must.then.eql([])
				yield sqlite(sql`SELECT * FROM initiatives`).must.then.eql([])
			})

			it("must return existing initiative when creating", function*() {
				var a = new ValidDbInitiative
				yield sqlite(insert("initiatives", serialize(a)))
				var b = yield db.search(a.uuid, {create: true})
				b.must.eql([a])
				yield db.search(sql`SELECT * FROM initiatives`).must.then.eql([a])
			})

			it("must create and return a new initiative when creating", function*() {
				var uuid = "133ec861-b719-4d46-8483-4ba59d1d2412"
				var initiatives = yield db.search(uuid, {create: true})
				initiatives.must.eql([new ValidDbInitiative({uuid: uuid})])

				yield db.search(sql`SELECT * FROM initiatives`).must.then.eql(
					initiatives
				)
			})
		})

		describe("given an array of uuids", function() {
			it("must return initiatives", function*() {
				var a = new ValidDbInitiative
				var b = new ValidDbInitiative
				yield sqlite(insert("initiatives", serialize(a)))
				yield sqlite(insert("initiatives", serialize(b)))
				var initiatives = yield db.search([a.uuid, b.uuid])
				_.sortBy(initiatives, "uuid").must.eql(_.sortBy([a, b], "uuid"))
			})

			it("must return only found initiatives", function*() {
				var a = new ValidDbInitiative
				var b = new ValidDbInitiative
				yield sqlite(insert("initiatives", serialize(a)))

				yield db.search([a.uuid, b.uuid]).must.then.eql([a])
				yield db.search(sql`SELECT * FROM initiatives`).must.then.eql([a])
			})

			it("must return and create initiatives when creating", function*() {
				var a = new ValidDbInitiative({notes: "A"})
				var b = new ValidDbInitiative
				var c = new ValidDbInitiative({notes: "C"})
				yield sqlite(insert("initiatives", serialize(a)))
				yield sqlite(insert("initiatives", serialize(c)))

				var initiatives = yield db.search([a.uuid, b.uuid, c.uuid], {
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
				yield sqlite(insert("initiatives", serialize(initiative)))
				yield db.read(initiative.uuid).must.then.eql(initiative)
			})

			it("must return null if not found", function*() {
				yield db.read("deadbeef").must.then.be.null()
				yield sqlite(sql`SELECT * FROM initiatives`).must.then.eql([])
			})

			it("must return existing initiative when creating", function*() {
				var a = new ValidDbInitiative
				yield sqlite(insert("initiatives", serialize(a)))
				var b = yield db.read(a.uuid, {create: true})
				b.must.eql(a)
				yield db.search(sql`SELECT * FROM initiatives`).must.then.eql([a])
			})

			it("must create and return a new initiative when creating", function*() {
				var uuid = "133ec861-b719-4d46-8483-4ba59d1d2412"
				var initiative = yield db.read(uuid, {create: true})
				initiative.must.eql(new ValidDbInitiative({uuid: uuid}))

				yield db.search(sql`SELECT * FROM initiatives`).must.then.eql([
					initiative
				])
			})
		})
	})
})
