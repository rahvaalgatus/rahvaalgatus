var _ = require("root/lib/underscore")
var DateFns = require("date-fns")
var cosDb = require("root").cosDb
var newUuid = require("uuid/v4")
var pseudoHex = require("root/lib/crypto").pseudoHex
var isArray = Array.isArray
exports.newPartner = newPartner
exports.newUser = newUser
exports.newTopic = newTopic
exports.newVote = newVote
exports.newPermission = newPermission
exports.newSignature = newSignature
exports.createPartner = createPartner
exports.createUser = createUser
exports.createTopic = createTopic
exports.createVote = createVote
exports.createPermission = createPermission
exports.createOptions = createOptions
exports.createSignature = createSignature
exports.createSignatures = createSignatures

var VISIBILITY_FROM_STATUS = {
	voting: "public",
	followUp: "public",
	closed: "public"
}

function newUser(attrs) {
	return _.assign({
		id: newUuid(),
		email: _.uniqueId("user") + "@example.com",
		emailIsVerified: true,
		emailVerificationCode: newUuid(),
		createdAt: new Date,
		updatedAt: new Date,
		source: "citizenos"
	}, attrs)
}

function newTopic(attrs) {
	return _.assign({
		id: newUuid(),
		title: "For the win " + _.uniqueId(),
		description: "<body>Please sign.</body>",
		status: "inProgress",
		visibility: VISIBILITY_FROM_STATUS[attrs.status] || "private",
		createdAt: new Date,
		updatedAt: new Date,
		tokenJoin: pseudoHex(4),
		padUrl: "/etherpad"
	}, attrs)
}

function newVote(attrs) {
	return _.assign({
		id: newUuid(),
		createdAt: new Date(2015, 0, 1),
		updatedAt: new Date(2015, 0, 1),
		authType: "hard"
	}, attrs)
}

function newPartner(attrs) {
	return _.assign({
		id: newUuid(),
		website: "http://example.com",
		redirectUriRegexp: "",
		createdAt: new Date,
		updatedAt: new Date
	}, attrs)
}

function newPermission(attrs) {
	return _.assign({
		createdAt: new Date,
		updatedAt: new Date
	}, attrs)
}

function createUser(user) {
	return cosDb("Users").insert(user).returning("*").then(_.first)
}

function createPartner(partner) {
	return cosDb("Partners").insert(partner).returning("*").then(_.first)
}

function createTopic(topic) {
	return cosDb("Topics").insert(topic).returning("*").then(_.first)
}

function createPermission(perm) {
	return cosDb("TopicMemberUsers").insert(perm).returning("*").then(_.first)
}

function* createVote(topic, attrs) {
	var vote = yield cosDb("Votes").insert(attrs).returning("*").then(_.first)

	yield cosDb("TopicVotes").insert({
		topicId: topic.id,
		voteId: vote.id,
		createdAt: new Date(2015, 0, 1),
		updatedAt: new Date(2015, 0, 1),
	})

	return vote
}

function* createOptions(vote) {
	var yes = yield cosDb("VoteOptions").insert({
		id: newUuid(),
		voteId: vote.id,
		value: "Yes",
		createdAt: new Date(2015, 0, 1),
		updatedAt: new Date(2015, 0, 1),
	}).returning("id").then(_.first)

	var no = yield cosDb("VoteOptions").insert({
		id: newUuid(),
		voteId: vote.id,
		value: "No",
		createdAt: new Date(2015, 0, 1),
		updatedAt: new Date(2015, 0, 1),
	}).returning("id").then(_.first)

	return [yes, no]
}

function newSignature(attrs) {
	return _.assign({
		optionGroupId: pseudoHex(4),
		createdAt: new Date,
		updatedAt: new Date
	}, attrs)
}

function createSignature(signature) {
	var get = isArray(signature) ? _.id : _.first
	return cosDb("VoteLists").insert(signature).returning("*").then(get)
}

function* createSignatures(vote, n) {
	var yesAndNo = yield createOptions(vote)
	var users = yield _.times(n, _.compose(createUser, newUser))

	return createSignature(users.map((user, i) => newSignature({
		userId: user.id,
		voteId: vote.id,
		optionId: yesAndNo[0],
		createdAt: DateFns.addMinutes(new Date, -n + i)
	})))
}
