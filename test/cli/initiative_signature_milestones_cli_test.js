var _ = require("root/lib/underscore")
var Config = require("root").config
var DateFns = require("date-fns")
var ValidInitiative = require("root/test/valid_initiative")
var ValidSubscription = require("root/test/valid_subscription")
var ValidSignature = require("root/test/valid_signature")
var ValidCitizenosSignature = require("root/test/valid_citizenos_signature")
var ValidUser = require("root/test/valid_user")
var cli = require("root/cli/initiative_signature_milestones_cli")
var initiativesDb = require("root/db/initiatives_db")
var usersDb = require("root/db/users_db")
var subscriptionsDb = require("root/db/initiative_subscriptions_db")
var messagesDb = require("root/db/initiative_messages_db")
var signaturesDb = require("root/db/initiative_signatures_db")
var citizenosSignaturesDb =
	require("root/db/initiative_citizenos_signatures_db")
var {pseudoDateTime} = require("root/lib/crypto")
var sql = require("sqlate")
var renderEmail = require("root/lib/i18n").email.bind(null, Config.language)
var t = require("root/lib/i18n").t.bind(null, Config.language)
var MILESTONES = _.sort(_.subtract, Config.signatureMilestones)
var LOCAL_GOVERNMENTS = require("root/lib/local_governments")

describe("InitiativeSignatureMilestonesCli", function() {
	require("root/test/db")()
	require("root/test/email")()
	require("root/test/time")(new Date(2015, 5, 18, 13, 37, 42))

	beforeEach(function() { this.user = usersDb.create(new ValidUser) })

	it("must update milestones when threshold not passed and notify once given an initiative in signing",
		function*() {
		var initiative = initiativesDb.create(new ValidInitiative({
			user_id: this.user.id,
			destination: "parliament",
			phase: "sign"
		}))

		var signatures = createSignatures(7, new Date, initiative)

		subscriptionsDb.create([
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
				initiative_destination: "tallinn",
				confirmed_at: new Date,
				event_interest: true
			}),
		])

		var subscriptions = subscriptionsDb.create([
			new ValidSubscription({
				initiative_uuid: initiative.uuid,
				confirmed_at: new Date,
				event_interest: true
			}),

			new ValidSubscription({
				initiative_uuid: null,
				confirmed_at: new Date,
				event_interest: true
			}),

			new ValidSubscription({
				initiative_destination: initiative.destination,
				confirmed_at: new Date,
				event_interest: true
			})
		])

		yield cli()

		initiativesDb.read(initiative).must.eql({
			__proto__: initiative,
			last_signature_created_at: findLastUndersigned(signatures).created_at,
			signature_milestones: {5: signatures[4].created_at}
		})

		var messages = messagesDb.search(sql`
			SELECT * FROM initiative_messages
		`)

		var message = messages[0]
		var emails = subscriptions.map((s) => s.email).sort()

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
		it("must update milestones when threshold passed and notify if successful",
			function*() {
			var initiative = initiativesDb.create(new ValidInitiative({
				user_id: this.user.id,
				phase: "sign"
			}))

			var milestone = Config.votesRequired

			var signatures = createSignatures(
				milestone + 2,
				new Date,
				initiative
			)

			subscriptionsDb.create([
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
					initiative_destination: "tallinn",
					confirmed_at: new Date,
					event_interest: true
				}),
			])

			var subscriptions = subscriptionsDb.create([
				new ValidSubscription({
					initiative_uuid: initiative.uuid,
					confirmed_at: new Date,
					event_interest: true
				}),

				new ValidSubscription({
					initiative_uuid: null,
					confirmed_at: new Date,
					event_interest: true
				}),

				new ValidSubscription({
					initiative_destination: initiative.destination,
					confirmed_at: new Date,
					event_interest: true
				})
			])

			yield cli()

			initiativesDb.read(initiative).must.eql({
				__proto__: initiative,
				last_signature_created_at: findLastUndersigned(signatures).created_at,

				signature_milestones: {
					5: signatures[4].created_at,
					[milestone]: signatures[milestone - 1].created_at
				}
			})

			var messages = messagesDb.search(sql`
				SELECT * FROM initiative_messages
			`)

			var message = messages[0]
			var emails = subscriptions.map((s) => s.email).sort()

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
				sent_to: emails
			}])

			this.emails.length.must.equal(1)
			this.emails[0].envelope.to.must.eql(emails)
			this.emails[0].headers.subject.must.equal(message.title)
		})

		it("must not use saved signature threshold in sign phase", function*() {
			var initiative = initiativesDb.create(new ValidInitiative({
				user_id: this.user.id,
				phase: "sign",
				signature_threshold: Config.votesRequired - 1,
				signature_threshold_at: new Date
			}))

			var signatures = createSignatures(10, new Date, initiative)
			yield cli()

			initiativesDb.read(initiative).must.eql({
				__proto__: initiative,
				last_signature_created_at: findLastUndersigned(signatures).created_at,

				signature_milestones: {
					5: signatures[4].created_at,
					[Config.votesRequired]: signatures[9].created_at
				}
			})
		})

		it("must use saved signature threshold in sign phase if signing expired",
			function*() {
			var signatureThreshold = Config.votesRequired + 1

			var initiative = initiativesDb.create(new ValidInitiative({
				user_id: this.user.id,
				phase: "sign",
				signing_expired_at: new Date,
				signature_threshold: signatureThreshold,
				signature_threshold_at: new Date
			}))

			var signatures = createSignatures(
				signatureThreshold + 1,
				new Date,
				initiative
			)

			yield cli()

			initiativesDb.read(initiative).must.eql({
				__proto__: initiative,
				last_signature_created_at: findLastUndersigned(signatures).created_at,

				signature_milestones: {
					5: signatures[4].created_at,
					[signatureThreshold]: signatures[signatureThreshold - 1].created_at
				}
			})
		})
	})

	describe("when destined for local", function() {
		it("must update milestones when threshold passed and notify if successful",
			function*() {
			var initiative = initiativesDb.create(new ValidInitiative({
				user_id: this.user.id,
				destination: "muhu-vald",
				phase: "sign"
			}))

			var {signatureThreshold} = LOCAL_GOVERNMENTS["muhu-vald"]

			var signatures = createSignatures(
				signatureThreshold + 2,
				new Date,
				initiative
			)

			subscriptionsDb.create([
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
					initiative_destination: "parliament",
					confirmed_at: new Date,
					event_interest: true
				}),
			])

			var subscriptions = subscriptionsDb.create([
				new ValidSubscription({
					initiative_uuid: initiative.uuid,
					confirmed_at: new Date,
					event_interest: true
				}),

				new ValidSubscription({
					initiative_uuid: null,
					confirmed_at: new Date,
					event_interest: true
				}),

				new ValidSubscription({
					initiative_destination: initiative.destination,
					confirmed_at: new Date,
					event_interest: true
				})
			])

			yield cli()

			initiativesDb.read(initiative).must.eql({
				__proto__: initiative,
				last_signature_created_at: findLastUndersigned(signatures).created_at,

				signature_milestones: {
					5: signatures[4].created_at,
					[signatureThreshold]: signatures[signatureThreshold - 1].created_at
				}
			})

			var messages = messagesDb.search(sql`
				SELECT * FROM initiative_messages
			`)

			var message = messages[0]
			var emails = subscriptions.map((s) => s.email).sort()

			messages.must.eql([{
				id: message.id,
				initiative_uuid: initiative.uuid,
				created_at: new Date,
				updated_at: new Date,
				origin: "signature_milestone",

				title: t("EMAIL_SIGNATURES_COLLECTED_SUBJECT", {
					initiativeTitle: initiative.title,
					milestone: signatureThreshold
				}),

				text: renderEmail("EMAIL_SIGNATURES_COLLECTED_BODY", {
					initiativeTitle: initiative.title,
					initiativeUrl: `${Config.url}/initiatives/${initiative.uuid}`,
					milestone: signatureThreshold
				}),

				sent_at: new Date,
				sent_to: emails
			}])

			this.emails.length.must.equal(1)
			this.emails[0].envelope.to.must.eql(emails)
			this.emails[0].headers.subject.must.equal(message.title)
		})

		it("must not use saved signature threshold in sign phase", function*() {
			var {signatureThreshold} = LOCAL_GOVERNMENTS["muhu-vald"]

			var initiative = initiativesDb.create(new ValidInitiative({
				user_id: this.user.id,
				destination: "muhu-vald",
				phase: "sign",
				signature_threshold: signatureThreshold - 1,
				signature_threshold_at: new Date
			}))

			var signatures = createSignatures(
				signatureThreshold + 1,
				new Date,
				initiative
			)

			yield cli()

			initiativesDb.read(initiative).must.eql({
				__proto__: initiative,
				last_signature_created_at: findLastUndersigned(signatures).created_at,

				signature_milestones: {
					5: signatures[4].created_at,
					[signatureThreshold]: signatures[signatureThreshold - 1].created_at
				}
			})
		})

		it("must use saved signature threshold in sign phase if signing expired",
			function*() {
			var signatureThreshold =
				LOCAL_GOVERNMENTS["muhu-vald"].signatureThreshold + 10

			var initiative = initiativesDb.create(new ValidInitiative({
				user_id: this.user.id,
				destination: "muhu-vald",
				phase: "sign",
				signing_expired_at: new Date,
				signature_threshold: signatureThreshold,
				signature_threshold_at: new Date
			}))

			var signatures = createSignatures(
				signatureThreshold + 1,
				new Date,
				initiative
			)

			yield cli()

			initiativesDb.read(initiative).must.eql({
				__proto__: initiative,
				last_signature_created_at: findLastUndersigned(signatures).created_at,

				signature_milestones: {
					5: signatures[4].created_at,
					[signatureThreshold]: signatures[signatureThreshold - 1].created_at
				}
			})
		})
	})

	it("must update milestones when not all milestones reached", function*() {
		var initiative = initiativesDb.create(new ValidInitiative({
			user_id: this.user.id,
			phase: "sign"
		}))

		var signatures = createSignatures(9, new Date, initiative)

		subscriptionsDb.create([
			new ValidSubscription({
				initiative_uuid: initiative.uuid,
				confirmed_at: new Date,
				event_interest: true
			}),

			new ValidSubscription({
				initiative_uuid: null,
				confirmed_at: new Date,
				event_interest: true
			})
		])

		yield cli()

		initiativesDb.read(initiative.id).must.eql({
			__proto__: initiative,
			last_signature_created_at: findLastUndersigned(signatures).created_at,
			signature_milestones: {5: signatures[4].created_at}
		})

		this.emails.length.must.equal(1)
	})

	it("must notify of milestones reached 24h ago", function*() {
		var initiative = initiativesDb.create(new ValidInitiative({
			user_id: this.user.id,
			phase: "sign"
		}))

		createSignatures(
			5,
			DateFns.addMinutes(DateFns.addHours(new Date, -24), -5 + 1),
			initiative
		)

		subscriptionsDb.create([
			new ValidSubscription({
				initiative_uuid: initiative.uuid,
				confirmed_at: new Date,
				event_interest: true
			}),

			new ValidSubscription({
				initiative_uuid: null,
				confirmed_at: new Date,
				event_interest: true
			})
		])

		yield cli()
		this.emails.length.must.equal(1)
	})

	it("must not notify of milestones reached earlier than 24h", function*() {
		var initiative = initiativesDb.create(new ValidInitiative({
			user_id: this.user.id,
			phase: "sign"
		}))

		createSignatures(
			5,
			DateFns.addMinutes(DateFns.addHours(new Date, -24), -5),
			initiative
		)

		subscriptionsDb.create([
			new ValidSubscription({
				initiative_uuid: initiative.uuid,
				confirmed_at: new Date,
				event_interest: true
			}),

			new ValidSubscription({
				initiative_uuid: null,
				confirmed_at: new Date,
				event_interest: true
			})
		])

		yield cli()
		this.emails.length.must.equal(0)
	})

	it("must update old milestones but not notify", function*() {
		var initiative = initiativesDb.create(new ValidInitiative({
			user_id: this.user.id,
			phase: "sign",
		}))

		var signatures = createSignatures(10, new Date, initiative)

		initiativesDb.update(initiative.id, {
			signature_milestones: {10: signatures[9].created_at}
		})

		subscriptionsDb.create([
			new ValidSubscription({
				initiative_uuid: initiative.uuid,
				confirmed_at: new Date,
				event_interest: true
			}),

			new ValidSubscription({
				initiative_uuid: null,
				confirmed_at: new Date,
				event_interest: true
			})
		])

		yield cli()

		initiativesDb.read(initiative.id).must.eql({
			__proto__: initiative,
			last_signature_created_at: findLastUndersigned(signatures).created_at,

			signature_milestones: {
				5: signatures[4].created_at,
				10: signatures[9].created_at
			}
		})

		this.emails.length.must.equal(0)
	})

	;["parliament", "government", "done"].forEach(function(phase) {
		describe(`when initiative in ${phase}`, function() {
			it("must update milestones", function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.user.id,
					phase: phase
				}))

				var signatures = createSignatures(5, new Date, initiative)
				yield cli()

				initiativesDb.read(initiative.id).must.eql({
					__proto__: initiative,
					last_signature_created_at: findLastUndersigned(signatures).created_at,
					signature_milestones: {5: signatures[4].created_at}
				})
			})

			it("must update milestones using saved signature threshold", function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.user.id,
					phase: phase,
					signature_threshold: 3,
					signature_threshold_at: new Date
				}))

				var signatures = createSignatures(10, new Date, initiative)
				yield cli()

				initiativesDb.read(initiative.id).must.eql({
					__proto__: initiative,
					last_signature_created_at: findLastUndersigned(signatures).created_at,

					signature_milestones: {
						3: signatures[2].created_at,
						5: signatures[4].created_at
					}
				})
			})

			it("must not notify", function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.user.id,
					phase: phase,
				}))

				createSignatures(MILESTONES[0], new Date, initiative)

				subscriptionsDb.create([
					new ValidSubscription({
						initiative_uuid: initiative.uuid,
						confirmed_at: new Date,
						event_interest: true
					}),

					new ValidSubscription({
						initiative_uuid: null,
						confirmed_at: new Date,
						event_interest: true
					})
				])

				yield cli()
				this.emails.length.must.equal(0)
			})
		})
	})

	it("must not update already recorded milestones", function*() {
		var initiative = initiativesDb.create(new ValidInitiative({
			user_id: this.user.id,
			phase: "sign",
			signature_milestones: {5: pseudoDateTime()}
		}))

		var signatures = createSignatures(10, new Date, initiative)
		yield cli()

		initiativesDb.read(initiative).must.eql({
			__proto__: initiative,
			last_signature_created_at: findLastUndersigned(signatures).created_at,

			signature_milestones: {
				5: initiative.signature_milestones[5],
				10: signatures[9].created_at
			}
		})
	})

	it("must not update initiative with no signatures", function*() {
		var initiative = initiativesDb.create(new ValidInitiative({
			user_id: this.user.id,
			phase: "sign",
		}))

		subscriptionsDb.create([
			new ValidSubscription({
				initiative_uuid: initiative.uuid,
				confirmed_at: new Date,
				event_interest: true
			}),

			new ValidSubscription({
				initiative_uuid: null,
				confirmed_at: new Date,
				event_interest: true
			})
		])

		yield cli()
		initiativesDb.read(initiative).must.eql(initiative)
		this.emails.length.must.equal(0)
	})

	it("must count signatures by initiative", function*() {
		var self = this

		_.times(3, function(i) {
			var initiative = initiativesDb.create(new ValidInitiative({
				user_id: self.user.id,
				phase: "sign"
			}))

			createSignatures(5, DateFns.addHours(new Date, i), initiative)
		})

		subscriptionsDb.create([new ValidSubscription({
			confirmed_at: new Date,
			event_interest: true
		})])

		yield cli()

		var initiatives = initiativesDb.search(sql`SELECT * FROM initiatives`)
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

function findLastUndersigned(signatures) {
	return _.findLast(signatures, (sig) => sig.xades != null)
}
