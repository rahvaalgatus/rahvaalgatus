var _ = require("root/lib/underscore")
var ValidInitiative = require("root/test/valid_db_initiative")
var ValidEvent = require("root/test/valid_db_initiative_event")
var insert = require("heaven-sqlite").insert
var sqlite = require("root").sqlite
var sql = require("sqlate")
var db = require("root/db/initiatives_db")
var eventsDb = require("root/db/initiative_events_db")
var serialize = db.serialize

describe("InitiativesDb", function() {
	require("root/test/db")()
	require("root/test/time")()

	describe(".search", function() {
		describe("given a uuid", function() {
			it("must return initiative", function*() {
				var initiative = new ValidInitiative
				yield sqlite(insert("initiatives", serialize(initiative)))
				yield db.search(initiative.uuid).must.then.eql([initiative])
			})

			it("must return null if not found", function*() {
				yield db.search("deadbeef").must.then.eql([])
				yield sqlite(sql`SELECT * FROM initiatives`).must.then.eql([])
			})

			it("must return existing initiative when creating", function*() {
				var a = new ValidInitiative
				yield sqlite(insert("initiatives", serialize(a)))
				var b = yield db.search(a.uuid, {create: true})
				b.must.eql([a])
				yield db.search(sql`SELECT * FROM initiatives`).must.then.eql([a])
			})

			it("must create and return a new initiative when creating", function*() {
				var uuid = "133ec861-b719-4d46-8483-4ba59d1d2412"
				var initiatives = yield db.search(uuid, {create: true})
				initiatives.must.eql([new ValidInitiative({uuid: uuid})])

				yield db.search(sql`SELECT * FROM initiatives`).must.then.eql(
					initiatives
				)
			})
		})

		describe("given an array of uuids", function() {
			it("must return initiatives", function*() {
				var a = new ValidInitiative
				var b = new ValidInitiative
				yield sqlite(insert("initiatives", serialize(a)))
				yield sqlite(insert("initiatives", serialize(b)))
				var initiatives = yield db.search([a.uuid, b.uuid])
				_.sortBy(initiatives, "uuid").must.eql(_.sortBy([a, b], "uuid"))
			})

			it("must return only found initiatives", function*() {
				var a = new ValidInitiative
				var b = new ValidInitiative
				yield sqlite(insert("initiatives", serialize(a)))

				yield db.search([a.uuid, b.uuid]).must.then.eql([a])
				yield db.search(sql`SELECT * FROM initiatives`).must.then.eql([a])
			})

			it("must return and create initiatives when creating", function*() {
				var a = new ValidInitiative({notes: "A"})
				var b = new ValidInitiative
				var c = new ValidInitiative({notes: "C"})
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
				var initiative = new ValidInitiative
				yield sqlite(insert("initiatives", serialize(initiative)))
				yield db.read(initiative.uuid).must.then.eql(initiative)
			})

			it("must return null if not found", function*() {
				yield db.read("deadbeef").must.then.be.null()
				yield sqlite(sql`SELECT * FROM initiatives`).must.then.eql([])
			})

			it("must return existing initiative when creating", function*() {
				var a = new ValidInitiative
				yield sqlite(insert("initiatives", serialize(a)))
				var b = yield db.read(a.uuid, {create: true})
				b.must.eql(a)
				yield db.search(sql`SELECT * FROM initiatives`).must.then.eql([a])
			})

			it("must create and return a new initiative when creating", function*() {
				var uuid = "133ec861-b719-4d46-8483-4ba59d1d2412"
				var initiative = yield db.read(uuid, {create: true})
				initiative.must.eql(new ValidInitiative({uuid: uuid}))

				yield db.search(sql`SELECT * FROM initiatives`).must.then.eql([
					initiative
				])
			})
		})
	})

	describe(".delete", function() {
		describe("given a model ", function() {
			it("must delete related events", function*() {
				var initiative = yield db.create(new ValidInitiative)

				yield eventsDb.create(new ValidEvent({
					initiative_uuid: initiative.uuid
				}))

				yield db.delete(initiative)

				yield db.search(sql`SELECT * FROM initiatives`).must.then.be.empty()

				yield eventsDb.search(sql`
					SELECT * FROM initiative_events
				`).must.then.be.empty()
			})
		})
	})
})
