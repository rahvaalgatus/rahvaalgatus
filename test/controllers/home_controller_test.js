var _ = require("root/lib/underscore")
var Config = require("root/config")
var DateFns = require("date-fns")
var ValidInitiative = require("root/test/valid_db_initiative")
var newPartner = require("root/test/citizenos_fixtures").newPartner
var newUser = require("root/test/citizenos_fixtures").newUser
var newTopic = require("root/test/citizenos_fixtures").newTopic
var newVote = require("root/test/citizenos_fixtures").newVote
var createPartner = require("root/test/citizenos_fixtures").createPartner
var createUser = require("root/test/citizenos_fixtures").createUser
var createTopic = require("root/test/citizenos_fixtures").createTopic
var createVote = require("root/test/citizenos_fixtures").createVote
var createSignatures = require("root/test/citizenos_fixtures").createSignatures
var initiativesDb = require("root/db/initiatives_db")

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

		it("must show initiatives in edit phase", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				phase: "edit"
			}))

			yield createTopic(newTopic({
				id: initiative.uuid,
				creatorId: this.user.id,
				sourcePartnerId: this.partner.id,
				endsAt: DateFns.addSeconds(new Date, 1),
				visibility: "public"
			}))

			var res = yield this.request("/")
			res.statusCode.must.equal(200)
			res.body.must.include(initiative.uuid)
		})

		it("must show initiatives in edit phase that have ended less than 2w ago",
			function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				phase: "edit"
			}))

			yield createTopic(newTopic({
				id: initiative.uuid,
				creatorId: this.user.id,
				sourcePartnerId: this.partner.id,
				visibility: "public",
				endsAt: DateFns.addDays(DateFns.startOfDay(new Date), -13)
			}))

			var res = yield this.request("/")
			res.statusCode.must.equal(200)
			res.body.must.include(initiative.uuid)
		})

		it("must not show initiatives in edit phase that have ended", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				phase: "edit"
			}))

			yield createTopic(newTopic({
				id: initiative.uuid,
				creatorId: this.user.id,
				sourcePartnerId: this.partner.id,
				visibility: "public",
				endsAt: DateFns.addDays(DateFns.startOfDay(new Date), -14)
			}))

			var res = yield this.request("/")
			res.statusCode.must.equal(200)
			res.body.must.not.include(initiative.uuid)
		})

		it("must not show archived initiatives in edit phase", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				phase: "edit",
				archived_at: new Date
			}))

			yield createTopic(newTopic({
				id: initiative.uuid,
				creatorId: this.user.id,
				sourcePartnerId: this.partner.id,
				visibility: "public",
				endsAt: DateFns.addSeconds(new Date, 1)
			}))

			var res = yield this.request("/")
			res.statusCode.must.equal(200)
			res.body.must.not.include(initiative.uuid)
		})

		it("must show initiatives in sign phase", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				phase: "sign"
			}))

			var topic = yield createTopic(newTopic({
				id: initiative.uuid,
				creatorId: this.user.id,
				sourcePartnerId: this.partner.id,
				status: "voting"
			}))

			yield createVote(topic, newVote({
				endsAt: DateFns.addSeconds(new Date, 1)
			}))

			var res = yield this.request("/")
			res.statusCode.must.equal(200)
			res.body.must.include(initiative.uuid)
		})

		it("must show initiatives in sign phase that failed in less than 2w",
			function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				phase: "sign"
			}))

			var topic = yield createTopic(newTopic({
				id: initiative.uuid,
				creatorId: this.user.id,
				sourcePartnerId: this.partner.id,
				status: "voting"
			}))

			yield createVote(topic, newVote({
				endsAt: DateFns.addDays(DateFns.startOfDay(new Date), -13)
			}))

			var res = yield this.request("/")
			res.statusCode.must.equal(200)
			res.body.must.include(initiative.uuid)
		})

		it("must not show initiatives in sign phase that failed", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				phase: "sign"
			}))

			var topic = yield createTopic(newTopic({
				id: initiative.uuid,
				creatorId: this.user.id,
				sourcePartnerId: this.partner.id,
				status: "voting"
			}))

			yield createVote(topic, newVote({
				endsAt: DateFns.addDays(DateFns.startOfDay(new Date), -14)
			}))

			var res = yield this.request("/")
			res.statusCode.must.equal(200)
			res.body.must.not.include(initiative.uuid)
		})

		it("must show initiatives in sign phase that succeeded", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				phase: "sign"
			}))

			var topic = yield createTopic(newTopic({
				id: initiative.uuid,
				creatorId: this.user.id,
				sourcePartnerId: this.partner.id,
				status: "voting"
			}))

			var vote = yield createVote(topic, newVote({
				endsAt: DateFns.addDays(DateFns.startOfDay(new Date), -14)
			}))

			yield createSignatures(vote, Config.votesRequired)

			var res = yield this.request("/")
			res.statusCode.must.equal(200)
			res.body.must.include(initiative.uuid)
		})

		it("must show initiatives in parliament phase", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				phase: "parliament"
			}))

			var topic = yield createTopic(newTopic({
				id: initiative.uuid,
				creatorId: this.user.id,
				sourcePartnerId: this.partner.id,
				status: "followUp"
			}))

			yield createVote(topic, newVote())

			var res = yield this.request("/")
			res.statusCode.must.equal(200)
			res.body.must.include(initiative.uuid)
		})

		it("must show external initiatives in parliament phase", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				phase: "parliament",
				external: true
			}))

			var res = yield this.request("/")
			res.statusCode.must.equal(200)
			res.body.must.include(initiative.uuid)
		})

		it("must show initiatives in government phase", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				phase: "government"
			}))

			var topic = yield createTopic(newTopic({
				id: initiative.uuid,
				creatorId: this.user.id,
				sourcePartnerId: this.partner.id,
				status: "followUp"
			}))

			yield createVote(topic, newVote())

			var res = yield this.request("/")
			res.statusCode.must.equal(200)
			res.body.must.include(initiative.uuid)
		})

		it("must show external initiatives in government phase", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				phase: "government",
				external: true
			}))

			var res = yield this.request("/")
			res.statusCode.must.equal(200)
			res.body.must.include(initiative.uuid)
		})

		it("must show initiatives in done phase", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				phase: "done"
			}))

			var topic = yield createTopic(newTopic({
				id: initiative.uuid,
				creatorId: this.user.id,
				sourcePartnerId: this.partner.id,
				status: "followUp"
			}))

			yield createVote(topic, newVote())

			var res = yield this.request("/")
			res.statusCode.must.equal(200)
			res.body.must.include(initiative.uuid)
		})

		it("must show external initiatives in done phase", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				phase: "done",
				external: true
			}))

			var res = yield this.request("/")
			res.statusCode.must.equal(200)
			res.body.must.include(initiative.uuid)
		})

		it("must not show archived external initiatives in done phase",
			function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative({
				phase: "done",
				external: true,
				archived_at: new Date
			}))

			var res = yield this.request("/")
			res.statusCode.must.equal(200)
			res.body.must.not.include(initiative.uuid)
		})

		_.each(Config.partners, function(partner, id) {
			if (id == Config.apiPartnerId) return

			describe("given " + partner.name, function() {
				it("must show initiatives", function*() {
					var initiative = yield initiativesDb.create(new ValidInitiative)
					var partner = yield createPartner(newPartner({id: id}))

					var topic = yield createTopic(newTopic({
						id: initiative.uuid,
						creatorId: this.user.id,
						sourcePartnerId: partner.id,
						visibility: "public",
						endsAt: DateFns.addSeconds(new Date, 1)
					}))

					var res = yield this.request("/")
					res.statusCode.must.equal(200)
					res.body.must.include(topic.id)
				})
			})
		})

		it("must not show initiatives from other partners", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative)
			var partner = yield createPartner(newPartner())

			var topic = yield createTopic(newTopic({
				id: initiative.uuid,
				creatorId: this.user.id,
				sourcePartnerId: partner.id,
				visibility: "public",
				endsAt: DateFns.addSeconds(new Date, 1)
			}))

			var res = yield this.request("/")
			res.statusCode.must.equal(200)
			res.body.must.not.include(topic.id)
		})

		it("must not show private initiatives", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative)

			var topic = yield createTopic(newTopic({
				id: initiative.uuid,
				creatorId: this.user.id,
				sourcePartnerId: this.partner.id,
				endsAt: DateFns.addSeconds(new Date, 1),
				visibility: "private"
			}))

			var res = yield this.request("/")
			res.statusCode.must.equal(200)
			res.body.must.not.include(topic.id)
		})

		it("must not show deleted initiatives", function*() {
			var initiative = yield initiativesDb.create(new ValidInitiative)

			var topic = yield createTopic(newTopic({
				id: initiative.uuid,
				creatorId: this.user.id,
				sourcePartnerId: this.partner.id,
				visibility: "public",
				endsAt: DateFns.addSeconds(new Date, 1),
				deletedAt: new Date
			}))

			var res = yield this.request("/")
			res.statusCode.must.equal(200)
			res.body.must.not.include(topic.id)
		})
	})
})
