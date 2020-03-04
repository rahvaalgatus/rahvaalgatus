var _ = require("root/lib/underscore")
var Config = require("root/config")
var DateFns = require("date-fns")
var ValidInitiative = require("root/test/valid_db_initiative")
var ValidSubscription = require("root/test/valid_subscription")
var ValidSignature = require("root/test/valid_signature")
var cli = require("root/cli/initiative_signature_milestones_cli")
var newPartner = require("root/test/citizenos_fixtures").newPartner
var newTopic = require("root/test/citizenos_fixtures").newTopic
var newVote = require("root/test/citizenos_fixtures").newVote
var newSignature = require("root/test/citizenos_fixtures").newSignature
var createPartner = require("root/test/citizenos_fixtures").createPartner
var createUser = require("root/test/fixtures").createUser
var createCitizenUser = require("root/test/citizenos_fixtures").createUser
var newCitizenUser = require("root/test/citizenos_fixtures").newUser
var createTopic = require("root/test/citizenos_fixtures").createTopic
var createVote = require("root/test/citizenos_fixtures").createVote
var createOptions = require("root/test/citizenos_fixtures").createOptions
var createSignature = require("root/test/citizenos_fixtures").createSignature
var createSignatures = require("root/test/citizenos_fixtures").createSignatures
var db = require("root/db/initiatives_db")
var subscriptionsDb = require("root/db/initiative_subscriptions_db")
var messagesDb = require("root/db/initiative_messages_db")
var signaturesDb = require("root/db/initiative_signatures_db")
var pseudoDateTime = require("root/lib/crypto").pseudoDateTime
var flatten = Function.apply.bind(Array.prototype.concat, Array.prototype)
var sql = require("sqlate")
var renderEmail = require("root/lib/i18n").email.bind(null, Config.language)
var t = require("root/lib/i18n").t.bind(null, Config.language)
var MILESTONES = _.sort(_.subtract, Config.signatureMilestones)

var PHASE_TO_STATUS = {
	sign: "voting",
	parliament: "followUp",
	government: "followUp",
	done: "followUp"
}

describe("InitiativeSignatureMilestonesCli", function() {
	require("root/test/mitm")()
	require("root/test/db")()
	require("root/test/email")()
	require("root/test/time")(new Date(2015, 5, 18, 13, 37, 42))

	beforeEach(function*() {
		this.user = yield createUser()
		this.partner = yield createPartner(newPartner({id: Config.apiPartnerId}))
	})

	it("must update milestones and notify once given an initiative in signing",
		function*() {
		var initiative = yield db.create(new ValidInitiative({
			user_id: this.user.id,
			phase: "sign"
		}))

		var topic = yield createTopic(newTopic({
			id: initiative.uuid,
			creatorId: this.user.uuid,
			sourcePartnerId: this.partner.id,
			status: "voting"
		}))

		var vote = yield createVote(topic, newVote())
		var signatures = yield createSignatures(vote, Config.votesRequired + 5)

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

		yield cli()

		yield db.read(initiative).must.then.eql({
			__proto__: initiative,

			signature_milestones: {
				5: signatures[4].createdAt,
				10: signatures[9].createdAt
			}
		})

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

	it("must update milestones and notify once if some undersigned",
		function*() {
		var initiative = yield db.create(new ValidInitiative({
			user_id: this.user.id,
			phase: "sign"
		}))

		var topic = yield createTopic(newTopic({
			id: initiative.uuid,
			creatorId: this.user.uuid,
			sourcePartnerId: this.partner.id,
			status: "voting"
		}))

		var vote = yield createVote(topic, newVote())
		var half = Config.votesRequired / 2

		var citizenSignatures = yield createSignatures(vote, half)
		var lastCreatedAt = _.last(citizenSignatures).createdAt

		var signatures = yield signaturesDb.create(_.times(half + 5, (i) => (
			new ValidSignature({
				initiative_uuid: initiative.uuid,
				created_at: DateFns.addMinutes(lastCreatedAt, i + 1)
			})
		)))

		yield subscriptionsDb.create([
			new ValidSubscription({confirmed_at: new Date})
		])

		yield cli()

		yield db.read(initiative).must.then.eql({
			__proto__: initiative,

			signature_milestones: {
				5: citizenSignatures[4].createdAt,
				10: signatures[4].created_at
			}
		})

		this.emails.length.must.equal(1)
	})

	it("must update milestones when not all milestones reached", function*() {
		var initiative = yield db.create(new ValidInitiative({
			user_id: this.user.id,
			phase: "sign"
		}))

		var topic = yield createTopic(newTopic({
			id: initiative.uuid,
			creatorId: this.user.uuid,
			sourcePartnerId: this.partner.id,
			status: "voting"
		}))

		var vote = yield createVote(topic, newVote())
		var signatures = yield createSignatures(vote, Config.votesRequired - 1)

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

		yield cli()

		yield db.read(initiative).must.then.eql({
			__proto__: initiative,
			signature_milestones: {5: signatures[4].createdAt}
		})

		this.emails.length.must.equal(1)
	})

	it("must notify of milestones reached 24h ago", function*() {
		var initiative = yield db.create(new ValidInitiative({
			user_id: this.user.id,
			phase: "sign"
		}))

		var topic = yield createTopic(newTopic({
			id: initiative.uuid,
			creatorId: this.user.uuid,
			sourcePartnerId: this.partner.id,
			status: "voting"
		}))

		var vote = yield createVote(topic, newVote())
		var yesAndNo = yield createOptions(vote)
		var users = yield _.times(5, () => createUser())

		yield createSignature(users.map((user, i) => newSignature({
			userId: user.uuid,
			voteId: vote.id,
			optionId: yesAndNo[0],
			createdAt: DateFns.addHours(
				DateFns.addMinutes(new Date, -users.length + 1 + i),
				-24
			)
		})))

		yield subscriptionsDb.create([
			new ValidSubscription({
				initiative_uuid: initiative.uuid,
				confirmed_at: new Date
			}),

			new ValidSubscription({
				initiative_uuid: null,
				confirmed_at: new Date
			})
		])

		yield cli()
		this.emails.length.must.equal(1)
	})

	it("must not notify of milestones reached earlier than 24h", function*() {
		var initiative = yield db.create(new ValidInitiative({
			user_id: this.user.id,
			phase: "sign"
		}))

		var topic = yield createTopic(newTopic({
			id: initiative.uuid,
			creatorId: this.user.uuid,
			sourcePartnerId: this.partner.id,
			status: "voting"
		}))

		var vote = yield createVote(topic, newVote())
		var yesAndNo = yield createOptions(vote)
		var users = yield _.times(5, () => createUser())

		yield createSignature(users.map((user, i) => newSignature({
			userId: user.uuid,
			voteId: vote.id,
			optionId: yesAndNo[0],
			createdAt:
				DateFns.addHours(DateFns.addMinutes(new Date, -users.length + i), -24)
		})))

		yield subscriptionsDb.create([
			new ValidSubscription({
				initiative_uuid: initiative.uuid,
				confirmed_at: new Date
			}),

			new ValidSubscription({
				initiative_uuid: null,
				confirmed_at: new Date
			})
		])

		yield cli()
		this.emails.length.must.equal(0)
	})

	it("must update old milestones but not notify", function*() {
		var initiative = yield db.create(new ValidInitiative({
			user_id: this.user.id,
			phase: "sign",
		}))

		var topic = yield createTopic(newTopic({
			id: initiative.uuid,
			creatorId: this.user.uuid,
			sourcePartnerId: this.partner.id,
			status: "voting"
		}))

		var vote = yield createVote(topic, newVote())
		var signatures = yield createSignatures(vote, 10)

		yield db.update(initiative, {
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

		yield cli()

		yield db.read(initiative).must.then.eql({
			__proto__: initiative,

			signature_milestones: {
				5: signatures[4].createdAt,
				10: signatures[9].createdAt
			}
		})

		this.emails.length.must.equal(0)
	})

	;["parliament", "government", "done"].forEach(function(phase) {
		it(`must update milestones when initiative in ${phase} phase`, function*() {
			var initiative = yield db.create(new ValidInitiative({
				user_id: this.user.id,
				phase: phase,
			}))

			var topic = yield createTopic(newTopic({
				id: initiative.uuid,
				creatorId: this.user.uuid,
				sourcePartnerId: this.partner.id,
				status: PHASE_TO_STATUS[phase]
			}))

			var vote = yield createVote(topic, newVote())
			var signatures = yield createSignatures(vote, 5)
			yield cli()

			yield db.read(initiative).must.then.eql({
				__proto__: initiative,
				signature_milestones: {5: signatures[4].createdAt}
			})
		})

		it(`must not notify when initiative ${phase} phase`, function*() {
			var initiative = yield db.create(new ValidInitiative({
				user_id: this.user.id,
				phase: phase,
			}))

			var topic = yield createTopic(newTopic({
				id: initiative.uuid,
				creatorId: this.user.uuid,
				sourcePartnerId: this.partner.id,
				status: PHASE_TO_STATUS[phase]
			}))

			var vote = yield createVote(topic, newVote())
			yield createSignatures(vote, MILESTONES[0])

			yield subscriptionsDb.create([
				new ValidSubscription({
					initiative_uuid: initiative.uuid,
					confirmed_at: new Date
				}),

				new ValidSubscription({
					initiative_uuid: null,
					confirmed_at: new Date
				})
			])

			yield cli()
			this.emails.length.must.equal(0)
		})
	})

	it("must not update milestones when topic deleted", function*() {
		var initiative = yield db.create(new ValidInitiative({
			user_id: this.user.id,
			phase: "sign"
		}))

		var topic = yield createTopic(newTopic({
			id: initiative.uuid,
			creatorId: this.user.uuid,
			sourcePartnerId: this.partner.id,
			status: "voting",
			deletedAt: new Date
		}))

		var vote = yield createVote(topic, newVote())
		yield createSignatures(vote, Config.votesRequired)
		yield cli()
		yield db.read(initiative).must.then.eql(initiative)
	})

	_.each(Config.partners, function(partner, id) {
		if (id == Config.apiPartnerId) return

		it("must update milestones for " + partner.name + " initiative",
			function*() {
			var partner = yield createPartner(newPartner({id: id}))

			var initiative = yield db.create(new ValidInitiative({
				user_id: this.user.id,
				phase: "sign"
			}))

			var topic = yield createTopic(newTopic({
				id: initiative.uuid,
				creatorId: this.user.uuid,
				sourcePartnerId: partner.id,
				status: "voting",
			}))

			var vote = yield createVote(topic, newVote())
			var signatures = yield createSignatures(vote, 5)
			yield cli()

			yield db.read(initiative).must.then.eql({
				__proto__: initiative,
				signature_milestones: {5: signatures[4].createdAt}
			})
		})
	})

	it("must not update milestones for other partner initiatives", function*() {
		var partner = yield createPartner(newPartner())

		var initiative = yield db.create(new ValidInitiative({
			user_id: this.user.id,
			phase: "sign"
		}))

		var topic = yield createTopic(newTopic({
			id: initiative.uuid,
			creatorId: this.user.uuid,
			sourcePartnerId: partner.id,
			status: "voting"
		}))

		var vote = yield createVote(topic, newVote())
		yield createSignatures(vote, Config.votesRequired)
		yield cli()
		yield db.read(initiative).must.then.eql(initiative)
	})

	it("must not update already recorded milestones", function*() {
		var initiative = yield db.create(new ValidInitiative({
			user_id: this.user.id,
			phase: "sign",
			signature_milestones: {5: pseudoDateTime()}
		}))

		var topic = yield createTopic(newTopic({
			id: initiative.uuid,
			creatorId: this.user.uuid,
			sourcePartnerId: this.partner.id,
			status: "voting"
		}))

		var vote = yield createVote(topic, newVote())
		var signatures = yield createSignatures(vote, Config.votesRequired)
		yield cli()

		yield db.read(initiative).must.then.eql({
			__proto__: initiative,

			signature_milestones: {
				5: initiative.signature_milestones[5],
				10: signatures[9].createdAt
			}
		})
	})

	it("must not update initiative with no signatures", function*() {
		var initiative = yield db.create(new ValidInitiative({
			user_id: this.user.id,
			phase: "sign",
		}))

		var topic = yield createTopic(newTopic({
			id: initiative.uuid,
			creatorId: this.user.uuid,
			sourcePartnerId: this.partner.id,
			status: "voting"
		}))

		yield createVote(topic, newVote())

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

		yield cli()
		yield db.read(initiative).must.then.eql(initiative)
		this.emails.length.must.equal(0)
	})

	it("must consider only Yes signatures", function*() {
		var initiative = yield db.create(new ValidInitiative({
			user_id: this.user.id,
			phase: "sign",
		}))

		var topic = yield createTopic(newTopic({
			id: initiative.uuid,
			creatorId: this.user.uuid,
			sourcePartnerId: this.partner.id,
			status: "voting"
		}))

		var vote = yield createVote(topic, newVote())
		var yesAndNo = yield createOptions(vote)
		var users = yield _.times(14, () => createUser())

		var signatures = yield createSignature(users.map((user, i) => newSignature({
			userId: user.uuid,
			voteId: vote.id,
			optionId: yesAndNo[i % 2],
			createdAt: DateFns.addMinutes(new Date, -users.length + i)
		})))

		yield cli()

		yield db.read(initiative).must.then.eql({
			__proto__: initiative,
			signature_milestones: {5: signatures[8].createdAt}
		})
	})

	it("must count the latest Yes signature", function*() {
		var initiative = yield db.create(new ValidInitiative({
			user_id: this.user.id,
			phase: "sign",
		}))

		var topic = yield createTopic(newTopic({
			id: initiative.uuid,
			creatorId: this.user.uuid,
			sourcePartnerId: this.partner.id,
			status: "voting"
		}))

		var vote = yield createVote(topic, newVote())
		var yesAndNo = yield createOptions(vote)
		var users = yield _.times(14, () => createUser())

		var signatures = yield createSignature(flatten(users.map((user, i) => [
			newSignature({
				userId: user.uuid,
				voteId: vote.id,
				optionId: yesAndNo[(i + 1) % 2],
				createdAt: DateFns.addMinutes(new Date, 2 * (-users.length + i))
			}),

			newSignature({
				userId: user.uuid,
				voteId: vote.id,
				optionId: yesAndNo[i % 2],
				createdAt: DateFns.addMinutes(new Date, 2 * (-users.length + i) + 1)
			})
		])))

		yield cli()

		yield db.read(initiative).must.then.eql({
			__proto__: initiative,
			signature_milestones: {5: signatures[17].createdAt}
		})
	})

	it("must count signatures by initiative", function*() {
		var self = this

		yield _.times(3, function*(i) {
			var initiative = yield db.create(new ValidInitiative({
				user_id: self.user.id,
				phase: "sign"
			}))

			var topic = yield createTopic(newTopic({
				id: initiative.uuid,
				creatorId: self.user.uuid,
				sourcePartnerId: self.partner.id,
				status: "voting"
			}))

			var vote = yield createVote(topic, newVote())
			var yesAndNo = yield createOptions(vote)
			var users = yield _.times(3, _.compose(createCitizenUser, newCitizenUser))

			yield createSignature(users.map((user, j) => newSignature({
				userId: user.id,
				voteId: vote.id,
				optionId: yesAndNo[0],
				createdAt: DateFns.addMinutes(DateFns.addSeconds(new Date, j), i)
			})))

			yield signaturesDb.create(_.times(2, (j) => (
				new ValidSignature({
					initiative_uuid: initiative.uuid,
					created_at: DateFns.addHours(
						DateFns.addMinutes(DateFns.addSeconds(new Date, j), i),
						1
					)
				})
			)))
		})

		yield subscriptionsDb.create([
			new ValidSubscription({confirmed_at: new Date})
		])

		yield cli()

		var initiatives = yield db.search(sql`SELECT * FROM initiatives`)
		initiatives.forEach(function(initiative, i) {
			initiative.signature_milestones.must.eql({
				5: DateFns.addHours(
					DateFns.addMinutes(DateFns.addSeconds(new Date, 1), i),
					1
				)
			})
		})

		this.emails.length.must.equal(3)
	})
})
