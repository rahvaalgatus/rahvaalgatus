var ValidInitiative = require("root/test/valid_db_initiative")
var Config = require("root/config")
var newPartner = require("root/test/citizenos_fixtures").newPartner
var newUser = require("root/test/citizenos_fixtures").newUser
var newTopic = require("root/test/citizenos_fixtures").newTopic
var newVote = require("root/test/citizenos_fixtures").newVote
var newSignature = require("root/test/citizenos_fixtures").newSignature
var createPartner = require("root/test/citizenos_fixtures").createPartner
var createUser = require("root/test/citizenos_fixtures").createUser
var createTopic = require("root/test/citizenos_fixtures").createTopic
var createVote = require("root/test/citizenos_fixtures").createVote
var createSignature = require("root/test/citizenos_fixtures").createSignature
var createOptions = require("root/test/citizenos_fixtures").createOptions
var initiativesDb = require("root/db/initiatives_db")

describe("UserController", function() {
	require("root/test/db")()
	require("root/test/web")()
	require("root/test/mitm")()
	beforeEach(require("root/test/mitm").router)

	describe("GET /", function() {
		describe("when not logged in", function() {
			it("must respond with 401 Unauthorized", function*() {
				var res = yield this.request("/user")
				res.statusCode.must.equal(401)
			})
		})

		describe("when logged in", function() {
			require("root/test/fixtures").user()

			beforeEach(function*() {
				this.partner = yield createPartner(newPartner({
					id: Config.apiPartnerId
				}))
			})

			it("must show initiative in edit phase", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					phase: "edit"
				}))

				var topic = yield createTopic(newTopic({
					id: initiative.uuid,
					title: "My thoughts",
					creatorId: this.user.id,
					sourcePartnerId: this.partner.id
				}))

				var res = yield this.request("/user")
				res.statusCode.must.equal(200)
				res.body.must.include(initiative.uuid)
				res.body.must.include(topic.title)
			})

			it("must not show initiatives from other users", function*() {
				var initiative = yield initiativesDb.create(new ValidInitiative({
					phase: "edit"
				}))

				var user = yield createUser(newUser())

				yield createTopic(newTopic({
					id: initiative.uuid,
					title: "My thoughts",
					creatorId: user.id,
					sourcePartnerId: this.partner.id
				}))

				var res = yield this.request("/user")
				res.statusCode.must.equal(200)
				res.body.must.not.include(initiative.uuid)
			})

			describe("when CitizenOS-signable", function() {
				it("must show signed initiatives", function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative({
						phase: "sign"
					}))

					var author = yield createUser(newUser())
					var topic = yield createTopic(newTopic({
						id: initiative.uuid,
						creatorId: author.id,
						sourcePartnerId: this.partner.id,
						status: "voting"
					}))

					var vote = yield createVote(topic, newVote({endsAt: new Date}))
					var yesAndNo = yield createOptions(vote)

					yield createSignature(newSignature({
						userId: this.user.id,
						voteId: vote.id,
						optionId: yesAndNo[0]
					}))

					var res = yield this.request("/user")
					res.statusCode.must.equal(200)
					res.body.must.include(initiative.uuid)
				})

				it("must not show other user's signed initiatives", function*() {	
					var initiative = yield initiativesDb.create(new ValidInitiative({
						phase: "sign"
					}))

					var author = yield createUser(newUser())
					var user = yield createUser(newUser())

					var topic = yield createTopic(newTopic({
						id: initiative.uuid,
						creatorId: author.id,
						sourcePartnerId: this.partner.id,
						status: "voting"
					}))

					var vote = yield createVote(topic, newVote({endsAt: new Date}))
					var yesAndNo = yield createOptions(vote)

					yield createSignature(newSignature({
						userId: user.id,
						voteId: vote.id,
						optionId: yesAndNo[0]
					}))

					var res = yield this.request("/user")
					res.statusCode.must.equal(200)
					res.body.must.not.include(initiative.uuid)
				})
			})
		})
	})
})
