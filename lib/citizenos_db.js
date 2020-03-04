var _ = require("root/lib/underscore")
var Config = require("root/config")
var cosDb = require("root").cosDb
var sql = require("sqlate")
var concat = Array.prototype.concat.bind(Array.prototype)
var decodeEntities = require("ent").decode
var TITLE_REGEXP = /<h([1-6])>\s*([^<\s][^]*?)<\/h\1>/
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

	return cosDb.query(sql`
		WITH initiative_signatures AS (
			SELECT
				DISTINCT ON (topic.id, signature."userId")
				topic.id AS initiative_id,
				opt.value AS support

			FROM "Topics" as topic
			JOIN "TopicVotes" AS tv ON tv."topicId" = topic.id
			JOIN "Votes" AS vote ON vote.id = tv."voteId"
			JOIN "VoteLists" AS signature ON vote.id = signature."voteId"
			JOIN "VoteOptions" AS opt ON opt.id = signature."optionId"

			WHERE vote.id IS NOT NULL
			ORDER BY topic.id, signature."userId", signature."createdAt" DESC
		)

		SELECT
			initiative_id AS id,
			COUNT(CASE WHEN support = 'Yes' THEN 1 END) AS count

		FROM initiative_signatures
		WHERE initiative_id IN ${sql.in(ids)}
		GROUP BY initiative_id
	`).then(function(rows) {
		var counts = _.indexBy(rows, "id")
		return _.object(ids, (id) => id in counts ? Number(counts[id].count) : 0)
	})
}

function parseTopic(topic) {
	if (topic.votes) {
		topic.vote = topic.votes[0]
		topic.votes = undefined
	}

	if (topic.description) {
		var title = topic.description.match(TITLE_REGEXP)
		if (title) topic.title = decodeEntities(title[2]).trim()
		topic.html = normalizeInitiativeHtml(topic.description)
	}
	else topic.html = topic.description

	if (topic.vote) topic.vote.createdAt = new Date(topic.vote.createdAt)
	if (topic.vote) topic.vote.endsAt = new Date(topic.vote.endsAt)

	return topic
}

function normalizeInitiativeHtml(html) {
	html = html.replace(TITLE_REGEXP, "")
	html = html.match(/<body>([^]*)<\/body>/m)[1]
	html = html.replace(/<h([1-6])>\s*<\/h\1>/g, "")
	html = html.replace(/(?:<br>\s*)+(<h[1-6]>)/g, "$1")
	html = html.replace(/(<\/h[1-6]>)(?:\s*<br>)+/g, "$1")
	html = html.replace(/^\s*(?:<br>\s*)*/, "")
	html = html.replace(/(?:\s*<br>)*\s*$/, "")
	return html
}
