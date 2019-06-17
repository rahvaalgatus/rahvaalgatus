var _ = require("root/lib/underscore")
var Config = require("root/config")
var DateFns = require("date-fns")
var ValidSubscription = require("root/test/valid_db_initiative_subscription")
var job = require("root/jobs/initiative_signature_milestones_job")
var newPartner = require("root/test/citizenos_fixtures").newPartner
var newUser = require("root/test/citizenos_fixtures").newUser
var newTopic = require("root/test/citizenos_fixtures").newTopic
var newVote = require("root/test/citizenos_fixtures").newVote
var newSignature = require("root/test/citizenos_fixtures").newSignature
var createPartner = require("root/test/citizenos_fixtures").createPartner
var createUser = require("root/test/citizenos_fixtures").createUser
var createTopic = require("root/test/citizenos_fixtures").createTopic
var createVote = require("root/test/citizenos_fixtures").createVote
var createOptions = require("root/test/citizenos_fixtures").createOptions
var createSignature = require("root/test/citizenos_fixtures").createSignature
var createSignatures = require("root/test/citizenos_fixtures").createSignatures
var db = require("root/db/initiatives_db")
var subscriptionsDb = require("root/db/initiative_subscriptions_db")
var messagesDb = require("root/db/initiative_messages_db")
var pseudoDateTime = require("root/lib/crypto").pseudoDateTime
var flatten = Function.apply.bind(Array.prototype.concat, Array.prototype)
var sql = require("sqlate")
var renderEmail = require("root/lib/i18n").email.bind(null, Config.language)
var t = require("root/lib/i18n").t.bind(null, Config.language)
var MILESTONES = _.sort(_.subtract, Config.signatureMilestones)

describe("InitiativeSignatureMilestonesJob", function() {
	require("root/test/mitm")()
	require("root/test/db")()
	require("root/test/email")()
	require("root/test/time")(new Date(2015, 5, 18, 13, 37, 42))

	beforeEach(function*() {
		this.user = yield createUser(newUser())
		this.partner = yield createPartner(newPartner({id: Config.apiPartnerId}))
	})

	it("must update milestones and notify once given an initiative in signing",
		function*() {
		var topic = yield createTopic(newTopic({
			creatorId: this.user.id,
			sourcePartnerId: this.partner.id,
			status: "voting"
		}))

		var vote = yield createVote(topic, newVote())
		var signatures = yield createSignatures(vote, Config.votesRequired + 5)
		var initiative = yield db.create({uuid: topic.id})

		var subscriptions = yield subscriptionsDb.create([
			new ValidSubscription({
				initiative_uuid: topic.id,
				confirmed_at: new Date,
				official_interest: false
			}),

			new ValidSubscription({
				initiative_uuid: null,
				confirmed_at: new Date,
				official_interest: false
			}),

			new ValidSubscription({
				initiative_uuid: topic.id,
				confirmed_at: new Date
			}),

			new ValidSubscription({
				initiative_uuid: null,
				confirmed_at: new Date
			})
		])

		yield job()

		yield db.search(sql`SELECT * FROM initiatives`).must.then.eql([{
			__proto__: initiative,

			signature_milestones: {
				5: signatures[4].createdAt,
				10: signatures[9].createdAt
			}
		}])

		var messages = yield messagesDb.search(sql`
			SELECT * FROM initiative_messages
		`)

		var message = messages[0]
		var emails = subscriptions.slice(2).map((s) => s.email).sort()

		messages.must.eql([{
			id: message.id,
			initiative_uuid: topic.id,
			created_at: new Date,
			updated_at: new Date,
			origin: "signature_milestone",

			title: t("EMAIL_SIGNATURE_MILESTONE_N_SUBJECT", {
				initiativeTitle: topic.title,
				milestone: 10
			}),

			text: renderEmail("EMAIL_SIGNATURE_MILESTONE_N_BODY", {
				initiativeTitle: topic.title,
				initiativeUrl: `${Config.url}/initiatives/${topic.id}`,
				milestone: 10
			}),

			sent_at: new Date,
			sent_to: emails
		}])

		this.emails.length.must.equal(1)
		this.emails[0].envelope.to.must.eql(emails)
		var msg = String(this.emails[0].message)
		msg.match(/^Subject: .*/m)[0].must.include(message.title)
	})

	it("must update milestones when not all milestones reached", function*() {
		var topic = yield createTopic(newTopic({
			creatorId: this.user.id,
			sourcePartnerId: this.partner.id,
			status: "voting"
		}))

		var vote = yield createVote(topic, newVote())
		var signatures = yield createSignatures(vote, Config.votesRequired - 1)
		var initiative = yield db.create({uuid: topic.id})

		yield subscriptionsDb.create([
			new ValidSubscription({
				initiative_uuid: topic.id,
				confirmed_at: new Date
			}),

			new ValidSubscription({
				initiative_uuid: null,
				confirmed_at: new Date
			})
		])

		yield job()

		yield db.search(sql`SELECT * FROM initiatives`).must.then.eql([{
			__proto__: initiative,
			signature_milestones: {5: signatures[4].createdAt}
		}])

		this.emails.length.must.equal(1)
	})

	it("must notify of milestones reached 24h ago", function*() {
		var topic = yield createTopic(newTopic({
			creatorId: this.user.id,
			sourcePartnerId: this.partner.id,
			status: "voting"
		}))

		var vote = yield createVote(topic, newVote())
		var yesAndNo = yield createOptions(vote)
		var users = yield _.times(5, _.compose(createUser, newUser))

		yield createSignature(users.map((user, i) => newSignature({
			userId: user.id,
			voteId: vote.id,
			optionId: yesAndNo[0],
			createdAt: DateFns.addHours(
				DateFns.addMinutes(new Date, -users.length + 1 + i),
				-24
			)
		})))

		yield subscriptionsDb.create([
			new ValidSubscription({
				initiative_uuid: topic.id,
				confirmed_at: new Date
			}),

			new ValidSubscription({
				initiative_uuid: null,
				confirmed_at: new Date
			})
		])

		yield job()
		this.emails.length.must.equal(1)
	})

	it("must not notify of milestones reached earlier than 24h", function*() {
		var topic = yield createTopic(newTopic({
			creatorId: this.user.id,
			sourcePartnerId: this.partner.id,
			status: "voting"
		}))

		var vote = yield createVote(topic, newVote())
		var yesAndNo = yield createOptions(vote)
		var users = yield _.times(5, _.compose(createUser, newUser))

		yield createSignature(users.map((user, i) => newSignature({
			userId: user.id,
			voteId: vote.id,
			optionId: yesAndNo[0],
			createdAt:
				DateFns.addHours(DateFns.addMinutes(new Date, -users.length + i), -24)
		})))

		yield subscriptionsDb.create([
			new ValidSubscription({
				initiative_uuid: topic.id,
				confirmed_at: new Date
			}),

			new ValidSubscription({
				initiative_uuid: null,
				confirmed_at: new Date
			})
		])

		yield job()
		this.emails.length.must.equal(0)
	})

	it("must update old milestones but not notify", function*() {
		var topic = yield createTopic(newTopic({
			creatorId: this.user.id,
			sourcePartnerId: this.partner.id,
			status: "voting"
		}))

		var vote = yield createVote(topic, newVote())
		var signatures = yield createSignatures(vote, 10)

		var initiative = yield db.create({
			uuid: topic.id,
			signature_milestones: {10: signatures[9].createdAt}
		})

		yield subscriptionsDb.create([
			new ValidSubscription({
				initiative_uuid: topic.id,
				confirmed_at: new Date
			}),

			new ValidSubscription({
				initiative_uuid: null,
				confirmed_at: new Date
			})
		])

		yield job()

		yield db.search(sql`SELECT * FROM initiatives`).must.then.eql([{
			__proto__: initiative,

			signature_milestones: {
				5: signatures[4].createdAt,
				10: signatures[9].createdAt
			}
		}])

		this.emails.length.must.equal(0)
	})

	;["followUp", "closed"].forEach(function(status) {
		it("must update milestones when initiative " + status, function*() {
			var topic = yield createTopic(newTopic({
				creatorId: this.user.id,
				sourcePartnerId: this.partner.id,
				status: status
			}))

			var vote = yield createVote(topic, newVote())
			var signatures = yield createSignatures(vote, 5)
			var initiative = yield db.create({uuid: topic.id})
			yield job()

			yield db.search(sql`SELECT * FROM initiatives`).must.then.eql([{
				__proto__: initiative,
				signature_milestones: {5: signatures[4].createdAt}
			}])
		})

		it("must not notify when initiative " + status, function*() {
			var topic = yield createTopic(newTopic({
				creatorId: this.user.id,
				sourcePartnerId: this.partner.id,
				status: status
			}))

			var vote = yield createVote(topic, newVote())
			yield createSignatures(vote, MILESTONES[0])

			yield subscriptionsDb.create([
				new ValidSubscription({
					initiative_uuid: topic.id,
					confirmed_at: new Date
				}),

				new ValidSubscription({
					initiative_uuid: null,
					confirmed_at: new Date
				})
			])

			yield job()
			this.emails.length.must.equal(0)
		})
	})

	it("must not update milestones when initiative deleted", function*() {
		var topic = yield createTopic(newTopic({
			creatorId: this.user.id,
			sourcePartnerId: this.partner.id,
			status: "voting",
			deletedAt: new Date
		}))

		var vote = yield createVote(topic, newVote())
		yield createSignatures(vote, Config.votesRequired)
		var initiative = yield db.create({uuid: topic.id})
		yield job()
		yield db.search(sql`SELECT * FROM initiatives`).must.then.eql([initiative])
	})

	_.each(Config.partners, function(partner, id) {
		if (id == Config.apiPartnerId) return

		it("must update milestones for " + partner.name + " initiative",
			function*() {
			var partner = yield createPartner(newPartner({id: id}))

			var topic = yield createTopic(newTopic({
				creatorId: this.user.id,
				sourcePartnerId: partner.id,
				status: "voting",
			}))

			var vote = yield createVote(topic, newVote())
			var signatures = yield createSignatures(vote, 5)
			var initiative = yield db.create({uuid: topic.id})
			yield job()


			yield db.search(sql`SELECT * FROM initiatives`).must.then.eql([{
				__proto__: initiative,
				signature_milestones: {5: signatures[4].createdAt}
			}])
		})
	})

	it("must not update milestones for other partner initiatives", function*() {
		var partner = yield createPartner(newPartner())

		var topic = yield createTopic(newTopic({
			creatorId: this.user.id,
			sourcePartnerId: partner.id,
			status: "voting"
		}))

		var vote = yield createVote(topic, newVote())
		yield createSignatures(vote, Config.votesRequired)
		var initiative = yield db.create({uuid: topic.id})
		yield job()
		yield db.search(sql`SELECT * FROM initiatives`).must.then.eql([initiative])
	})

	it("must not update already recorded milestones", function*() {
		var topic = yield createTopic(newTopic({
			creatorId: this.user.id,
			sourcePartnerId: this.partner.id,
			status: "voting"
		}))

		var vote = yield createVote(topic, newVote())
		var signatures = yield createSignatures(vote, Config.votesRequired)

		var initiative = yield db.create({
			uuid: topic.id,
			signature_milestones: {5: pseudoDateTime()}
		})

		yield job()

		yield db.search(sql`SELECT * FROM initiatives`).must.then.eql([{
			__proto__: initiative,

			signature_milestones: {
				5: initiative.signature_milestones[5],
				10: signatures[9].createdAt
			}
		}])
	})

	it("must not update initiative with no signatures", function*() {
		var topic = yield createTopic(newTopic({
			creatorId: this.user.id,
			sourcePartnerId: this.partner.id,
			status: "voting"
		}))

		yield createVote(topic, newVote())
		var initiative = yield db.create({uuid: topic.id})

		yield subscriptionsDb.create([
			new ValidSubscription({
				initiative_uuid: topic.id,
				confirmed_at: new Date
			}),

			new ValidSubscription({
				initiative_uuid: null,
				confirmed_at: new Date
			})
		])

		yield job()
		yield db.search(sql`SELECT * FROM initiatives`).must.then.eql([initiative])
		this.emails.length.must.equal(0)
	})

	it("must consider only Yes signatures", function*() {
		var topic = yield createTopic(newTopic({
			creatorId: this.user.id,
			sourcePartnerId: this.partner.id,
			status: "voting"
		}))

		var vote = yield createVote(topic, newVote())
		var yesAndNo = yield createOptions(vote)
		var users = yield _.times(14, _.compose(createUser, newUser))

		var signatures = yield createSignature(users.map((user, i) => newSignature({
			userId: user.id,
			voteId: vote.id,
			optionId: yesAndNo[i % 2],
			createdAt: DateFns.addMinutes(new Date, -users.length + i)
		})))

		var initiative = yield db.create({uuid: topic.id})
		yield job()

		yield db.search(sql`SELECT * FROM initiatives`).must.then.eql([{
			__proto__: initiative,
			signature_milestones: {5: signatures[8].createdAt}
		}])
	})

	it("must count the latest Yes signature", function*() {
		var topic = yield createTopic(newTopic({
			creatorId: this.user.id,
			sourcePartnerId: this.partner.id,
			status: "voting"
		}))

		var vote = yield createVote(topic, newVote())
		var yesAndNo = yield createOptions(vote)
		var users = yield _.times(14, _.compose(createUser, newUser))

		var signatures = yield createSignature(flatten(users.map((user, i) => [
			newSignature({
				userId: user.id,
				voteId: vote.id,
				optionId: yesAndNo[(i + 1) % 2],
				createdAt: DateFns.addMinutes(new Date, 2 * (-users.length + i))
			}),

			newSignature({
				userId: user.id,
				voteId: vote.id,
				optionId: yesAndNo[i % 2],
				createdAt: DateFns.addMinutes(new Date, 2 * (-users.length + i) + 1)
			})
		])))

		var initiative = yield db.create({uuid: topic.id})
		yield job()

		yield db.search(sql`SELECT * FROM initiatives`).must.then.eql([{
			__proto__: initiative,
			signature_milestones: {5: signatures[17].createdAt}
		}])
	})
})
