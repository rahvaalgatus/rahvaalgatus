var _ = require("root/lib/underscore")
var Config = require("root/config")
var cosDb = require("root").cosDb
var sql = require("sqlate")
var concat = Array.prototype.concat.bind(Array.prototype)
var sqlite = require("root").sqlite
var EMPTY_PROMISE = Promise.resolve({})
var PARTNER_IDS = concat(Config.apiPartnerId, _.keys(Config.partners))
exports.parseTopic = parseTopic

exports.searchTopics = function(filter) {
	return cosDb.query(sql`
		SELECT
			topic.*,

			COALESCE(
				json_agg(vote.*) FILTER (WHERE vote.id IS NOT NULL),
				'[]'
			) AS votes

		FROM "Topics" AS topic
		LEFT JOIN "TopicVotes" AS tv ON tv."topicId" = topic.id
		LEFT JOIN "Votes" AS vote ON vote.id = tv."voteId"

		WHERE (${filter || sql`1 = 1`})
		AND topic."deletedAt" IS NULL
		AND topic."sourcePartnerId" IN ${sql.in(PARTNER_IDS)}
		GROUP BY topic.id
	`).then((rows) => rows.map(parseTopic))
}

exports.countSignaturesById = function(id) {
	return exports.countSignaturesByIds([id]).then(function(counts) {
		return id in counts ? counts[id] : null
	})
}

exports.countSignaturesByIds = function(ids) {
	if (ids.length == 0) return EMPTY_PROMISE

	return sqlite(sql`
		SELECT initiative_uuid, COUNT(*) AS count
		FROM initiative_citizenos_signatures
		WHERE initiative_uuid IN ${sql.in(ids)}
		GROUP BY initiative_uuid
	`).then(function(rows) {
		var counts = _.indexBy(rows, "initiative_uuid")
		return _.object(ids, (id) => id in counts ? counts[id].count : 0)
	})
}

function parseTopic(topic) {
	if (topic.votes) {
		topic.vote = topic.votes[0]
		topic.votes = undefined
	}

	if (topic.vote) {
		topic.vote.createdAt = new Date(topic.vote.createdAt)
		topic.vote.endsAt = new Date(topic.vote.endsAt)
	}

	return topic
}
