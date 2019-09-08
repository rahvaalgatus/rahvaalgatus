var Config = require("root/config")
var ValidInitiative = require("root/test/valid_db_initiative")
var newPartner = require("root/test/citizenos_fixtures").newPartner
var newUser = require("root/test/citizenos_fixtures").newUser
var newTopic = require("root/test/citizenos_fixtures").newTopic
var createPartner = require("root/test/citizenos_fixtures").createPartner
var createUser = require("root/test/citizenos_fixtures").createUser
var createTopic = require("root/test/citizenos_fixtures").createTopic
var initiativesDb = require("root/db/initiatives_db")
var t = require("root/lib/i18n").t.bind(null, "et")

describe("InitiativeAuthorsController", function() {
	require("root/test/web")()
	require("root/test/mitm")()
	require("root/test/db")()
	require("root/test/fixtures").csrf()
	beforeEach(require("root/test/mitm").router)

	beforeEach(function*() {
		this.partner = yield createPartner(newPartner({id: Config.apiPartnerId}))
	})

	describe("GET /new", function() {
		describe("when not logged in", function() {
			it("must respond with 401", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative)

				yield createTopic(newTopic({
					id: initiative.uuid,
					creatorId: (yield createUser(newUser())).id,
					sourcePartnerId: this.partner.id,
					visibility: "public"
				}))

				var path = `/initiatives/${initiative.uuid}/authors/new`
				var res = yield this.request(path)
				res.statusCode.must.equal(401)
			})
		})

		describe("when logged in", function() {
			require("root/test/fixtures").user()

			it("must respond with authors page", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative)

				yield createTopic(newTopic({
					id: initiative.uuid,
					creatorId: this.user.id,
					sourcePartnerId: this.partner.id,
					visibility: "public"
				}))

				var path = `/initiatives/${initiative.uuid}/authors/new`
				var res = yield this.request(path)
				res.statusCode.must.equal(200)
				res.body.must.include(t("ADD_CO_AUTHOR"))
			})

			it("must respond with 403 if lacking permissions", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative)

				yield createTopic(newTopic({
					id: initiative.uuid,
					creatorId: (yield createUser(newUser())).id,
					sourcePartnerId: this.partner.id,
					visibility: "public"
				}))

				var path = `/initiatives/${initiative.uuid}/authors/new`
				var res = yield this.request(path)
				res.statusCode.must.equal(403)
				res.statusMessage.must.match(/edit permission/i)
			})
		})
	})

	describe("POST /", function() {
		describe("when not logged in", function() {
			it("must respond with 401", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative)

				yield createTopic(newTopic({
					id: initiative.uuid,
					creatorId: (yield createUser(newUser())).id,
					sourcePartnerId: this.partner.id,
					visibility: "public"
				}))

				var path = `/initiatives/${initiative.uuid}/authors`
				var res = yield this.request(path, {
					method: "POST",
					form: {_csrf_token: this.csrfToken}
				})

				res.statusCode.must.equal(401)
			})
		})
		
		describe("when logged in", function() {
			require("root/test/fixtures").user()

			it("must create initiative", function*() {
				var created = 0
				var initiative = yield initiativesDb.create(new ValidInitiative)

				var topic = yield createTopic(newTopic({
					id: initiative.uuid,
					creatorId: this.user.id,
					sourcePartnerId: this.partner.id,
					visibility: "public"
				}))

				this.router.post(`/api/users/self/topics/${topic.id}/members/users`,
					function(req, res) {
					++created
					req.headers.authorization.must.exist()

					req.body.must.eql({
						userId: "user@example.com",
						level: "edit"
					})

					res.end()
				})

				var path = `/initiatives/${initiative.uuid}/authors`
				var res = yield this.request(path, {
					method: "POST",
					form: {_csrf_token: this.csrfToken, email: "user@example.com"}
				})

				res.statusCode.must.equal(303)
				res.headers.location.must.equal("/initiatives/" + initiative.uuid)
				created.must.equal(1)
			})
		})
	})
})
