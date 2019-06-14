var _ = require("root/lib/underscore")
var Config = require("root/config")
var cosDb = require("root").cosDb
var sql = require("sqlate")
var cosApi = require("root/lib/citizenos_api")
var concat = Array.prototype.concat.bind(Array.prototype)
var parseCitizenInitiative = cosApi.parseCitizenInitiative
var EMPTY_PROMISE = Promise.resolve({})
var PARTNER_IDS = concat(Config.apiPartnerId, _.keys(Config.partners))

exports.searchInitiatives = function*(filter) {
	var initiatives = yield cosDb.query(sql`
		SELECT
			initiative.*,

			COALESCE(
				json_agg("user".*) FILTER (WHERE "user".id IS NOT NULL),
				'[]'
			) AS creators,

			COALESCE(
				json_agg(vote.*) FILTER (WHERE vote.id IS NOT NULL),
				'[]'
			) AS votes

		FROM "Topics" AS initiative
		JOIN "Users" AS "user" ON "user".id = initiative."creatorId"
		LEFT JOIN "TopicVotes" AS tv ON tv."topicId" = initiative.id
		LEFT JOIN "Votes" AS vote ON vote.id = tv."voteId"

		WHERE (${filter || sql`1 = 1`})
		AND initiative.visibility = 'public'
		AND initiative."deletedAt" IS NULL
		AND initiative."sourcePartnerId" IN ${sql.tuple(PARTNER_IDS)}
		GROUP BY initiative.id
	`).then((rows) => rows.map(parseInitiative))

	var uuids = initiatives.map((i) => i.id)
	var signatureCounts = yield exports.countSignaturesByIds(uuids)
	initiatives.forEach((t) => t.signatureCount = signatureCounts[t.id] || 0)

	return initiatives
}

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

function parseInitiative(initiative) {
	initiative.creator = initiative.creators[0]
	initiative.vote = initiative.votes[0]

	return parseCitizenInitiative(initiative)
}
