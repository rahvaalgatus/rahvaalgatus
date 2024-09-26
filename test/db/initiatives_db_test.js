var _ = require("root/lib/underscore")
var MediaType = require("medium-type")
var ValidUser = require("root/test/valid_user")
var ValidInitiative = require("root/test/valid_initiative")
var ValidEvent = require("root/test/valid_initiative_event")
var ValidSignable = require("root/test/valid_signable")
var ValidSignature = require("root/test/valid_signature")
var SqliteError = require("root/lib/sqlite_error")
var {insert} = require("heaven-sqlite")
var {sqlite} = require("root")
var sql = require("sqlate")
var initiativesDb = require("root/db/initiatives_db")
var usersDb = require("root/db/users_db")
var eventsDb = require("root/db/initiative_events_db")
var signablesDb = require("root/db/initiative_signables_db")
var signaturesDb = require("root/db/initiative_signatures_db")
var {serialize} = initiativesDb
var demand = require("must")
var {PHASES} = require("root/lib/initiative")

describe("InitiativesDb", function() {
	require("root/test/db")()
	require("root/test/time")()

	beforeEach(function() { this.user = usersDb.create(new ValidUser) })

	describe(".search", function() {
		describe("given a id", function() {
			it("must return initiative", function() {
				var initiative = new ValidInitiative({user_id: this.user.id})

				var id = sqlite(sql`
					${insert("initiatives", serialize(initiative))} RETURNING id
				`)[0].id

				initiativesDb.search(id).must.eql([_.defaults({id}, initiative)])
			})

			it("must return empty array if not found", function() {
				initiativesDb.search("deadbeef").must.eql([])
				sqlite(sql`SELECT * FROM initiatives`).must.eql([])
			})
		})

		describe("given an array of ids", function() {
			it("must return initiatives", function() {
				var a = new ValidInitiative({user_id: this.user.id})
				var b = new ValidInitiative({user_id: this.user.id})

				var aId = sqlite(sql`
					${insert("initiatives", serialize(a))} RETURNING id
				`)[0].id

				var bId = sqlite(sql`
					${insert("initiatives", serialize(b))} RETURNING id
				`)[0].id

				initiativesDb.search([bId, aId]).must.eql([
					_.defaults({id: aId}, a),
					_.defaults({id: bId}, b)
				])
			})

			it("must return only found initiatives", function() {
				var initiative = new ValidInitiative({user_id: this.user.id})

				var id = sqlite(sql`
					${insert("initiatives", serialize(initiative))} RETURNING id
				`)[0].id

				initiativesDb.search([id, id + 42]).must.eql([
					_.defaults({id}, initiative)
				])
			})
		})
	})

	describe(".read", function() {
		describe("given an id", function() {
			it("must return initiative", function() {
				var initiative = new ValidInitiative({user_id: this.user.id})

				var id = sqlite(sql`
					${insert("initiatives", serialize(initiative))} RETURNING id
				`)[0].id

				initiativesDb.read(id).must.eql(_.defaults({id}, initiative))
			})

			it("must return null if not found", function() {
				demand(initiativesDb.read(42)).be.null()
				sqlite(sql`SELECT * FROM initiatives`).must.eql([])
			})
		})


		describe("text_type", function() {
			it("must be parsed", function() {
				var initiative = new ValidInitiative({
					user_id: this.user.id,
					phase: "sign",
					text: "<h1>Hello, world!</h1>",
					text_type: new MediaType("text/html"),
					text_sha256: _.sha256("<h1>Hello, world!</h1>")
				})

				var created = initiativesDb.create(initiative)

				initiativesDb.read(created.id).must.eql(_.defaults({
					id: created.id
				}, initiative))
			})
		})
	})

	describe(".create", function() {
		it("must throw given no user_id nor external", function() {
			var err
			try {
				initiativesDb.create(new ValidInitiative({
					user_id: null,
					external: false
				}))
			}
			catch (ex) { err = ex }
			err.must.be.an.error(SqliteError)
			err.code.must.equal("constraint")
			err.type.must.equal("check")
			err.constraint.must.equal("user_id_or_external")
		})

		describe("phase", function() {
			describe("given initiative for parliament", function() {
				PHASES.forEach(function(phase) {
					it(`must allow ${phase} phase`, function() {
						var initiative = new ValidInitiative({
							phase: phase,
							external: true,
							destination: "parliament",
							discussion_ends_at: new Date
						})

						var created = initiativesDb.create(initiative)

						initiativesDb.read(created.id).must.eql(_.defaults({
							id: created.id
						}, initiative))
					})
				})
			})

			describe("given initiative for local", function() {
				_.without(PHASES, "parliament").forEach(function(phase) {
					it(`must allow ${phase} phase`, function() {
						var initiative = new ValidInitiative({
							phase: phase,
							external: true,
							destination: "muhu-vald",
							discussion_ends_at: new Date
						})

						var created = initiativesDb.create(initiative)

						initiativesDb.read(created.id).must.eql(_.defaults({
							id: created.id
						}, initiative))
					})
				})

				it("must throw if parliament phase", function() {
					var err
					try {
						initiativesDb.create(new ValidInitiative({
							phase: "parliament",
							external: true,
							destination: "muhu-vald",
						}))
					}
					catch (ex) { err = ex }
					err.must.be.an.error(SqliteError)
					err.code.must.equal("constraint")
					err.type.must.equal("check")
					err.constraint.must.equal("phase_not_parliament_when_local")
				})
			})
		})

		describe("uuid", function() {
			it("must throw given duplicate uuids", function() {
				var attrs = {
					user_id: this.user.id,
					uuid: "457628aa-42cd-45d8-bb74-94c4866c670c"
				}

				initiativesDb.create(new ValidInitiative(attrs))

				var err
				try { initiativesDb.create(new ValidInitiative(attrs)) }
				catch (ex) { err = ex }
				err.must.be.an.error(SqliteError)
				err.code.must.equal("constraint")
				err.type.must.equal("unique")
				err.columns.must.eql(["uuid"])
			})
		})

		describe("text", function() {
			it("must not be allowed in edit phase", function() {
				var initiative = new ValidInitiative({
					user_id: this.user.id,
					phase: "edit",
					text: "<h1>Hello, world!</h1>",
					text_type: null,
					text_sha256: null
				})

				var err
				try { initiativesDb.create(initiative) } catch (ex) { err = ex }
				err.must.be.an.error(SqliteError)
				err.constraint.must.equal("text_not_null")
			})

			_.without(PHASES, "edit").forEach(function(phase) {
				it(`must be allowed in ${phase}`, function() {
					var initiative = new ValidInitiative({
						user_id: this.user.id,
						phase: phase,
						text: "<h1>Hello, world!</h1>",
						text_type: new MediaType("text/html"),
						text_sha256: _.sha256("<h1>Hello, world!</h1>")
					})

					var created = initiativesDb.create(initiative)

					initiativesDb.read(created.id).must.eql(_.defaults({
						id: created.id
					}, initiative))
				})

				it(`must be allowed empty on external initiatives in ${phase}`,
					function() {
					var initiative = new ValidInitiative({
						phase: phase,
						external: true,
						text: null,
						text_type: null,
						text_sha256: null
					})

					var created = initiativesDb.create(initiative)

					initiativesDb.read(created.id).must.eql(_.defaults({
						id: created.id
					}, initiative))
				})
			})
		})

		describe("text_type", function() {
			it("must be required if text present", function() {
				var initiative = new ValidInitiative({
					user_id: this.user.id,
					phase: "sign",
					text: "<h1>Hello, world!</h1>",
					text_type: null,
					text_sha256: _.sha256("<h1>Hello, world!</h1>")
				})

				var err
				try { initiativesDb.create(initiative) } catch (ex) { err = ex }
				err.must.be.an.error(SqliteError)
				err.constraint.must.equal("text_type_not_null")
			})

			it("must not be empty", function() {
				var initiative = new ValidInitiative({
					user_id: this.user.id,
					phase: "sign",
					text: "<h1>Hello, world!</h1>",
					text_type: "",
					text_sha256: _.sha256("<h1>Hello, world!</h1>")
				})

				var err
				try { initiativesDb.create(initiative) } catch (ex) { err = ex }
				err.must.be.an.error(SqliteError)
				err.constraint.must.equal("text_type_length")
			})
		})

		describe("text_sha256", function() {
			it("must be required if text present", function() {
				var initiative = new ValidInitiative({
					user_id: this.user.id,
					phase: "sign",
					text: "<h1>Hello, world!</h1>",
					text_type: new MediaType("text/html"),
					text_sha256: null
				})

				var err
				try { initiativesDb.create(initiative) } catch (ex) { err = ex }
				err.must.be.an.error(SqliteError)
				err.constraint.must.equal("text_sha256_not_null")
			})

			it("must have SHA256 length", function() {
				var initiative = new ValidInitiative({
					user_id: this.user.id,
					phase: "sign",
					text: "<h1>Hello, world!</h1>",
					text_type: new MediaType("text/html"),
					text_sha256: _.sha256("<h1>Hello, world!</h1>").slice(0, -1)
				})

				var err
				try { initiativesDb.create(initiative) } catch (ex) { err = ex }
				err.must.be.an.error(SqliteError)
				err.constraint.must.equal("text_sha256_length")
			})
		})
	})

	describe(".delete", function() {
		describe("given a model", function() {
			it("must delete the initiative", function() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.user.id
				}))

				initiativesDb.delete(initiative)
				initiativesDb.search(sql`SELECT * FROM initiatives`).must.be.empty()
			})

			it("must not delete related events", function() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.user.id
				}))

				var event = eventsDb.create(new ValidEvent({
					initiative_uuid: initiative.uuid
				}))

				var err
				try { initiativesDb.delete(initiative) } catch (ex) { err = ex }
				err.must.be.an.error(SqliteError)
				err.code.must.equal("constraint")
				err.type.must.equal("foreign_key")

				initiativesDb.read(sql`
					SELECT * FROM initiatives
				`).must.eql(_.defaults({
					last_event_created_at: event.created_at
				}, initiative))

				eventsDb.read(sql`SELECT * FROM initiative_events`).must.eql(event)
			})

			it("must delete signables", function() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.user.id
				}))

				signablesDb.create(new ValidSignable({
					initiative_uuid: initiative.uuid
				}))

				initiativesDb.delete(initiative)

				signablesDb.search(sql`
					SELECT * FROM initiative_signables
				`).must.be.empty()
			})

			it("must not delete signatures", function() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.user.id
				}))

				// Ensure the signable doesn't get deleted even if signature didn't.
				var signable = signablesDb.create(new ValidSignable({
					initiative_uuid: initiative.uuid
				}))

				var signature = signaturesDb.create(new ValidSignature({
					initiative_uuid: initiative.uuid
				}))

				var err
				try { initiativesDb.delete(initiative) } catch (ex) { err = ex }
				err.must.be.an.error(SqliteError)
				err.code.must.equal("constraint")
				err.type.must.equal("foreign_key")

				signablesDb.read(sql`
					SELECT * FROM initiative_signables
				`).must.eql(signable)

				signaturesDb.read(sql`
					SELECT * FROM initiative_signatures
				`).must.eql(signature)
			})
		})
	})
})
