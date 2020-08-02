var _ = require("root/lib/underscore")
var I18n = require("root/lib/i18n")
var DateFns = require("date-fns")
var Config = require("root/config")
var Crypto = require("crypto")
var ValidUser = require("root/test/valid_user")
var ValidInitiative = require("root/test/valid_db_initiative")
var ValidSignature = require("root/test/valid_signature")
var cli = require("root/cli/initiative_end_email_cli")
var usersDb = require("root/db/users_db")
var signaturesDb = require("root/db/initiative_signatures_db")
var db = require("root/db/initiatives_db")
var t = require("root/lib/i18n").t.bind(null, Config.language)
var EXPIRATION_MONTHS = Config.expireSignaturesInMonths
var LOCAL_GOVERNMENTS = require("root/lib/local_governments")

describe("InitiativeEndEmailCli", function() {
	require("root/test/mitm")()
	require("root/test/db")()
	require("root/test/email")()
	require("root/test/time")(new Date(2015, 5, 18, 13, 37, 42))

	beforeEach(function*() {
		this.user = yield usersDb.create(new ValidUser({
			email: "john@example.com",
			email_confirmed_at: new Date
		}))
	})
	
	describe("when in discussion", function() {
		it("must email when discussion has ended", function*() {
			var initiative = yield db.create(new ValidInitiative({
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
				initiativeUrl: `${Config.url}/initiatives/${initiative.uuid}`,
				initiativeEditUrl: `${Config.url}/initiatives/${initiative.uuid}`,
				siteUrl: Config.url,
				facebookUrl: Config.facebookUrl,
				twitterUrl: Config.twitterUrl
			}))
		})

		it("must email when discussion ended 6 months ago", function*() {
			yield db.create(new ValidInitiative({
				user_id: this.user.id,
				published_at: new Date,
				discussion_ends_at: DateFns.addMonths(new Date, -6)
			}))

			yield cli()
			this.emails.length.must.equal(1)
		})

		it("must not email when discussion ended more than 6 months ago",
			function*() {
			yield db.create(new ValidInitiative({
				user_id: this.user.id,
				published_at: new Date,
				discussion_ends_at:
					DateFns.addSeconds(DateFns.addMonths(new Date, -6), -1)
			}))

			yield cli()
			this.emails.length.must.equal(0)
		})

		it("must not email when discussion not ended", function*() {
			yield db.create(new ValidInitiative({
				user_id: this.user.id,
				published_at: new Date,
				discussion_ends_at: DateFns.addSeconds(new Date, 1)
			}))

			yield cli()
			this.emails.must.be.empty()
		})

		it("must not email if user email not set", function*() {
			yield usersDb.update(this.user, {email: null, email_confirmed_at: null})

			yield db.create(new ValidInitiative({
				user_id: this.user.id,
				published_at: new Date,
				discussion_ends_at: new Date
			}))

			yield cli()
			this.emails.must.be.empty()
		})

		it("must not email if user email not verified", function*() {
			yield usersDb.update(this.user, {
				email: null,
				email_confirmed_at: null,
				unconfirmed_email: this.user.email,
				email_confirmation_token: Crypto.randomBytes(12)
			})

			yield db.create(new ValidInitiative({
				user_id: this.user.id,
				published_at: new Date,
				discussion_ends_at: new Date
			}))

			yield cli()
			this.emails.must.be.empty()
		})

		it("must not email if not public", function*() {
			yield db.create(new ValidInitiative({
				user_id: this.user.id,
				discussion_ends_at: new Date
			}))

			yield cli()
			this.emails.must.be.empty()
		})

		it("must not email if already in sign phase", function*() {
			yield db.create(new ValidInitiative({
				user_id: this.user.id,
				phase: "sign",
				discussion_ends_at: new Date,
				signing_started_at: new Date
			}))

			yield cli()
			this.emails.must.be.empty()
		})

		it("must not email twice", function*() {
			yield db.create(new ValidInitiative({
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
				var initiative = yield db.create(new ValidInitiative({
					user_id: this.user.id,
					phase: "sign",
					signing_started_at: new Date,
					signing_ends_at: new Date
				}))

				yield signaturesDb.create(_.times(Config.votesRequired, () => (
					new ValidSignature({initiative_uuid: initiative.uuid})
				)))

				yield cli()
				this.emails.length.must.equal(1)

				var email = this.emails[0]
				email.envelope.to.must.eql([this.user.email])
				email.headers.subject.must.equal(t("SIGNING_END_COMPLETE_EMAIL_SUBJECT"))

				email.body.must.equal(t("SIGNING_END_COMPLETE_EMAIL_BODY", {
					initiativeTitle: initiative.title,
					initiativeUrl: `${Config.url}/initiatives/${initiative.uuid}`,
					initiativeEditUrl: `${Config.url}/initiatives/${initiative.uuid}`,
					siteUrl: Config.url,
					facebookUrl: Config.facebookUrl,
					twitterUrl: Config.twitterUrl
				}))
			})

			it("must email when signing has ended and initiative incomplete",
				function*() {
				var initiative = yield db.create(new ValidInitiative({
					user_id: this.user.id,
					phase: "sign",
					signing_started_at: new Date,
					signing_ends_at: new Date
				}))

				yield signaturesDb.create(_.times(Config.votesRequired - 1, () => (
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
					initiativeUrl: `${Config.url}/initiatives/${initiative.uuid}`,
					initiativeEditUrl: `${Config.url}/initiatives/${initiative.uuid}`,
					siteUrl: Config.url,
					facebookUrl: Config.facebookUrl,
					twitterUrl: Config.twitterUrl
				}))
			})

			it("must not email if already in parliament phase", function*() {
				var initiative = yield db.create(new ValidInitiative({
					user_id: this.user.id,
					phase: "parliament",
					signing_started_at: new Date,
					signing_ends_at: new Date
				}))

				yield signaturesDb.create(_.times(Config.votesRequired, () => (
					new ValidSignature({initiative_uuid: initiative.uuid})
				)))

				yield cli()
				this.emails.must.be.empty()
			})
		})

		describe("when destined for local", function() {
			it("must email when signing has ended and initiative successful",
				function*() {
				var initiative = yield db.create(new ValidInitiative({
					user_id: this.user.id,
					phase: "sign",
					destination: "kihnu-vald",
					signing_started_at: new Date,
					signing_ends_at: new Date
				}))

				var threshold = Math.round(
					LOCAL_GOVERNMENTS["kihnu-vald"].population * 0.01
				)

				yield signaturesDb.create(_.times(threshold, () => (
					new ValidSignature({initiative_uuid: initiative.uuid})
				)))

				yield cli()
				this.emails.length.must.equal(1)

				var email = this.emails[0]
				email.envelope.to.must.eql([this.user.email])
				email.headers.subject.must.equal(t("SIGNING_END_COMPLETE_EMAIL_SUBJECT"))

				email.body.must.equal(t("SIGNING_END_COMPLETE_EMAIL_BODY", {
					initiativeTitle: initiative.title,
					initiativeUrl: `${Config.url}/initiatives/${initiative.uuid}`,
					initiativeEditUrl: `${Config.url}/initiatives/${initiative.uuid}`,
					siteUrl: Config.url,
					facebookUrl: Config.facebookUrl,
					twitterUrl: Config.twitterUrl
				}))
			})

			it("must email when signing has ended and initiative incomplete",
				function*() {
				var initiative = yield db.create(new ValidInitiative({
					user_id: this.user.id,
					phase: "sign",
					signing_started_at: new Date,
					signing_ends_at: new Date
				}))

				var threshold = Math.round(
					LOCAL_GOVERNMENTS["kihnu-vald"].population * 0.01
				)

				yield signaturesDb.create(_.times(threshold - 1, () => (
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
					initiativeUrl: `${Config.url}/initiatives/${initiative.uuid}`,
					initiativeEditUrl: `${Config.url}/initiatives/${initiative.uuid}`,
					siteUrl: Config.url,
					facebookUrl: Config.facebookUrl,
					twitterUrl: Config.twitterUrl
				}))
			})

			it("must not email if already in parliament phase", function*() {
				var initiative = yield db.create(new ValidInitiative({
					user_id: this.user.id,
					phase: "parliament",
					signing_started_at: new Date,
					signing_ends_at: new Date
				}))

				yield signaturesDb.create(_.times(Config.votesRequired, () => (
					new ValidSignature({initiative_uuid: initiative.uuid})
				)))

				yield cli()
				this.emails.must.be.empty()
			})
		})

		it("must email when signing ended 6 months ago", function*() {
			var initiative = yield db.create(new ValidInitiative({
				user_id: this.user.id,
				phase: "sign",
				signing_started_at: DateFns.addMonths(new Date, -6),
				signing_ends_at: DateFns.addMonths(new Date, -6)
			}))

			yield signaturesDb.create(_.times(Config.votesRequired, () => (
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

			var initiative = yield db.create(new ValidInitiative({
				user_id: this.user.id,
				phase: "sign",
				signing_started_at: endsAt,
				signing_ends_at: endsAt
			}))

			yield signaturesDb.create(_.times(Config.votesRequired, () => (
				new ValidSignature({initiative_uuid: initiative.uuid})
			)))

			yield cli()
			this.emails.must.be.empty()
		})

		it("must not email when signing not ended", function*() {
			yield db.create(new ValidInitiative({
				user_id: this.user.id,
				phase: "sign",
				signing_started_at: new Date,
				signing_ends_at: DateFns.addSeconds(new Date, 1)
			}))

			yield cli()
			this.emails.must.be.empty()
		})

		it("must not email if user email not set", function*() {
			yield usersDb.update(this.user, {email: null, email_confirmed_at: null})

			yield db.create(new ValidInitiative({
				user_id: this.user.id,
				phase: "sign",
				signing_started_at: new Date,
				signing_ends_at: new Date
			}))

			yield cli()
			this.emails.must.be.empty()
		})

		it("must not email if user email not verified", function*() {
			yield usersDb.update(this.user, {
				email: null,
				email_confirmed_at: null,
				unconfirmed_email: this.user.email,
				email_confirmation_token: Crypto.randomBytes(12)
			})

			yield db.create(new ValidInitiative({
				user_id: this.user.id,
				phase: "sign",
				signing_ends_at: new Date
			}))

			yield cli()
			this.emails.must.be.empty()
		})

		it("must not email twice", function*() {
			yield db.create(new ValidInitiative({
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
		beforeEach(function() { Config.expireSignaturesFrom = "1970-01-01" })

		it("must not email if already marked as expired", function*() {
			yield db.create(new ValidInitiative({
				user_id: this.user.id,
				phase: "sign",
				signing_started_at: DateFns.addMonths(new Date, -EXPIRATION_MONTHS + 1),
				signing_ends_at: DateFns.addYears(new Date, 1),
				signing_expired_at: new Date
			}))

			yield cli()
			this.emails.must.be.empty()
		})

		it("must email if expired", function*() {
			var initiative = yield db.create(new ValidInitiative({
				user_id: this.user.id,
				phase: "sign",
				signing_started_at: DateFns.addMonths(new Date, -EXPIRATION_MONTHS),
				signing_ends_at: DateFns.addYears(new Date, 1)
			}))

			yield cli()
			this.emails.length.must.equal(1)

			var email = this.emails[0]
			email.envelope.to.must.eql([this.user.email])
			email.headers.subject.must.equal(t("SIGNING_EXPIRED_EMAIL_SUBJECT"))

			email.body.must.equal(t("SIGNING_EXPIRED_EMAIL_BODY", {
				initiativeTitle: initiative.title,
				initiativeUrl: `${Config.url}/initiatives/${initiative.uuid}`,
				newInitiativeUrl: `${Config.url}/initiatives/new`,
				siteUrl: Config.url,
				facebookUrl: Config.facebookUrl,
				twitterUrl: Config.twitterUrl
			}))
		})

		it("must not email twice if expired", function*() {
			yield db.create(new ValidInitiative({
				user_id: this.user.id,
				phase: "sign",
				signing_started_at: DateFns.addMonths(new Date, -EXPIRATION_MONTHS),
				signing_ends_at: DateFns.addYears(new Date, 1)
			}))

			yield cli()
			this.emails.length.must.equal(1)
			this.emails[0].headers.subject.must.equal(
				t("SIGNING_EXPIRED_EMAIL_SUBJECT")
			)

			this.time.tick(86401 * 1000)

			yield cli()
			this.emails.length.must.equal(1)
		})

		it("must email when signing expiring in 14 days", function*() {
			var initiative = yield db.create(new ValidInitiative({
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
				initiativeUrl: `${Config.url}/initiatives/${initiative.uuid}`,
				expirationDate: renderExpirationDate(initiative),
				siteUrl: Config.url,
				facebookUrl: Config.facebookUrl,
				twitterUrl: Config.twitterUrl
			}))
		})

		it("must not email twice when signing expiring in 14 days", function*() {
			var initiative = yield db.create(new ValidInitiative({
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
			var initiative = yield db.create(new ValidInitiative({
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
			var initiative = yield db.create(new ValidInitiative({
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
			var initiative = yield db.create(new ValidInitiative({
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
			yield db.create(new ValidInitiative({
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
		})

		it("must email when signing expiring for clamped start", function*() {
			var minDate = DateFns.addMonths(new Date, -EXPIRATION_MONTHS + 3)
			Config.expireSignaturesFrom = I18n.formatDate("iso", minDate)

			var initiative = yield db.create(new ValidInitiative({
				user_id: this.user.id,
				phase: "sign",
				signing_started_at: DateFns.addYears(new Date, -5),
				signing_ends_at: DateFns.addYears(new Date, 1)
			}))

			yield cli()
			this.emails.length.must.equal(1)

			this.emails[0].headers.subject.must.equal(
				t("SIGNING_EXPIRING_EMAIL_SUBJECT", {
					expirationDate: renderExpirationDate({
						__proto__: initiative,
						signing_started_at: minDate
					})
				})
			)
		})

		it("must email at each milestone", function*() {
			var initiative = yield db.create(new ValidInitiative({
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
			yield usersDb.update(this.user, {email: null, email_confirmed_at: null})

			yield db.create(new ValidInitiative({
				user_id: this.user.id,
				phase: "sign",
				signing_started_at: DateFns.addMonths(new Date, -EXPIRATION_MONTHS),
				signing_ends_at: DateFns.addYears(new Date, 1)
			}))

			yield cli()
			this.emails.must.be.empty()
		})

		it("must not email if user email not verified", function*() {
			yield usersDb.update(this.user, {
				email: null,
				email_confirmed_at: null,
				unconfirmed_email: this.user.email,
				email_confirmation_token: Crypto.randomBytes(12)
			})

			yield db.create(new ValidInitiative({
				user_id: this.user.id,
				phase: "sign",
				signing_started_at: DateFns.addMonths(new Date, -EXPIRATION_MONTHS),
				signing_ends_at: DateFns.addYears(new Date, 1)
			}))

			yield cli()
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
