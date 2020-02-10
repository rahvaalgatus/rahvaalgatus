var _ = require("root/lib/underscore")
var Config = require("root/config")
var DateFns = require("date-fns")
var sql = require("sqlate")
var sendEmail = require("root").sendEmail
var concat = Array.prototype.concat.bind(Array.prototype)
var logger = require("root").logger
var t = require("root/lib/i18n").t.bind(null, Config.language)
var sqlite = require("root").sqlite
var usersDb = require("root/db/users_db")
var cosDb = require("root").cosDb
var db = require("root/db/initiatives_db")
var renderEmail = require("root/lib/i18n").email.bind(null, "et")
var {countSignaturesByIds} = require("root/lib/initiative")
var SIGS_REQUIRED = Config.votesRequired
var PARTNER_IDS = concat(Config.apiPartnerId, _.keys(Config.partners))
var NO_UUIDS = sql`SELECT NULL::uuid LIMIT 0`

module.exports = function*() {
	yield emailEndedDiscussions()
	yield emailEndedInitiatives()
}

function* emailEndedDiscussions() {
	var uuids = (yield sqlite(sql`
		SELECT uuid FROM initiatives WHERE discussion_end_email_sent_at IS NOT NULL
	`)).map((initiative) => initiative.uuid)

	var discussions = yield cosDb.query(sql`
		SELECT topic.id, topic.title
		FROM "Topics" AS topic
		WHERE topic.status = 'inProgress'
		AND topic."endsAt" >= ${DateFns.addMonths(new Date, -6)}
		AND topic."endsAt" <= ${new Date}
		AND topic.visibility = 'public'
		AND topic."deletedAt" IS NULL
		AND topic."sourcePartnerId" IN ${sql.in(PARTNER_IDS)}
		AND topic.id NOT IN (${uuids.length ? sql.csv(uuids) : NO_UUIDS})
	`)

	var users = yield searchUsersByUuids(_.map(discussions, "id"))

	yield discussions.map(function*(discussion) {
		var user = users[discussion.id]
		if (!(user.email && user.email_confirmed_at)) return

		logger.info(
			"Notifying %s of initiative %s discussion's end…",
			user.email,
			discussion.id
		)

		yield sendEmail({
			to: user.email,
			subject: t("DISCUSSION_END_EMAIL_SUBJECT"),
			text: renderEmail("DISCUSSION_END_EMAIL_BODY", {
				initiativeTitle: discussion.title,
				initiativeUrl: `${Config.url}/initiatives/${discussion.id}`,
				initiativeEditUrl: `${Config.url}/initiatives/${discussion.id}`
			})
		})

		yield db.update(discussion.id, {discussion_end_email_sent_at: new Date})
	})
}

function* emailEndedInitiatives() {
	var uuids = (yield sqlite(sql`
		SELECT uuid FROM initiatives WHERE signing_end_email_sent_at IS NOT NULL
	`)).map((initiative) => initiative.uuid)

	var topics = yield cosDb.query(sql`
		SELECT topic.id, topic.title
		FROM "Topics" AS topic
		JOIN "TopicVotes" AS tv ON tv."topicId" = topic.id
		JOIN "Votes" AS vote ON vote.id = tv."voteId"
		WHERE topic.status = 'voting'
		AND vote."endsAt" >= ${DateFns.addMonths(new Date, -6)}
		AND vote."endsAt" <= ${new Date}
		AND topic.visibility = 'public'
		AND topic."deletedAt" IS NULL
		AND topic."sourcePartnerId" IN ${sql.in(PARTNER_IDS)}
		AND topic.id NOT IN (${uuids.length ? sql.csv(uuids) : NO_UUIDS})
	`)

	var users = yield searchUsersByUuids(_.map(topics, "id"))
	var signatureCounts = yield countSignaturesByIds(topics.map((i) => i.id))

	yield topics.map(function*(topic) {
		var user = users[topic.id]
		if (!(user.email && user.email_confirmed_at)) return

		logger.info(
			"Notifying %s of initiative %s signing end…",
			user.email,
			topic.id
		)

		yield sendEmail({
			to: user.email,
			subject: signatureCounts[topic.id] >= SIGS_REQUIRED
				? t("SIGNING_END_COMPLETE_EMAIL_SUBJECT")
				: t("SIGNING_END_INCOMPLETE_EMAIL_SUBJECT"),

			text: renderEmail(signatureCounts[topic.id] >= SIGS_REQUIRED
				? "SIGNING_END_COMPLETE_EMAIL_BODY"
				: "SIGNING_END_INCOMPLETE_EMAIL_BODY", {
				initiativeTitle: topic.title,
				initiativeUrl: `${Config.url}/initiatives/${topic.id}`,
				initiativeEditUrl: `${Config.url}/initiatives/${topic.id}`
			})
		})

		yield db.update(topic.id, {signing_end_email_sent_at: new Date})
	})
}

function* searchUsersByUuids(uuids) {
	return _.indexBy(yield usersDb.search(sql`
		SELECT
			initiative.uuid AS initiative_uuid,
			user.email,
			user.email_confirmed_at

		FROM initiatives AS initiative
		JOIN users AS user ON initiative.user_id = user.id
		WHERE initiative.uuid IN ${sql.in(uuids)}
	`), "initiative_uuid")
}
