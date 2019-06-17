var _ = require("root/lib/underscore")
var newUuid = require("uuid/v4")
var countSignaturesById = require("root/lib/citizenos_db").countSignaturesById
var countSignaturesByIds = require("root/lib/citizenos_db").countSignaturesByIds
var flatten = Function.apply.bind(Array.prototype.concat, Array.prototype)
var newUser = require("root/test/citizenos_fixtures").newUser
var newTopic = require("root/test/citizenos_fixtures").newTopic
var newVote = require("root/test/citizenos_fixtures").newVote
var newSignature = require("root/test/citizenos_fixtures").newSignature
var createUser = require("root/test/citizenos_fixtures").createUser
var createTopic = require("root/test/citizenos_fixtures").createTopic
var createVote = require("root/test/citizenos_fixtures").createVote
var createOptions = require("root/test/citizenos_fixtures").createOptions
var createSignature = require("root/test/citizenos_fixtures").createSignature

describe("CitizenosDb", function() {
	require("root/test/db")()

	describe(".countSignaturesById", function() {
		beforeEach(function*() {
			var user = yield createUser(newUser())
			this.topic = yield createTopic(newTopic({creatorId: user.id}))
			this.vote = yield createVote(this.topic, newVote())
			this.yesAndNo = yield createOptions(this.vote)
		})

		it("must return 0 for existing initiative", function*() {
			yield countSignaturesById(this.topic.id).must.then.equal(0)
		})

		it("must return null for non-existing initiative", function*() {
			yield countSignaturesById(newUuid()).must.then.equal(0)
		})

		it("must count only Yes signatures", function*() {
			var users = yield _.times(10, _.compose(createUser, newUser))

			yield createSignature(users.map((user, i) => newSignature({
				userId: user.id,
				voteId: this.vote.id,
				optionId: this.yesAndNo[i % 2]
			})))

			yield countSignaturesById(this.topic.id).must.then.equal(users.length / 2)
		})

		it("must count the latest Yes signature", function*() {
			var users = yield _.times(3, _.compose(createUser, newUser))

			yield createSignature(flatten(users.map((user, i) => [
				newSignature({
					userId: user.id,
					voteId: this.vote.id,
					optionId: this.yesAndNo[(i + 1) % 2],
					createdAt: new Date(2015, 0, 1)
				}),

				newSignature({
					userId: user.id,
					voteId: this.vote.id,
					optionId: this.yesAndNo[i % 2],
					createdAt: new Date(2015, 0, 2)
				})
			])))

			yield countSignaturesById(this.topic.id).must.then.equal(2)
		})
	})

	describe(".countSignaturesByIds", function() {
		beforeEach(function*() {
			var user = yield createUser(newUser())

			this.topics = yield _.times(5, (_i) => (
				createTopic(newTopic({creatorId: user.id}))
			))

			this.votes = yield this.topics.map((t) => createVote(t, newVote()))
			this.yesAndNos = yield this.votes.map(createOptions)
		})

		it("must return an empty object given no initiatives", function*() {
			yield countSignaturesByIds([]).must.then.eql({})
		})

		it("must return 0s for existing initiatives", function*() {
			var ids = this.topics.map((t) => t.id)
			yield countSignaturesByIds(ids).must.then.eql(_.object(ids, () => 0))
		})

		it("must return 0s for non-existing initiatives", function*() {
			var ids = _.times(3, newUuid)
			yield countSignaturesByIds(ids).must.then.eql(_.object(ids, () => 0))
		})

		it("must count only Yes signatures", function*() {
			var users = yield _.times(12, _.compose(createUser, newUser))

			var sigs = flatten(users.map((user, i) => this.topics.map((_t, j) => (
				newSignature({
					userId: user.id,
					voteId: this.votes[j].id,
					optionId: this.yesAndNos[j][(j & 1 ? i % 2 : i % 3) && 1]
				})
			))))

			yield createSignature(sigs)

			var ids = this.topics.map((t) => t.id)
			yield countSignaturesByIds(ids).must.then.eql(_.object(ids, (_t, i) => (
				i & 1 ? users.length / 2 : users.length / 3
			)))
		})
	})
})
