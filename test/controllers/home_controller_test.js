var _ = require("root/lib/underscore")
var Config = require("root/config")
var DateFns = require("date-fns")
var newPartner = require("root/test/citizenos_fixtures").newPartner
var newUser = require("root/test/citizenos_fixtures").newUser
var newTopic = require("root/test/citizenos_fixtures").newTopic
var newVote = require("root/test/citizenos_fixtures").newVote
var createPartner = require("root/test/citizenos_fixtures").createPartner
var createUser = require("root/test/citizenos_fixtures").createUser
var createTopic = require("root/test/citizenos_fixtures").createTopic
var createVote = require("root/test/citizenos_fixtures").createVote
var createSignatures = require("root/test/citizenos_fixtures").createSignatures

describe("HomeController", function() {
	require("root/test/web")()
	require("root/test/mitm")()
	require("root/test/db")()
	require("root/test/time")()
	beforeEach(require("root/test/mitm").router)

	describe("/", function() {
		beforeEach(function*() {
			this.user = yield createUser(newUser())
			this.partner = yield createPartner(newPartner({id: Config.apiPartnerId}))
		})

		it("must show initiatives in discussion", function*() {
			var topic = yield createTopic(newTopic({
				creatorId: this.user.id,
				sourcePartnerId: this.partner.id,
				endsAt: DateFns.addSeconds(new Date, 1)
			}))

			var res = yield this.request("/")
			res.statusCode.must.equal(200)
			res.body.must.include(topic.id)
		})

		it("must not show initiatives in discussion that have ended", function*() {
			var topic = yield createTopic(newTopic({
				creatorId: this.user.id,
				sourcePartnerId: this.partner.id,
				endsAt: new Date
			}))

			var res = yield this.request("/")
			res.statusCode.must.equal(200)
			res.body.must.not.include(topic.id)
		})

		it("must show initiatives in signing", function*() {
			var topic = yield createTopic(newTopic({
				creatorId: this.user.id,
				sourcePartnerId: this.partner.id,
				status: "voting"
			}))

			yield createVote(topic, newVote({
				endsAt: DateFns.addSeconds(new Date, 1)
			}))

			var res = yield this.request("/")
			res.statusCode.must.equal(200)
			res.body.must.include(topic.id)
		})

		it("must not show initiatives in signing that failed", function*() {
			var topic = yield createTopic(newTopic({
				creatorId: this.user.id,
				sourcePartnerId: this.partner.id,
				status: "voting"
			}))

			yield createVote(topic, newVote({endsAt: new Date}))

			var res = yield this.request("/")
			res.statusCode.must.equal(200)
			res.body.must.not.include(topic.id)
		})

		it("must show initiatives in signing that succeeded", function*() {
			var topic = yield createTopic(newTopic({
				creatorId: this.user.id,
				sourcePartnerId: this.partner.id,
				status: "voting"
			}))

			var vote = yield createVote(topic, newVote({endsAt: new Date}))
			yield createSignatures(vote, Config.votesRequired)

			var res = yield this.request("/")
			res.statusCode.must.equal(200)
			res.body.must.include(topic.id)
		})

		it("must show initiatives in parliament", function*() {
			var topic = yield createTopic(newTopic({
				creatorId: this.user.id,
				sourcePartnerId: this.partner.id,
				status: "followUp"
			}))

			yield createVote(topic, newVote())

			var res = yield this.request("/")
			res.statusCode.must.equal(200)
			res.body.must.include(topic.id)
		})

		it("must not show closed initiatives", function*() {
			var topic = yield createTopic(newTopic({
				creatorId: this.user.id,
				sourcePartnerId: this.partner.id,
				status: "closed"
			}))

			var res = yield this.request("/")
			res.statusCode.must.equal(200)
			res.body.must.not.include(topic.id)
		})

		_.each(Config.partners, function(partner, id) {
			if (id == Config.apiPartnerId) return

			it("must show initiatives for " + partner.name, function*() {
				var partner = yield createPartner(newPartner({id: id}))

				var topic = yield createTopic(newTopic({
					creatorId: this.user.id,
					sourcePartnerId: partner.id,
					endsAt: DateFns.addSeconds(new Date, 1)
				}))

				var res = yield this.request("/initiatives")
				res.statusCode.must.equal(200)
				res.body.must.include(topic.id)
			})
		})

		it("must not show initiatives from other partners", function*() {
			var partner = yield createPartner(newPartner())

			var topic = yield createTopic(newTopic({
				creatorId: this.user.id,
				sourcePartnerId: partner.id,
				endsAt: DateFns.addSeconds(new Date, 1)
			}))

			var res = yield this.request("/initiatives")
			res.statusCode.must.equal(200)
			res.body.must.not.include(topic.id)
		})

		it("must not show private initiatives", function*() {
			var topic = yield createTopic(newTopic({
				creatorId: this.user.id,
				sourcePartnerId: this.partner.id,
				endsAt: DateFns.addSeconds(new Date, 1),
				visibility: "private"
			}))

			var res = yield this.request("/initiatives")
			res.statusCode.must.equal(200)
			res.body.must.not.include(topic.id)
		})

		it("must not show deleted initiatives", function*() {
			var topic = yield createTopic(newTopic({
				creatorId: this.user.id,
				sourcePartnerId: this.partner.id,
				endsAt: DateFns.addSeconds(new Date, 1),
				deletedAt: new Date
			}))

			var res = yield this.request("/initiatives")
			res.statusCode.must.equal(200)
			res.body.must.not.include(topic.id)
		})
	})
})
