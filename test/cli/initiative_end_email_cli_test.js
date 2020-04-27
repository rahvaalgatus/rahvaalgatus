var _ = require("root/lib/underscore")
var DateFns = require("date-fns")
var Config = require("root/config")
var Crypto = require("crypto")
var ValidUser = require("root/test/valid_user")
var ValidInitiative = require("root/test/valid_db_initiative")
var ValidSignature = require("root/test/valid_signature")
var ValidCitizenosSignature = require("root/test/valid_citizenos_signature")
var cli = require("root/cli/initiative_end_email_cli")
var newVote = require("root/test/citizenos_fixtures").newVote
var createVote = require("root/test/citizenos_fixtures").createVote
var newCitizenUser = require("root/test/citizenos_fixtures").newUser
var createCitizenUser = require("root/test/citizenos_fixtures").createUser
var createTopic = require("root/test/citizenos_fixtures").createTopic
var newTopic = require("root/test/citizenos_fixtures").newTopic
var usersDb = require("root/db/users_db")
var signaturesDb = require("root/db/initiative_signatures_db")
var citizenosSignaturesDb =
	require("root/db/initiative_citizenos_signatures_db")
var db = require("root/db/initiatives_db")
var t = require("root/lib/i18n").t.bind(null, Config.language)

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

		describe("given CitizenOS initiative", function() {
			it("must email when discussion has ended", function*() {
				var initiative = yield db.create(new ValidInitiative({
					user_id: this.user.id,
					published_at: new Date,
					discussion_ends_at: new Date
				}))

				yield createCitizenUser(newCitizenUser({id: this.user.uuid}))

				var topic = yield createTopic(newTopic({
					id: initiative.uuid,
					creatorId: this.user.uuid
				}))

				yield cli()
				this.emails.length.must.equal(1)

				var email = this.emails[0]
				email.envelope.to.must.eql([this.user.email])
				email.headers.subject.must.equal(t("DISCUSSION_END_EMAIL_SUBJECT"))

				email.body.must.equal(t("DISCUSSION_END_EMAIL_BODY", {
					initiativeTitle: topic.title,
					initiativeUrl: `${Config.url}/initiatives/${initiative.uuid}`,
					initiativeEditUrl: `${Config.url}/initiatives/${initiative.uuid}`,
					siteUrl: Config.url,
					facebookUrl: Config.facebookUrl,
					twitterUrl: Config.twitterUrl
				}))
			})
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
				discussion_ends_at: new Date
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
		it("must email when signing has ended and initiative successful",
			function*() {
			var initiative = yield db.create(new ValidInitiative({
				user_id: this.user.id,
				phase: "sign",
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

		describe("given CitizenOS initiative", function() {
			it("must email when signing has ended and initiative successful",
				function*() {
				var initiative = yield db.create(new ValidInitiative({
					user_id: this.user.id,
					phase: "sign",
					signing_ends_at: new Date
				}))

				yield createCitizenUser(newCitizenUser({id: this.user.uuid}))

				var topic = yield createTopic(newTopic({
					id: initiative.uuid,
					creatorId: this.user.uuid,
					status: "voting"
				}))

				yield createVote(topic, newVote())

				yield citizenosSignaturesDb.create(_.times(
					Config.votesRequired / 2,
					() => new ValidCitizenosSignature({initiative_uuid: initiative.uuid})
				))

				yield signaturesDb.create(_.times(Config.votesRequired / 2, () => (
					new ValidSignature({initiative_uuid: initiative.uuid})
				)))

				yield cli()
				this.emails.length.must.equal(1)

				var email = this.emails[0]
				email.envelope.to.must.eql([this.user.email])
				email.headers.subject.must.equal(
					t("SIGNING_END_COMPLETE_EMAIL_SUBJECT")
				)

				email.body.must.equal(t("SIGNING_END_COMPLETE_EMAIL_BODY", {
					initiativeTitle: topic.title,
					initiativeUrl: `${Config.url}/initiatives/${initiative.uuid}`,
					initiativeEditUrl: `${Config.url}/initiatives/${initiative.uuid}`,
					siteUrl: Config.url,
					facebookUrl: Config.facebookUrl,
					twitterUrl: Config.twitterUrl
				}))
			})
		})

		it("must email when signing has ended and initiative incomplete",
			function*() {
			var initiative = yield db.create(new ValidInitiative({
				user_id: this.user.id,
				phase: "sign",
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
				signing_ends_at: new Date
			}))

			yield signaturesDb.create(_.times(Config.votesRequired, () => (
				new ValidSignature({initiative_uuid: initiative.uuid})
			)))

			yield cli()
			this.emails.must.be.empty()
		})

		it("must email when signing ended 6 months ago", function*() {
			var initiative = yield db.create(new ValidInitiative({
				user_id: this.user.id,
				phase: "sign",
				signing_ends_at: DateFns.addMonths(new Date, -6)
			}))

			yield signaturesDb.create(_.times(Config.votesRequired, () => (
				new ValidSignature({initiative_uuid: initiative.uuid})
			)))

			yield cli()
			this.emails.length.must.equal(1)
		})

		it("must not email when signing ended more than 6 months ago", function*() {
			var initiative = yield db.create(new ValidInitiative({
				user_id: this.user.id,
				phase: "sign",
				signing_ends_at: DateFns.addSeconds(DateFns.addMonths(new Date, -6), -1)
			}))

			yield signaturesDb.create(_.times(Config.votesRequired, () => (
				new ValidSignature({initiative_uuid: initiative.uuid})
			)))

			yield cli()
			this.emails.length.must.equal(0)
		})

		it("must not email when signing not ended", function*() {
			yield db.create(new ValidInitiative({
				user_id: this.user.id,
				phase: "sign",
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
				signing_ends_at: new Date
			}))

			yield cli()
			this.emails.length.must.equal(1)

			yield cli()
			this.emails.length.must.equal(1)
		})
	})
})
