var _ = require("root/lib/underscore")
var MediaType = require("medium-type")
var ValidInitiative = require("root/test/valid_db_initiative")
var ValidEvent = require("root/test/valid_db_initiative_event")
var ValidSignable = require("root/test/valid_signable")
var ValidSignature = require("root/test/valid_signature")
var SqliteError = require("root/lib/sqlite_error")
var sha256 = require("root/lib/crypto").hash.bind(null, "sha256")
var insert = require("heaven-sqlite").insert
var sqlite = require("root").sqlite
var sql = require("sqlate")
var db = require("root/db/initiatives_db")
var eventsDb = require("root/db/initiative_events_db")
var signablesDb = require("root/db/initiative_signables_db")
var signaturesDb = require("root/db/initiative_signatures_db")
var serialize = db.serialize
var PHASES = require("root/lib/initiative").PHASES

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

		describe("text", function() {
			it("must not be allowed in edit phase", function*() {
				var initiative = new ValidInitiative({
					phase: "edit",
					text: "<h1>Hello, world!</h1>",
					text_type: null,
					text_sha256: null
				})

				var err
				try { yield db.create(initiative) } catch (ex) { err = ex }
				err.must.be.an.error(SqliteError)
				err.constraint.must.equal("initiatives_text_not_null")
			})

			_.without(PHASES, "edit").forEach(function(phase) {
				it(`must be allowed in ${phase}`, function*() {
					var initiative = new ValidInitiative({
						phase: phase,
						text: "<h1>Hello, world!</h1>",
						text_type: new MediaType("text/html"),
						text_sha256: sha256("<h1>Hello, world!</h1>")
					})

					yield db.read(yield db.create(initiative)).must.then.eql(initiative)
				})

				it(`must be allowed empty on external initiatives in ${phase}`,
					function*() {
					var initiative = new ValidInitiative({
						phase: phase,
						external: true,
						text: null,
						text_type: null,
						text_sha256: null
					})

					yield db.read(yield db.create(initiative)).must.then.eql(initiative)
				})
			})
		})

		describe("text_type", function() {
			it("must be parsed", function*() {
				var initiative = new ValidInitiative({
					phase: "sign",
					text: "<h1>Hello, world!</h1>",
					text_type: new MediaType("text/html"),
					text_sha256: sha256("<h1>Hello, world!</h1>")
				})

				yield db.read(yield db.create(initiative)).must.then.eql(initiative)
			})

			it("must be required if text present", function*() {
				var initiative = new ValidInitiative({
					phase: "sign",
					text: "<h1>Hello, world!</h1>",
					text_type: null,
					text_sha256: sha256("<h1>Hello, world!</h1>")
				})

				var err
				try { yield db.create(initiative) } catch (ex) { err = ex }
				err.must.be.an.error(SqliteError)
				err.constraint.must.equal("initiatives_text_type_not_null")
			})

			it("must not be empty", function*() {
				var initiative = new ValidInitiative({
					phase: "sign",
					text: "<h1>Hello, world!</h1>",
					text_type: "",
					text_sha256: sha256("<h1>Hello, world!</h1>")
				})

				var err
				try { yield db.create(initiative) } catch (ex) { err = ex }
				err.must.be.an.error(SqliteError)
				err.constraint.must.equal("initiatives_text_type_length")
			})
		})

		describe("text_sha256", function() {
			it("must be required if text present", function*() {
				var initiative = new ValidInitiative({
					phase: "sign",
					text: "<h1>Hello, world!</h1>",
					text_type: new MediaType("text/html"),
					text_sha256: null
				})

				var err
				try { yield db.create(initiative) } catch (ex) { err = ex }
				err.must.be.an.error(SqliteError)
				err.constraint.must.equal("initiatives_text_sha256_not_null")
			})

			it("must have SHA256 length", function*() {
				var initiative = new ValidInitiative({
					phase: "sign",
					text: "<h1>Hello, world!</h1>",
					text_type: new MediaType("text/html"),
					text_sha256: sha256("<h1>Hello, world!</h1>").slice(0, -1)
				})

				var err
				try { yield db.create(initiative) } catch (ex) { err = ex }
				err.must.be.an.error(SqliteError)
				err.constraint.must.equal("initiatives_text_sha256_length")
			})
		})
	})

	describe(".delete", function() {
		describe("given a model ", function() {
			it("must delete the initiative", function*() {
				var initiative = yield db.create(new ValidInitiative)
				yield db.delete(initiative)
				yield db.search(sql`SELECT * FROM initiatives`).must.then.be.empty()
			})

			it("must not delete related events", function*() {
				var initiative = yield db.create(new ValidInitiative)

				var event = yield eventsDb.create(new ValidEvent({
					initiative_uuid: initiative.uuid
				}))

				var err
				try { yield db.delete(initiative) } catch (ex) { err = ex }
				err.must.be.an.error(SqliteError)
				err.code.must.equal("constraint")
				err.type.must.equal("foreign_key")

				yield db.read(sql`SELECT * FROM initiatives`).must.then.eql(initiative)

				yield eventsDb.read(sql`
					SELECT * FROM initiative_events
				`).must.then.eql(event)
			})

			it("must delete signables", function*() {
				var initiative = yield db.create(new ValidInitiative)

				yield signablesDb.create(new ValidSignable({
					initiative_uuid: initiative.uuid
				}))

				yield db.delete(initiative)

				yield signablesDb.search(sql`
					SELECT * FROM initiative_signables
				`).must.then.be.empty()
			})

			it("must not delete signatures", function*() {
				var initiative = yield db.create(new ValidInitiative)

				// Ensure the signable doesn't get deleted even if signature didn't.
				var signable = yield signablesDb.create(new ValidSignable({
					initiative_uuid: initiative.uuid
				}))

				var signature = yield signaturesDb.create(new ValidSignature({
					initiative_uuid: initiative.uuid
				}))

				var err
				try { yield db.delete(initiative) } catch (ex) { err = ex }
				err.must.be.an.error(SqliteError)
				err.code.must.equal("constraint")
				err.type.must.equal("foreign_key")

				yield signablesDb.read(sql`
					SELECT * FROM initiative_signables
				`).must.then.eql(signable)

				yield signaturesDb.read(sql`
					SELECT * FROM initiative_signatures
				`).must.then.eql(signature)
			})
		})
	})
})
