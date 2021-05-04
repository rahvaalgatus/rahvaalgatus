var _ = require("root/lib/underscore")
var Config = require("root/config")
var DateFns = require("date-fns")
var ValidInitiative = require("root/test/valid_db_initiative")
var ValidSubscription = require("root/test/valid_subscription")
var ValidSignature = require("root/test/valid_signature")
var ValidCitizenosSignature = require("root/test/valid_citizenos_signature")
var ValidUser = require("root/test/valid_user")
var cli = require("root/cli/initiative_signature_milestones_cli")
var db = require("root/db/initiatives_db")
var usersDb = require("root/db/users_db")
var subscriptionsDb = require("root/db/initiative_subscriptions_db")
var messagesDb = require("root/db/initiative_messages_db")
var signaturesDb = require("root/db/initiative_signatures_db")
var citizenosSignaturesDb =
	require("root/db/initiative_citizenos_signatures_db")
var pseudoDateTime = require("root/lib/crypto").pseudoDateTime
var sql = require("sqlate")
var renderEmail = require("root/lib/i18n").email.bind(null, Config.language)
var t = require("root/lib/i18n").t.bind(null, Config.language)
var MILESTONES = _.sort(_.subtract, Config.signatureMilestones)
var LOCAL_GOVERNMENTS = require("root/lib/local_governments")

describe("InitiativeSignatureMilestonesCli", function() {
	require("root/test/mitm")()
	require("root/test/db")()
	require("root/test/email")()
	require("root/test/time")(new Date(2015, 5, 18, 13, 37, 42))

	beforeEach(function*() {
		this.user = yield usersDb.create(new ValidUser)
	})

	it("must update milestones and notify once given an initiative in signing",
		function*() {
		var initiative = yield db.create(new ValidInitiative({
			user_id: this.user.id,
			phase: "sign"
		}))

		var signatures = yield createSignatures(7, new Date, initiative)

		var subscriptions = yield subscriptionsDb.create([
			new ValidSubscription({
				initiative_uuid: initiative.uuid,
				confirmed_at: new Date,
				event_interest: false
			}),

			new ValidSubscription({
				initiative_uuid: null,
				confirmed_at: new Date,
				event_interest: false
			}),

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

		yield db.read(initiative).must.then.eql({
			__proto__: initiative,
			signature_milestones: {5: signatures[4].created_at}
		})

		var messages = yield messagesDb.search(sql`
			SELECT * FROM initiative_messages
		`)

		var message = messages[0]
		var emails = subscriptions.slice(2).map((s) => s.email).sort()

		messages.must.eql([{
			id: message.id,
			initiative_uuid: initiative.uuid,
			created_at: new Date,
			updated_at: new Date,
			origin: "signature_milestone",

			title: t("EMAIL_SIGNATURE_MILESTONE_N_SUBJECT", {
				initiativeTitle: initiative.title,
				milestone: 5
			}),

			text: renderEmail("EMAIL_SIGNATURE_MILESTONE_N_BODY", {
				initiativeTitle: initiative.title,
				initiativeUrl: `${Config.url}/initiatives/${initiative.uuid}`,
				milestone: 5
			}),

			sent_at: new Date,
			sent_to: emails
		}])

		this.emails.length.must.equal(1)
		this.emails[0].envelope.to.must.eql(emails)
		this.emails[0].headers.subject.must.equal(message.title)
	})

	describe("when destined for parliament", function() {
		it("must update milestones and notify if successful", function*() {
			var initiative = yield db.create(new ValidInitiative({
				user_id: this.user.id,
				phase: "sign"
			}))

			var milestone = Config.votesRequired

			var signatures = yield createSignatures(
				milestone + 2,
				new Date,
				initiative
			)

			var subscription = yield subscriptionsDb.create(new ValidSubscription({
				initiative_uuid: initiative.uuid,
				confirmed_at: new Date
			}))

			yield cli()

			yield db.read(initiative).must.then.eql({
				__proto__: initiative,

				signature_milestones: {
					5: signatures[4].created_at,
					[milestone]: signatures[milestone - 1].created_at
				}
			})

			var messages = yield messagesDb.search(sql`
				SELECT * FROM initiative_messages
			`)

			var message = messages[0]

			messages.must.eql([{
				id: message.id,
				initiative_uuid: initiative.uuid,
				created_at: new Date,
				updated_at: new Date,
				origin: "signature_milestone",

				title: t("EMAIL_SIGNATURES_COLLECTED_SUBJECT", {
					initiativeTitle: initiative.title,
					milestone: milestone
				}),

				text: renderEmail("EMAIL_SIGNATURES_COLLECTED_BODY", {
					initiativeTitle: initiative.title,
					initiativeUrl: `${Config.url}/initiatives/${initiative.uuid}`,
					milestone: milestone
				}),

				sent_at: new Date,
				sent_to: [subscription.email]
			}])

			this.emails.length.must.equal(1)
			this.emails[0].envelope.to.must.eql([subscription.email])
			this.emails[0].headers.subject.must.equal(message.title)
		})
	})

	describe("when destined for local", function() {
		it("must update milestones and notify if successful", function*() {
			var initiative = yield db.create(new ValidInitiative({
				user_id: this.user.id,
				destination: "muhu-vald",
				phase: "sign"
			}))

			var milestone = Math.round(
				LOCAL_GOVERNMENTS["muhu-vald"].population * 0.01
			)

			var signatures = yield createSignatures(
				milestone + 2,
				new Date,
				initiative
			)

			var subscription = yield subscriptionsDb.create(new ValidSubscription({
				initiative_uuid: initiative.uuid,
				confirmed_at: new Date
			}))

			yield cli()

			yield db.read(initiative).must.then.eql({
				__proto__: initiative,

				signature_milestones: {
					5: signatures[4].created_at,
					[milestone]: signatures[milestone - 1].created_at
				}
			})

			var messages = yield messagesDb.search(sql`
				SELECT * FROM initiative_messages
			`)

			var message = messages[0]

			messages.must.eql([{
				id: message.id,
				initiative_uuid: initiative.uuid,
				created_at: new Date,
				updated_at: new Date,
				origin: "signature_milestone",

				title: t("EMAIL_SIGNATURES_COLLECTED_SUBJECT", {
					initiativeTitle: initiative.title,
					milestone: milestone
				}),

				text: renderEmail("EMAIL_SIGNATURES_COLLECTED_BODY", {
					initiativeTitle: initiative.title,
					initiativeUrl: `${Config.url}/initiatives/${initiative.uuid}`,
					milestone: milestone
				}),

				sent_at: new Date,
				sent_to: [subscription.email]
			}])

			this.emails.length.must.equal(1)
			this.emails[0].envelope.to.must.eql([subscription.email])
			this.emails[0].headers.subject.must.equal(message.title)
		})
	})

	it("must update milestones when not all milestones reached", function*() {
		var initiative = yield db.create(new ValidInitiative({
			user_id: this.user.id,
			phase: "sign"
		}))

		var signatures = yield createSignatures(9, new Date, initiative)

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

		yield db.read(initiative).must.then.eql({
			__proto__: initiative,
			signature_milestones: {5: signatures[4].created_at}
		})

		this.emails.length.must.equal(1)
	})

	it("must notify of milestones reached 24h ago", function*() {
		var initiative = yield db.create(new ValidInitiative({
			user_id: this.user.id,
			phase: "sign"
		}))

		yield createSignatures(
			5,
			DateFns.addMinutes(DateFns.addHours(new Date, -24), -5 + 1),
			initiative
		)

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

		yield createSignatures(
			5,
			DateFns.addMinutes(DateFns.addHours(new Date, -24), -5),
			initiative
		)

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

		var signatures = yield createSignatures(10, new Date, initiative)

		yield db.update(initiative, {
			signature_milestones: {10: signatures[9].created_at}
		})

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

		yield db.read(initiative).must.then.eql({
			__proto__: initiative,

			signature_milestones: {
				5: signatures[4].created_at,
				10: signatures[9].created_at
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

			var signatures = yield createSignatures(5, new Date, initiative)
			yield cli()

			yield db.read(initiative).must.then.eql({
				__proto__: initiative,
				signature_milestones: {5: signatures[4].created_at}
			})
		})

		it(`must not notify when initiative ${phase} phase`, function*() {
			var initiative = yield db.create(new ValidInitiative({
				user_id: this.user.id,
				phase: phase,
			}))

			yield createSignatures(MILESTONES[0], new Date, initiative)

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

	it("must not update already recorded milestones", function*() {
		var initiative = yield db.create(new ValidInitiative({
			user_id: this.user.id,
			phase: "sign",
			signature_milestones: {5: pseudoDateTime()}
		}))

		var signatures = yield createSignatures(10, new Date, initiative)
		yield cli()

		yield db.read(initiative).must.then.eql({
			__proto__: initiative,

			signature_milestones: {
				5: initiative.signature_milestones[5],
				10: signatures[9].created_at
			}
		})
	})

	it("must not update initiative with no signatures", function*() {
		var initiative = yield db.create(new ValidInitiative({
			user_id: this.user.id,
			phase: "sign",
		}))

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
		yield db.read(initiative).must.then.eql(initiative)
		this.emails.length.must.equal(0)
	})

	it("must count signatures by initiative", function*() {
		var self = this

		yield _.times(3, function*(i) {
			var initiative = yield db.create(new ValidInitiative({
				user_id: self.user.id,
				phase: "sign"
			}))

			yield createSignatures(5, DateFns.addHours(new Date, i), initiative)
		})

		yield subscriptionsDb.create([
			new ValidSubscription({confirmed_at: new Date})
		])

		yield cli()

		var initiatives = yield db.search(sql`SELECT * FROM initiatives`)
		initiatives.forEach(function(initiative, i) {
			initiative.signature_milestones.must.eql({
				5: DateFns.addHours(DateFns.addMinutes(new Date, 4), i)
			})
		})

		this.emails.length.must.equal(3)
	})
})

function createSignatures(n, at, initiative) {
	return _.times(n, (i) => i % 2 == 0
		? citizenosSignaturesDb.create(new ValidCitizenosSignature({
			initiative_uuid: initiative.uuid,
			created_at: DateFns.addMinutes(at, i)
		}))
		: signaturesDb.create(new ValidSignature({
			initiative_uuid: initiative.uuid,
			created_at: DateFns.addMinutes(at, i)
		}))
	)
}
