var _ = require("root/lib/underscore")
var cosDb = require("root").cosDb
var pseudoHex = require("root/lib/crypto").pseudoHex
exports.newPartner = newPartner
exports.newUser = newUser
exports.newTopic = newTopic
exports.newVote = newVote
exports.newPermission = newPermission
exports.createPartner = createPartner
exports.createUser = createUser
exports.createTopic = createTopic
exports.createVote = createVote
exports.createPermission = createPermission

var VISIBILITY_FROM_STATUS = {
	voting: "public",
	followUp: "public",
	closed: "public"
}

function newUser(attrs) {
	return _.assign({
		id: _.serializeUuid(_.uuidV4()),
		email: _.uniqueId("user") + "@example.com",
		emailIsVerified: true,
		emailVerificationCode: _.serializeUuid(_.uuidV4()),
		createdAt: new Date,
		updatedAt: new Date,
		source: "citizenos"
	}, attrs)
}

function newTopic(attrs) {
	return _.assign({
		id: _.serializeUuid(_.uuidV4()),
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
		id: _.serializeUuid(_.uuidV4()),
		createdAt: new Date(2015, 0, 1),
		updatedAt: new Date(2015, 0, 1),
		authType: "hard"
	}, attrs)
}

function newPartner(attrs) {
	return _.assign({
		id: _.serializeUuid(_.uuidV4()),
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
