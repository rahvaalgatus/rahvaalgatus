var _ = require("root/lib/underscore")
var DateFns = require("date-fns")
var Config = require("root/config")
var ValidUser = require("root/test/valid_user")
var ValidInitiative = require("root/test/valid_db_initiative")
var cli = require("root/cli/initiative_end_email_cli")
var newPartner = require("root/test/citizenos_fixtures").newPartner
var newVote = require("root/test/citizenos_fixtures").newVote
var createPartner = require("root/test/citizenos_fixtures").createPartner
var createVote = require("root/test/citizenos_fixtures").createVote
var createSignatures = require("root/test/citizenos_fixtures").createSignatures
var newCitizenUser = require("root/test/citizenos_fixtures").newUser
var createCitizenUser = require("root/test/citizenos_fixtures").createUser
var pseudoHex = require("root/lib/crypto").pseudoHex
var cosDb = require("root").cosDb
var usersDb = require("root/db/users_db")
var db = require("root/db/initiatives_db")
var sql = require("sqlate")

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

		yield createCitizenUser(newCitizenUser({
			id: this.user.uuid,
			email: "john@example.com",
		}))

		this.partner = yield createPartner(newPartner({id: Config.apiPartnerId}))
	})
	
	describe("when in discussion", function() {
		it("must email when discussion has ended", function*() {
			var initiative = yield db.create(new ValidInitiative({
				user_id: this.user.id
			}))

			yield createTopic({
				id: initiative.uuid,
				creatorId: this.user.uuid,
				endsAt: new Date
			})

			yield cli()
			this.emails.length.must.equal(1)
			this.emails[0].envelope.to.must.eql([this.user.email])
			var body = String(this.emails[0].message)
			body.must.not.include("undefined")
		})

		it("must email when discussion ended 6 months ago", function*() {
			var initiative = yield db.create(new ValidInitiative({
				user_id: this.user.id
			}))

			yield createTopic({
				id: initiative.uuid,
				creatorId: this.user.uuid,
				endsAt: DateFns.addMonths(new Date, -6)
			})

			yield cli()
			this.emails.length.must.equal(1)
		})

		it("must not email when discussion ended more than 6 months ago",
			function*() {
			var initiative = yield db.create(new ValidInitiative({
				user_id: this.user.id
			}))

			yield createTopic({
				id: initiative.uuid,
				creatorId: this.user.uuid,
				endsAt: DateFns.addSeconds(DateFns.addMonths(new Date, -6), -1)
			})

			yield cli()
			this.emails.length.must.equal(0)
		})

		it("must not email when discussion not ended", function*() {
			var initiative = yield db.create(new ValidInitiative({
				user_id: this.user.id
			}))

			yield createTopic({
				id: initiative.uuid,
				creatorId: this.user.uuid,
				endsAt: DateFns.addSeconds(new Date, 1)
			})

			yield cli()
			this.emails.must.be.empty()
		})

		it("must not email if user email not set", function*() {
			yield cosDb.query(sql`UPDATE "Users" SET email = NULL`)

			var initiative = yield db.create(new ValidInitiative({
				user_id: this.user.id
			}))

			yield createTopic({
				id: initiative.uuid,
				creatorId: this.user.uuid,
				endsAt: new Date
			})

			yield cli()
			this.emails.must.be.empty()
		})

		it("must not email if user email not verified", function*() {
			yield cosDb.query(sql`UPDATE "Users" SET "emailIsVerified" = false`)

			var initiative = yield db.create(new ValidInitiative({
				user_id: this.user.id
			}))

			yield createTopic({
				id: initiative.uuid,
				creatorId: this.user.uuid,
				endsAt: new Date
			})

			yield cli()
			this.emails.must.be.empty()
		})

		it("must not email if not public", function*() {
			var initiative = yield db.create(new ValidInitiative({
				user_id: this.user.id
			}))

			yield createTopic({
				id: initiative.uuid,
				creatorId: this.user.uuid,
				endsAt: new Date,
				visibility: "private"
			})

			yield cli()
			this.emails.must.be.empty()
		})

		it("must email when discussion deleted", function*() {
			var initiative = yield db.create(new ValidInitiative({
				user_id: this.user.id
			}))

			yield createTopic({
				id: initiative.uuid,
				creatorId: this.user.uuid,
				endsAt: new Date,
				deletedAt: new Date
			})

			yield cli()
			this.emails.must.be.empty()
		})

		it("must not email if vote already created", function*() {
			var initiative = yield db.create(new ValidInitiative({
				user_id: this.user.id,
				phase: "sign"
			}))

			yield createTopic({
				id: initiative.uuid,
				creatorId: this.user.uuid,
				endsAt: new Date,
				status: "voting"
			})

			yield cli()
			this.emails.must.be.empty()
		})

		// Safety net for when running development on a shared server.
		it("must not email about other partners", function*() {
			var partner = yield createPartner(newPartner())

			var initiative = yield db.create(new ValidInitiative({
				user_id: this.user.id
			}))

			yield createTopic({
				id: initiative.uuid,
				creatorId: this.user.uuid,
				sourcePartnerId: partner.id,
				endsAt: new Date
			})

			yield cli()
			this.emails.must.be.empty()
		})

		it("must not email twice", function*() {
			var initiative = yield db.create(new ValidInitiative({
				user_id: this.user.id
			}))

			yield createTopic({
				id: initiative.uuid,
				creatorId: this.user.uuid,
				endsAt: new Date
			})

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
				phase: "sign"
			}))

			var topic = yield createTopic({
				id: initiative.uuid,
				creatorId: this.user.uuid,
				status: "voting"
			})

			var vote = yield createVote(topic, newVote({endsAt: new Date}))
			yield createSignatures(vote, Config.votesRequired)

			yield cli()
			this.emails.length.must.equal(1)
			this.emails[0].envelope.to.must.eql([this.user.email])
			var body = String(this.emails[0].message)
			body.must.not.include("undefined")
		})

		it("must email when signing has ended and initiative incomplete",
			function*() {
			var initiative = yield db.create(new ValidInitiative({
				user_id: this.user.id,
				phase: "sign"
			}))

			var topic = yield createTopic({
				id: initiative.uuid,
				creatorId: this.user.uuid,
				status: "voting"
			})

			var vote = yield createVote(topic, newVote({endsAt: new Date}))
			yield createSignatures(vote, Config.votesRequired - 1)

			yield cli()
			this.emails.length.must.equal(1)
			this.emails[0].envelope.to.must.eql([this.user.email])
			var body = String(this.emails[0].message)
			body.must.not.include("undefined")
		})

		it("must email when signing ended 6 months ago", function*() {
			var initiative = yield db.create(new ValidInitiative({
				user_id: this.user.id,
				phase: "sign"
			}))

			var topic = yield createTopic({
				id: initiative.uuid,
				creatorId: this.user.uuid,
				status: "voting"
			})

			var vote = yield createVote(topic, newVote({
				endsAt: DateFns.addMonths(new Date, -6)
			}))

			yield createSignatures(vote, Config.votesRequired)
			yield cli()
			this.emails.length.must.equal(1)
		})

		it("must not email when signing ended more than 6 months ago", function*() {
			var initiative = yield db.create(new ValidInitiative({
				user_id: this.user.id,
				phase: "sign"
			}))

			var topic = yield createTopic({
				id: initiative.uuid,
				creatorId: this.user.uuid,
				status: "voting"
			})

			var vote = yield createVote(topic, newVote({
				endsAt: DateFns.addSeconds(DateFns.addMonths(new Date, -6), -1)
			}))

			yield createSignatures(vote, Config.votesRequired)
			yield cli()
			this.emails.length.must.equal(0)
		})

		it("must not email when signing not ended", function*() {
			var initiative = yield db.create(new ValidInitiative({
				user_id: this.user.id,
				phase: "sign"
			}))

			var topic = yield createTopic({
				id: initiative.uuid,
				creatorId: this.user.uuid,
				status: "voting"
			})

			yield createVote(topic, newVote({
				endsAt: DateFns.addSeconds(new Date, 1)
			}))

			yield cli()
			this.emails.must.be.empty()
		})

		it("must not email if user email not set", function*() {
			yield cosDb.query(sql`UPDATE "Users" SET email = NULL`)

			var initiative = yield db.create(new ValidInitiative({
				user_id: this.user.id,
				phase: "sign"
			}))

			var topic = yield createTopic({
				id: initiative.uuid,
				creatorId: this.user.uuid,
				status: "voting"
			})

			yield createVote(topic, newVote({endsAt: new Date}))
			yield cli()
			this.emails.must.be.empty()
		})

		it("must not email if user email not verified", function*() {
			yield cosDb.query(sql`UPDATE "Users" SET "emailIsVerified" = false`)

			var initiative = yield db.create(new ValidInitiative({
				user_id: this.user.id,
				phase: "sign"
			}))

			var topic = yield createTopic({
				id: initiative.uuid,
				creatorId: this.user.uuid,
				status: "voting"
			})

			yield createVote(topic, newVote({endsAt: new Date}))
			yield cli()
			this.emails.must.be.empty()
		})

		it("must not email if not public", function*() {
			var initiative = yield db.create(new ValidInitiative({
				user_id: this.user.id,
				phase: "sign"
			}))

			var topic = yield createTopic({
				id: initiative.uuid,
				creatorId: this.user.uuid,
				visibility: "private",
				status: "voting"
			})

			yield createVote(topic, newVote({endsAt: new Date}))
			yield cli()
			this.emails.must.be.empty()
		})

		it("must not email if not public", function*() {
			var initiative = yield db.create(new ValidInitiative({
				user_id: this.user.id,
				phase: "sign"
			}))

			var topic = yield createTopic({
				id: initiative.uuid,
				creatorId: this.user.uuid,
				deletedAt: new Date,
				status: "voting"
			})

			yield createVote(topic, newVote({endsAt: new Date}))
			yield cli()
			this.emails.must.be.empty()
		})

		// Safety net for when running development on a shared server.
		it("must not email about other partners", function*() {
			var partner = yield createPartner(newPartner())

			var initiative = yield db.create(new ValidInitiative({
				user_id: this.user.id,
				phase: "sign"
			}))

			var topic = yield createTopic({
				id: initiative.uuid,
				creatorId: this.user.uuid,
				sourcePartnerId: partner.id,
				status: "voting"
			})

			yield createVote(topic, newVote({endsAt: new Date}))
			yield cli()
			this.emails.must.be.empty()
		})

		it("must not email twice", function*() {
			var initiative = yield db.create(new ValidInitiative({
				user_id: this.user.id,
				phase: "sign"
			}))

			var topic = yield createTopic({
				id: initiative.uuid,
				creatorId: this.user.uuid,
				status: "voting"
			})

			yield createVote(topic, newVote({endsAt: new Date}))

			yield cli()
			this.emails.length.must.equal(1)

			yield cli()
			this.emails.length.must.equal(1)
		})
	})
})

function createTopic(attrs) {
	return cosDb("Topics").insert(_.assign({
		id: _.serializeUuid(_.uuidV4()),
		title: "For the win",
		description: "Please sign.",
		status: "inProgress",
		visibility: "public",
		createdAt: new Date(2015, 0, 1),
		updatedAt: new Date(2015, 0, 1),
		tokenJoin: pseudoHex(4),
		padUrl: "/etherpad",
		sourcePartnerId: Config.apiPartnerId
	}, attrs)).returning("*").then(_.first)
}
