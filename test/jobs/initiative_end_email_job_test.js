var _ = require("root/lib/underscore")
var DateFns = require("date-fns")
var Config = require("root/config")
var job = require("root/jobs/initiative_end_email_job")
var newUuid = require("uuid/v4")
var pseudoHex = require("root/lib/crypto").pseudoHex
var cosDb = require("root").cosDb
var sql = require("sqlate")
var PARTNER_ID = Config.apiPartnerId

describe("InitiativeEndEmailJob", function() {
	require("root/test/mitm")()
	require("root/test/db")()
	require("root/test/email")()
	require("root/test/time")(new Date(2015, 5, 18, 13, 37, 42))
	beforeEach(require("root/test/mitm").router)

	beforeEach(function*() {
		this.user = yield cosDb("Users").insert({
			id: newUuid(),
			email: "user@example.com",
			emailIsVerified: true,
			emailVerificationCode: newUuid(),
			createdAt: new Date,
			updatedAt: new Date,
			source: "citizenos"
		}).returning("*").then(_.first)

		this.partner = yield cosDb("Partners").insert({
			id: PARTNER_ID,
			website: "http://example.com",
			redirectUriRegexp: "",
			createdAt: new Date,
			updatedAt: new Date
		}).returning("*").then(_.first)
	})
	
	describe("when in discussion", function() {
		it("must email when discussion has ended", function*() {
			yield createTopic({creatorId: this.user.id, endsAt: new Date})

			yield job()
			this.emails.length.must.equal(1)
			this.emails[0].envelope.to.must.eql(["user@example.com"])
			var body = String(this.emails[0].message)
			body.must.not.include("undefined")
		})

		it("must not email when discussion not ended", function*() {
			yield createTopic({
				creatorId: this.user.id,
				endsAt: DateFns.addSeconds(new Date, 1)
			})

			yield job()
			this.emails.must.be.empty()
		})

		it("must not email if user email not set", function*() {
			yield cosDb.query(sql`UPDATE "Users" SET email = NULL`)
			yield createTopic({creatorId: this.user.id, endsAt: new Date})
			yield job()
			this.emails.must.be.empty()
		})

		it("must not email if user email not verified", function*() {
			yield cosDb.query(sql`UPDATE "Users" SET "emailIsVerified" = false`)
			yield createTopic({creatorId: this.user.id, endsAt: new Date})
			yield job()
			this.emails.must.be.empty()
		})

		it("must not email if not public", function*() {
			yield createTopic({
				creatorId: this.user.id,
				endsAt: new Date,
				visibility: "private"
			})

			yield job()
			this.emails.must.be.empty()
		})

		it("must not email if vote already created", function*() {
			yield createTopic({
				creatorId: this.user.id,
				endsAt: new Date,
				status: "voting"
			})

			yield job()
			this.emails.must.be.empty()
		})

		// Safety net for when running development on a shared server.
		it("must not email about other partners", function*() {
			var partner = yield cosDb("Partners").insert({
				id: newUuid(),
				website: "http://example.com",
				redirectUriRegexp: "",
				createdAt: new Date,
				updatedAt: new Date
			}).returning("*").then(_.first)

			yield createTopic({
				creatorId: this.user.id,
				sourcePartnerId: partner.id,
				endsAt: new Date
			})

			yield job()
			this.emails.must.be.empty()
		})

		it("must not email twice", function*() {
			yield createTopic({creatorId: this.user.id, endsAt: new Date})

			yield job()
			this.emails.length.must.equal(1)

			yield job()
			this.emails.length.must.equal(1)
		})
	})

	describe("when in signing", function() {
		it("must email when signing has ended", function*() {
			var topic = yield createTopic({creatorId: this.user.id, status: "voting"})
			yield createVote(topic, {endsAt: new Date})

			yield job()
			this.emails.length.must.equal(1)
			this.emails[0].envelope.to.must.eql(["user@example.com"])
			var body = String(this.emails[0].message)
			body.must.not.include("undefined")
		})

		it("must not email when signing not ended", function*() {
			var topic = yield createTopic({creatorId: this.user.id, status: "voting"})
			yield createVote(topic, {endsAt: DateFns.addSeconds(new Date, 1)})
			yield job()
			this.emails.must.be.empty()
		})

		it("must not email if user email not set", function*() {
			yield cosDb.query(sql`UPDATE "Users" SET email = NULL`)
			var topic = yield createTopic({creatorId: this.user.id, status: "voting"})
			yield createVote(topic, {endsAt: new Date})
			yield job()
			this.emails.must.be.empty()
		})

		it("must not email if user email not verified", function*() {
			yield cosDb.query(sql`UPDATE "Users" SET "emailIsVerified" = false`)
			var topic = yield createTopic({creatorId: this.user.id, status: "voting"})
			yield createVote(topic, {endsAt: new Date})
			yield job()
			this.emails.must.be.empty()
		})

		it("must not email if not public", function*() {
			var topic = yield createTopic({
				creatorId: this.user.id,
				visibility: "private",
				status: "voting"
			})

			yield createVote(topic, {endsAt: new Date})
			yield job()
			this.emails.must.be.empty()
		})
		//
		// Safety net for when running development on a shared server.
		it("must not email about other partners", function*() {
			var partner = yield cosDb("Partners").insert({
				id: newUuid(),
				website: "http://example.com",
				redirectUriRegexp: "",
				createdAt: new Date,
				updatedAt: new Date
			}).returning("*").then(_.first)

			var topic = yield createTopic({
				creatorId: this.user.id,
				sourcePartnerId: partner.id,
				status: "voting"
			})

			yield createVote(topic, {endsAt: new Date})
			yield job()
			this.emails.must.be.empty()
		})

		it("must not email twice", function*() {
			var topic = yield createTopic({creatorId: this.user.id, status: "voting"})
			yield createVote(topic, {endsAt: new Date})

			yield job()
			this.emails.length.must.equal(1)

			yield job()
			this.emails.length.must.equal(1)
		})
	})
})

function createTopic(attrs) {
	return cosDb("Topics").insert(_.assign({
		id: newUuid(),
		title: "For the win",
		description: "Please sign.",
		status: "inProgress",
		visibility: "public",
		createdAt: new Date(2015, 0, 1),
		updatedAt: new Date(2015, 0, 1),
		tokenJoin: pseudoHex(4),
		padUrl: "/etherpad",
		sourcePartnerId: PARTNER_ID
	}, attrs)).returning("*").then(_.first)
}

function* createVote(topic, attrs) {
	var vote = yield cosDb("Votes").insert(_.assign({
		id: newUuid(),
		createdAt: new Date(2015, 0, 1),
		updatedAt: new Date(2015, 0, 1),
		authType: "hard"
	}, attrs)).returning("*").then(_.first)

	yield cosDb("TopicVotes").insert({
		topicId: topic.id,
		voteId: vote.id,
		createdAt: new Date(2015, 0, 1),
		updatedAt: new Date(2015, 0, 1),
	})

	return vote
}
