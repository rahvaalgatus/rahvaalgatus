var _ = require("root/lib/underscore")
var DateFns = require("date-fns")
var ValidUser = require("root/test/valid_user")
var ValidInitiative = require("root/test/valid_initiative")
var Config = require("root").config
var Crypto = require("crypto")
var cli = require("root/cli/initiatives_cli")
var usersDb = require("root/db/users_db")
var initiativesDb = require("root/db/initiatives_db")
var {PHASES} = require("root/lib/initiative")
var EXPIRATION_MONTHS = Config.expireSignaturesInMonths
var LOCAL_GOVERNMENTS = require("root/lib/local_governments")
var t = require("root/lib/i18n").t.bind(null, Config.language)

describe("InitiativesCli", function() {
	require("root/test/db")()
	require("root/test/email")()
	require("root/test/time")(new Date(2015, 5, 18, 13, 37, 42))

	beforeEach(function() {
		this.user = usersDb.create(new ValidUser({
			email: "john@example.com",
			email_confirmed_at: new Date
		}))
	})

	describe("expire-signing", function() {
		it("must expire parliament initiative if time passed", function*() {
			var initiative = initiativesDb.create(new ValidInitiative({
				user_id: this.user.id,
				phase: "sign",
				signing_started_at: DateFns.addMonths(new Date, -EXPIRATION_MONTHS),
				signing_ends_at: new Date
			}))

			yield cli(["initiatives", "expire-signing", "--yes"])

			initiativesDb.read(initiative).must.eql(_.assign({}, initiative, {
				signing_expired_at: new Date,
				signing_expiration_email_sent_at: new Date,
				signature_threshold: Config.votesRequired,
				signature_threshold_at: new Date
			}))

			this.emails.length.must.equal(1)

			var email = this.emails[0]
			email.envelope.to.must.eql([this.user.email])
			email.headers.subject.must.equal(t("SIGNING_EXPIRED_EMAIL_SUBJECT"))

			email.body.must.equal(t("SIGNING_EXPIRED_EMAIL_BODY", {
				initiativeTitle: initiative.title,
				initiativeUrl: `${Config.url}/initiatives/${initiative.uuid}`,
				newInitiativeUrl: `${Config.url}/initiatives/new`,
				siteUrl: Config.url,
				facebookUrl: Config.facebookUrl
			}))
		})

		it("must expire local initiative if time passed", function*() {
			var initiative = initiativesDb.create(new ValidInitiative({
				user_id: this.user.id,
				destination: "muhu-vald",
				phase: "sign",
				signing_started_at: DateFns.addMonths(new Date, -EXPIRATION_MONTHS),
				signing_ends_at: new Date
			}))

			yield cli(["initiatives", "expire-signing", "--yes"])

			initiativesDb.read(initiative).must.eql(_.assign({}, initiative, {
				signing_expired_at: new Date,
				signing_expiration_email_sent_at: new Date,
				signature_threshold: LOCAL_GOVERNMENTS["muhu-vald"].signatureThreshold,
				signature_threshold_at: new Date
			}))

			this.emails.length.must.equal(1)

			var email = this.emails[0]
			email.envelope.to.must.eql([this.user.email])
			email.headers.subject.must.equal(t("SIGNING_EXPIRED_EMAIL_SUBJECT"))

			email.body.must.equal(t("SIGNING_EXPIRED_EMAIL_BODY", {
				initiativeTitle: initiative.title,
				initiativeUrl: `${Config.url}/initiatives/${initiative.uuid}`,
				newInitiativeUrl: `${Config.url}/initiatives/new`,
				siteUrl: Config.url,
				facebookUrl: Config.facebookUrl
			}))
		})

		it("must not expire initiative if time not passed", function*() {
			var initiative = initiativesDb.create(new ValidInitiative({
				user_id: this.user.id,
				phase: "sign",

				signing_started_at: DateFns.addDays(
					DateFns.addMonths(new Date, -EXPIRATION_MONTHS),
					1
				),

				signing_ends_at: new Date
			}))

			yield cli(["initiatives", "expire-signing", "--yes"])
			initiativesDb.read(initiative).must.eql(initiative)
			this.emails.must.be.empty()
		})

		_.without(PHASES, "sign").forEach(function(phase) {
			it(`must not expire initiative in ${phase} phase`, function*() {
				var initiative = initiativesDb.create(new ValidInitiative({
					user_id: this.user.id,
					phase: phase,
					signing_started_at: DateFns.addMonths(new Date, -EXPIRATION_MONTHS),
					signing_ends_at: new Date
				}))

				yield cli(["initiatives", "expire-signing", "--yes"])
				initiativesDb.read(initiative).must.eql(initiative)
				this.emails.must.be.empty()
			})
		})

		it("must not expire initiatives with signing end in the future",
			function*() {
			var initiative = initiativesDb.create(new ValidInitiative({
				user_id: this.user.id,
				phase: "sign",
				signing_started_at: DateFns.addMonths(new Date, -EXPIRATION_MONTHS),
				signing_ends_at: DateFns.addDays(new Date, 1)
			}))

			yield cli(["initiatives", "expire-signing", "--yes"])
			initiativesDb.read(initiative).must.eql(initiative)
			this.emails.must.be.empty()
		})

		it("must expire initiatives with signing end after expiration date",
			function*() {
			var initiative = initiativesDb.create(new ValidInitiative({
				user_id: this.user.id,
				phase: "sign",
				signing_started_at: DateFns.addMonths(new Date, -EXPIRATION_MONTHS - 1),
				signing_ends_at: new Date
			}))

			yield cli(["initiatives", "expire-signing", "--yes"])

			initiativesDb.read(initiative).must.eql(_.assign({}, initiative, {
				signing_expired_at: new Date,
				signing_expiration_email_sent_at: new Date,
				signature_threshold: Config.votesRequired,
				signature_threshold_at: new Date
			}))
		})

		it("must not expire already expired initiatives", function*() {
			var initiative = initiativesDb.create(new ValidInitiative({
				user_id: this.user.id,
				phase: "sign",
				signing_started_at: DateFns.addMonths(new Date, -EXPIRATION_MONTHS),
				signing_ends_at: new Date,
				signing_expired_at: DateFns.addDays(new Date, -1)
			}))

			yield cli(["initiatives", "expire-signing", "--yes"])
			initiativesDb.read(initiative).must.eql(initiative)
			this.emails.must.be.empty()
		})

		it("must not expire external initiatives", function*() {
			var initiative = initiativesDb.create(new ValidInitiative({
				phase: "sign",
				external: true,
				signing_started_at: DateFns.addMonths(new Date, -EXPIRATION_MONTHS),
				signing_ends_at: new Date
			}))

			yield cli(["initiatives", "expire-signing", "--yes"])
			initiativesDb.read(initiative).must.eql(initiative)
			this.emails.must.be.empty()
		})

		it("must not email if --no-email passed", function*() {
			var initiative = initiativesDb.create(new ValidInitiative({
				user_id: this.user.id,
				phase: "sign",
				signing_started_at: DateFns.addMonths(new Date, -EXPIRATION_MONTHS),
				signing_ends_at: new Date
			}))

			yield cli(["initiatives", "expire-signing", "--yes", "--no-email"])

			initiativesDb.read(initiative).must.eql(_.assign({}, initiative, {
				signing_expired_at: new Date,
				signature_threshold: Config.votesRequired,
				signature_threshold_at: new Date
			}))

			this.emails.must.be.empty()
		})

		it("must not email if user email not set", function*() {
			usersDb.update(this.user, {email: null, email_confirmed_at: null})

			var initiative = initiativesDb.create(new ValidInitiative({
				user_id: this.user.id,
				phase: "sign",
				signing_started_at: DateFns.addMonths(new Date, -EXPIRATION_MONTHS),
				signing_ends_at: new Date
			}))

			yield cli(["initiatives", "expire-signing", "--yes"])

			initiativesDb.read(initiative).must.eql(_.assign({}, initiative, {
				signing_expired_at: new Date,
				signature_threshold: Config.votesRequired,
				signature_threshold_at: new Date
			}))

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
				signing_ends_at: new Date
			}))

			yield cli(["initiatives", "expire-signing", "--yes"])

			initiativesDb.read(initiative).must.eql(_.assign({}, initiative, {
				signing_expired_at: new Date,
				signature_threshold: Config.votesRequired,
				signature_threshold_at: new Date
			}))

			this.emails.must.be.empty()
		})
	})
})
