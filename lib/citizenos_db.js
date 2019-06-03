var _ = require("root/lib/underscore")
var cosDb = require("root").cosDb
var sql = require("sqlate")
var EMPTY_PROMISE = Promise.resolve({})

exports.countSignaturesById = function(id) {
	return exports.countSignaturesByIds([id]).then(function(counts) {
		return id in counts ? counts[id] : null
	})
}

exports.countSignaturesByIds = function(ids) {
	if (ids.length == 0) return EMPTY_PROMISE

	return cosDb.query(sql`
		WITH initiative_signatures AS (
			SELECT
				DISTINCT ON (initiative.id, signature."userId")
				initiative.id AS initiative_id,
				opt.value AS support

			FROM "Topics" as initiative
			JOIN "TopicVotes" AS tv ON tv."topicId" = initiative.id
			JOIN "Votes" AS vote ON vote.id = tv."voteId"
			JOIN "VoteLists" AS signature ON vote.id = signature."voteId"
			JOIN "VoteOptions" AS opt ON opt.id = signature."optionId"

			WHERE vote.id IS NOT NULL
			ORDER BY initiative.id, signature."userId", signature."createdAt" DESC
		)

		SELECT
			initiative_id AS id,
			COUNT(CASE WHEN support = 'Yes' THEN 1 END) AS count

		FROM initiative_signatures
		WHERE initiative_id IN ${sql.tuple(ids)}
		GROUP BY initiative_id
	`).then(function(rows) {
		var counts = _.indexBy(rows, "id")
		return _.object(ids, (id) => id in counts ? Number(counts[id].count) : 0)
	})
}
