var _ = require("root/lib/underscore")
var I18n = require("root/lib/i18n")
var DateFns = require("date-fns")
var Config = require("root").config
var Crypto = require("crypto")
var Initiative = require("root/lib/initiative")
var ValidUser = require("root/test/valid_user")
var ValidInitiative = require("root/test/valid_initiative")
var ValidSignature = require("root/test/valid_signature")
var cli = require("root/cli/initiative_end_email_cli")
var usersDb = require("root/db/users_db")
var signaturesDb = require("root/db/initiative_signatures_db")
var initiativesDb = require("root/db/initiatives_db")
var t = require("root/lib/i18n").t.bind(null, Config.language)
var EXPIRATION_MONTHS = Config.expireSignaturesInMonths
var LOCAL_GOVERNMENTS = require("root/lib/local_governments")

describe("InitiativeEndEmailCli", function() {
	require("root/test/mitm")()
	require("root/test/db")()
	require("root/test/email")()
	require("root/test/time")(new Date(2015, 5, 18, 13, 37, 42))

	beforeEach(function() {
		this.user = usersDb.create(new ValidUser({
			email: "john@example.com",
			email_confirmed_at: new Date
		}))
	})

	describe("when in discussion", function() {
		it("must email when discussion has ended", function*() {
			var initiative = initiativesDb.create(new ValidInitiative({
				user_id: this.user.id,
				published_at: new Date,
				discussion_ends_at: new Date
			}))

			yield cli()
			this.emails.length.must.equal(1)

			var email = this.emails[0]
			email.envelope.to.must.eql([this.user.email])
			email.headers.subject.must.equal(t("DISCUSSION_END_EMAIL_SUBJECT"))

			email.body.must.equal(t("DISCUSSION_END_EMAIL_BODY", {
				initiativeTitle: initiative.title,
				initiativeUrl: Initiative.slugUrl(initiative),
				initiativeEditUrl: Initiative.slugUrl(initiative),
				siteUrl: Config.url,
				facebookUrl: Config.facebookUrl
			}))
		})

		it("must not email if --dry-run given", function*() {
			var initiative = initiativesDb.create(new ValidInitiative({
				user_id: this.user.id,
				published_at: new Date,
				discussion_ends_at: new Date
			}))

			yield cli(["initiative-end-email", "--dry-run"])
			this.emails.must.be.empty()
			initiativesDb.read(initiative).must.eql(initiative)
		})

		it("must email when discussion ended 6 months ago", function*() {
			initiativesDb.create(new ValidInitiative({
				user_id: this.user.id,
				published_at: new Date,
				discussion_ends_at: DateFns.addMonths(new Date, -6)
			}))

			yield cli()
			this.emails.length.must.equal(1)
		})

		it("must not email when discussion ended more than 6 months ago",
			function*() {
			initiativesDb.create(new ValidInitiative({
				user_id: this.user.id,
				published_at: new Date,
				discussion_ends_at:
					DateFns.addSeconds(DateFns.addMonths(new Date, -6), -1)
			}))

			yield cli()
			this.emails.length.must.equal(0)
		})

		it("must not email when discussion not ended", function*() {
			initiativesDb.create(new ValidInitiative({
				user_id: this.user.id,
				published_at: new Date,
				discussion_ends_at: DateFns.addSeconds(new Date, 1)
			}))

			yield cli()
			this.emails.must.be.empty()
		})

		it("must not email if user email not set", function*() {
			usersDb.update(this.user, {email: null, email_confirmed_at: null})

			initiativesDb.create(new ValidInitiative({
				user_id: this.user.id,
				published_at: new Date,
				discussion_ends_at: new Date
			}))

			yield cli()
			this.emails.must.be.empty()
		})

		it("must not email if user email not verified", function*() {
			usersDb.update(this.user, {
				email: null,
				email_confirmed_at: null,
				unconfirmed_email: this.user.email,
				email_confirmation_token: Crypto.randomBytes(12)
			})

			initiativesDb.create(new ValidInitiative({
				user_id: this.user.id,
				published_at: new Date,
				discussion_ends_at: new Date
			}))

			yield cli()
			this.emails.must.be.empty()
		})

		it("must not email if not public", function*() {
			initiativesDb.create(new ValidInitiative({
				user_id: this.user.id,
				discussion_ends_at: new Date
			}))

			yield cli()
			this.emails.must.be.empty()
		})

		it("must not email if already in sign phase", function*() {
			initiativesDb.create(new ValidInitiative({
				user_id: this.user.id,
				phase: "sign",
				discussion_ends_at: new Date,
				signing_started_at: new Date
			}))

			yield cli()
			this.emails.must.be.empty()
		})

		it("must not email twice", function*() {
			initiativesDb.create(new ValidInitiative({
				user_id: this.user.id,
				published_at: new Date,
				discussion_ends_at: new Date
			}))

			yield cli()
			this.emails.length.must.equal(1)

			yield cli()
			this.emails.length.must.equal(1)
		})
	})

	describe("when in signing", function() {
		describe("when destined for parliament", function() {
			it("must email when signing has ended and initiative successful",
				function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.user.id,
					phase: "sign",
					signing_started_at: new Date,
					signing_ends_at: new Date
				}))

				signaturesDb.create(_.times(Config.votesRequired, () => (
					new ValidSignature({initiative_uuid: initiative.uuid})
				)))

				yield cli()
				this.emails.length.must.equal(1)

				var email = this.emails[0]
				email.envelope.to.must.eql([this.user.email])
				email.headers.subject.must.equal(t("SIGNING_END_COMPLETE_EMAIL_SUBJECT"))

				email.body.must.equal(t("SIGNING_END_COMPLETE_EMAIL_BODY", {
					initiativeTitle: initiative.title,
					initiativeUrl: Initiative.slugUrl(initiative),
					initiativeEditUrl: Initiative.slugUrl(initiative),
					siteUrl: Config.url,
					facebookUrl: Config.facebookUrl
				}))
			})

			it("must email when signing has ended and initiative unsuccessful",
				function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.user.id,
					phase: "sign",
					signing_started_at: new Date,
					signing_ends_at: new Date
				}))

				signaturesDb.create(_.times(Config.votesRequired - 1, () => (
					new ValidSignature({initiative_uuid: initiative.uuid})
				)))

				yield cli()
				this.emails.length.must.equal(1)

				var email = this.emails[0]
				email.envelope.to.must.eql([this.user.email])

				email.headers.subject.must.equal(
					t("SIGNING_END_INCOMPLETE_EMAIL_SUBJECT")
				)

				email.body.must.equal(t("SIGNING_END_INCOMPLETE_EMAIL_BODY", {
					initiativeTitle: initiative.title,
					initiativeUrl: Initiative.slugUrl(initiative),
					initiativeEditUrl: Initiative.slugUrl(initiative),
					siteUrl: Config.url,
					facebookUrl: Config.facebookUrl
				}))
			})

			it("must not email if --dry-run given ", function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.user.id,
					phase: "sign",
					signing_started_at: new Date,
					signing_ends_at: new Date
				}))

				yield cli(["initiative-end-email", "--dry-run"])
				this.emails.must.be.empty()
				initiativesDb.read(initiative).must.eql(initiative)
			})

			it("must not email if already in parliament phase", function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.user.id,
					phase: "parliament",
					signing_started_at: new Date,
					signing_ends_at: new Date
				}))

				signaturesDb.create(_.times(Config.votesRequired, () => (
					new ValidSignature({initiative_uuid: initiative.uuid})
				)))

				yield cli()
				this.emails.must.be.empty()
			})
		})

		describe("when destined for local", function() {
			it("must email when signing has ended and initiative successful",
				function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.user.id,
					phase: "sign",
					destination: "muhu-vald",
					signing_started_at: new Date,
					signing_ends_at: new Date
				}))

				var {signatureThreshold} = LOCAL_GOVERNMENTS["muhu-vald"]

				signaturesDb.create(_.times(signatureThreshold, () => (
					new ValidSignature({initiative_uuid: initiative.uuid})
				)))

				yield cli()
				this.emails.length.must.equal(1)

				var email = this.emails[0]
				email.envelope.to.must.eql([this.user.email])
				email.headers.subject.must.equal(t("SIGNING_END_COMPLETE_EMAIL_SUBJECT"))

				email.body.must.equal(t("SIGNING_END_COMPLETE_EMAIL_BODY", {
					initiativeTitle: initiative.title,
					initiativeUrl: Initiative.slugUrl(initiative),
					initiativeEditUrl: Initiative.slugUrl(initiative),
					siteUrl: Config.url,
					facebookUrl: Config.facebookUrl
				}))
			})

			it("must email when signing has ended and initiative unsuccessful",
				function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.user.id,
					phase: "sign",
					destination: "muhu-vald",
					signing_started_at: new Date,
					signing_ends_at: new Date
				}))

				var {signatureThreshold} = LOCAL_GOVERNMENTS["muhu-vald"]

				signaturesDb.create(_.times(signatureThreshold - 1, () => (
					new ValidSignature({initiative_uuid: initiative.uuid})
				)))

				yield cli()
				this.emails.length.must.equal(1)

				var email = this.emails[0]
				email.envelope.to.must.eql([this.user.email])

				email.headers.subject.must.equal(
					t("SIGNING_END_INCOMPLETE_EMAIL_SUBJECT")
				)

				email.body.must.equal(t("SIGNING_END_INCOMPLETE_EMAIL_BODY", {
					initiativeTitle: initiative.title,
					initiativeUrl: Initiative.slugUrl(initiative),
					initiativeEditUrl: Initiative.slugUrl(initiative),
					siteUrl: Config.url,
					facebookUrl: Config.facebookUrl
				}))
			})

			it("must not email if already in parliament phase", function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.user.id,
					phase: "parliament",
					signing_started_at: new Date,
					signing_ends_at: new Date
				}))

				signaturesDb.create(_.times(Config.votesRequired, () => (
					new ValidSignature({initiative_uuid: initiative.uuid})
				)))

				yield cli()
				this.emails.must.be.empty()
			})
		})

		it("must email when signing ended 6 months ago", function*() {
			var initiative = initiativesDb.create(new ValidInitiative({
				user_id: this.user.id,
				phase: "sign",
				signing_started_at: DateFns.addMonths(new Date, -6),
				signing_ends_at: DateFns.addMonths(new Date, -6)
			}))

			signaturesDb.create(_.times(Config.votesRequired, () => (
				new ValidSignature({initiative_uuid: initiative.uuid})
			)))

			yield cli()
			this.emails.length.must.equal(1)
			this.emails[0].headers.subject.must.equal(
				t("SIGNING_END_COMPLETE_EMAIL_SUBJECT")
			)
		})

		it("must not email when signing ended more than 6 months ago", function*() {
			var endsAt = DateFns.addSeconds(DateFns.addMonths(new Date, -6), -1)

			var initiative = initiativesDb.create(new ValidInitiative({
				user_id: this.user.id,
				phase: "sign",
				signing_started_at: endsAt,
				signing_ends_at: endsAt
			}))

			signaturesDb.create(_.times(Config.votesRequired, () => (
				new ValidSignature({initiative_uuid: initiative.uuid})
			)))

			yield cli()
			this.emails.must.be.empty()
		})

		it("must not email when signing not ended", function*() {
			initiativesDb.create(new ValidInitiative({
				user_id: this.user.id,
				phase: "sign",
				signing_started_at: new Date,
				signing_ends_at: DateFns.addSeconds(new Date, 1)
			}))

			yield cli()
			this.emails.must.be.empty()
		})

		it("must not email if user email not set", function*() {
			usersDb.update(this.user, {email: null, email_confirmed_at: null})

			initiativesDb.create(new ValidInitiative({
				user_id: this.user.id,
				phase: "sign",
				signing_started_at: new Date,
				signing_ends_at: new Date
			}))

			yield cli()
			this.emails.must.be.empty()
		})

		it("must not email if user email not verified", function*() {
			usersDb.update(this.user, {
				email: null,
				email_confirmed_at: null,
				unconfirmed_email: this.user.email,
				email_confirmation_token: Crypto.randomBytes(12)
			})

			initiativesDb.create(new ValidInitiative({
				user_id: this.user.id,
				phase: "sign",
				signing_ends_at: new Date
			}))

			yield cli()
			this.emails.must.be.empty()
		})

		it("must not email twice", function*() {
			initiativesDb.create(new ValidInitiative({
				user_id: this.user.id,
				phase: "sign",
				signing_started_at: new Date,
				signing_ends_at: new Date
			}))

			yield cli()
			this.emails.length.must.equal(1)
			this.emails[0].headers.subject.must.equal(
				t("SIGNING_END_COMPLETE_EMAIL_SUBJECT")
			)

			yield cli()
			this.emails.length.must.equal(1)
		})
	})

	describe("when in signing and signatures expiring", function() {
		it("must not email if already marked as expired", function*() {
			var initiative = initiativesDb.create(new ValidInitiative({
				user_id: this.user.id,
				phase: "sign",
				signing_started_at: DateFns.addMonths(new Date, -EXPIRATION_MONTHS + 1),
				signing_ends_at: DateFns.addYears(new Date, 1),
				signing_expired_at: new Date
			}))

			yield cli()
			initiativesDb.read(initiative).must.eql(initiative)
			this.emails.must.be.empty()
		})

		it("must not email if expired but not marked as such", function*() {
			var initiative = initiativesDb.create(new ValidInitiative({
				user_id: this.user.id,
				phase: "sign",
				signing_started_at: DateFns.addMonths(new Date, -EXPIRATION_MONTHS),
				signing_ends_at: DateFns.addYears(new Date, 1)
			}))

			yield cli()
			initiativesDb.read(initiative).must.eql(initiative)
			this.emails.must.be.empty()
		})

		it("must email when signing expiring in 14 days", function*() {
			var initiative = initiativesDb.create(new ValidInitiative({
				user_id: this.user.id,
				phase: "sign",
				signing_started_at: DateFns.addDays(
					DateFns.addMonths(new Date, -EXPIRATION_MONTHS),
					14
				),
				signing_ends_at: DateFns.addYears(new Date, 1)
			}))

			yield cli()
			this.emails.length.must.equal(1)

			var email = this.emails[0]
			email.envelope.to.must.eql([this.user.email])
			email.headers.subject.must.equal(t("SIGNING_EXPIRING_EMAIL_SUBJECT", {
				expirationDate: renderExpirationDate(initiative)
			}))

			email.body.must.equal(t("SIGNING_EXPIRING_EMAIL_BODY", {
				initiativeTitle: initiative.title,
				initiativeUrl: Initiative.slugUrl(initiative),
				expirationDate: renderExpirationDate(initiative),
				siteUrl: Config.url,
				facebookUrl: Config.facebookUrl
			}))
		})

		it("must not email twice when signing expiring in 14 days", function*() {
			var initiative = initiativesDb.create(new ValidInitiative({
				user_id: this.user.id,
				phase: "sign",
				signing_started_at: DateFns.addDays(
					DateFns.addMonths(new Date, -EXPIRATION_MONTHS),
					14
				),
				signing_ends_at: DateFns.addYears(new Date, 1)
			}))

			yield cli()
			this.emails.length.must.equal(1)
			this.emails[0].headers.subject.must.equal(
				t("SIGNING_EXPIRING_EMAIL_SUBJECT", {
					expirationDate: renderExpirationDate(initiative)
				})
			)

			this.time.tick(86401 * 1000)

			yield cli()
			this.emails.length.must.equal(1)
		})

		it("must email when signing expiring in 3 months", function*() {
			var initiative = initiativesDb.create(new ValidInitiative({
				user_id: this.user.id,
				phase: "sign",
				signing_started_at: DateFns.addMonths(new Date, -EXPIRATION_MONTHS + 3),
				signing_ends_at: DateFns.addYears(new Date, 1)
			}))

			yield cli()
			this.emails.length.must.equal(1)
			this.emails[0].headers.subject.must.equal(
				t("SIGNING_EXPIRING_EMAIL_SUBJECT", {
					expirationDate: renderExpirationDate(initiative)
				})
			)
		})

		it("must not email twice when signing expiring in 3 months", function*() {
			var initiative = initiativesDb.create(new ValidInitiative({
				user_id: this.user.id,
				phase: "sign",
				signing_started_at: DateFns.addMonths(new Date, -EXPIRATION_MONTHS + 3),
				signing_ends_at: DateFns.addYears(new Date, 1)
			}))

			yield cli()
			this.emails.length.must.equal(1)
			this.emails[0].headers.subject.must.equal(
				t("SIGNING_EXPIRING_EMAIL_SUBJECT", {
					expirationDate: renderExpirationDate(initiative)
				})
			)

			this.time.tick(86401 * 1000)

			yield cli()
			this.emails.length.must.equal(1)
		})

		it("must email when signing expiring in less than 3 months", function*() {
			var initiative = initiativesDb.create(new ValidInitiative({
				user_id: this.user.id,
				phase: "sign",
				signing_started_at: DateFns.addDays(
					DateFns.addMonths(new Date, -EXPIRATION_MONTHS + 3),
					-1
				),
				signing_ends_at: DateFns.addYears(new Date, 1)
			}))

			yield cli()
			this.emails.length.must.equal(1)
			this.emails[0].headers.subject.must.equal(
				t("SIGNING_EXPIRING_EMAIL_SUBJECT", {
					expirationDate: renderExpirationDate(initiative)
				})
			)
		})

		it("must not email when signing expiring in more than 3 months",
			function*() {
			var initiative = initiativesDb.create(new ValidInitiative({
				user_id: this.user.id,
				phase: "sign",
				signing_started_at: DateFns.addDays(
					DateFns.addMonths(new Date, -EXPIRATION_MONTHS + 3),
					1
				),
				signing_ends_at: DateFns.addYears(new Date, 1)
			}))

			yield cli()
			initiativesDb.read(initiative).must.eql(initiative)
			this.emails.must.be.empty()
		})

		it("must not email if --dry-run given", function*() {
			var initiative = initiativesDb.create(new ValidInitiative({
				user_id: this.user.id,
				phase: "sign",

				signing_started_at: DateFns.addDays(
					DateFns.addMonths(new Date, -EXPIRATION_MONTHS),
					1
				),

				signing_ends_at: DateFns.addYears(new Date, 1)
			}))

			yield cli(["initiative-end-email", "--dry-run"])
			this.emails.must.be.empty()
			initiativesDb.read(initiative).must.eql(initiative)
		})

		it("must email at each milestone", function*() {
			var initiative = initiativesDb.create(new ValidInitiative({
				user_id: this.user.id,
				phase: "sign",
				signing_started_at: DateFns.addDays(
					DateFns.addMonths(new Date, -EXPIRATION_MONTHS + 3),
					1
				),
				signing_ends_at: DateFns.addYears(new Date, 1)
			}))

			yield cli()
			this.emails.must.be.empty()

			this.time.tick(86401 * 1000)

			yield cli()
			this.emails.length.must.equal(1)
			this.emails[0].headers.subject.must.equal(
				t("SIGNING_EXPIRING_EMAIL_SUBJECT", {
					expirationDate: renderExpirationDate(initiative)
				})
			)

			this.time.tick(86401 * 1000)

			yield cli()
			this.emails.length.must.equal(1)

			this.time.tick(DateFns.addDays(
				DateFns.addMonths(initiative.signing_started_at, EXPIRATION_MONTHS),
				-15
			) - new Date)

			yield cli()
			this.emails.length.must.equal(1)

			this.time.tick(86401 * 1000)

			yield cli()
			this.emails.length.must.equal(2)
			this.emails[1].headers.subject.must.equal(
				t("SIGNING_EXPIRING_EMAIL_SUBJECT", {
					expirationDate: renderExpirationDate(initiative)
				})
			)
		})

		it("must not email if user email not set", function*() {
			usersDb.update(this.user, {email: null, email_confirmed_at: null})

			var initiative = initiativesDb.create(new ValidInitiative({
				user_id: this.user.id,
				phase: "sign",
				signing_started_at: DateFns.addMonths(new Date, -EXPIRATION_MONTHS),
				signing_ends_at: DateFns.addYears(new Date, 1)
			}))

			yield cli()
			initiativesDb.read(initiative).must.eql(initiative)
			this.emails.must.be.empty()
		})

		it("must not email if user email not confirmed", function*() {
			usersDb.update(this.user, {
				email: null,
				email_confirmed_at: null,
				unconfirmed_email: this.user.email,
				email_confirmation_token: Crypto.randomBytes(12)
			})

			var initiative = initiativesDb.create(new ValidInitiative({
				user_id: this.user.id,
				phase: "sign",
				signing_started_at: DateFns.addMonths(new Date, -EXPIRATION_MONTHS),
				signing_ends_at: DateFns.addYears(new Date, 1)
			}))

			yield cli()
			initiativesDb.read(initiative).must.eql(initiative)
			this.emails.must.be.empty()
		})
	})
})

function renderExpirationDate(initiative) {
	return I18n.formatDate("numeric", DateFns.addDays(
		DateFns.addMonths(initiative.signing_started_at, EXPIRATION_MONTHS),
		-1
	))
}
