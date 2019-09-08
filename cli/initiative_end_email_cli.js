var _ = require("root/lib/underscore")
var Config = require("root/config")
var DateFns = require("date-fns")
var sql = require("sqlate")
var sendEmail = require("root").sendEmail
var concat = Array.prototype.concat.bind(Array.prototype)
var logger = require("root").logger
var t = require("root/lib/i18n").t.bind(null, Config.language)
var sqlite = require("root").sqlite
var cosDb = require("root").cosDb
var initiativesDb = require("root/db/initiatives_db")
var renderEmail = require("root/lib/i18n").email.bind(null, "et")
var countSignaturesByIds = require("root/lib/citizenos_db").countSignaturesByIds
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
		SELECT topic.id, topic.title, "user".email AS user_email
		FROM "Topics" AS topic
		JOIN "Users" AS "user" ON "user".id = topic."creatorId"
		WHERE topic.status = 'inProgress'
		AND topic."endsAt" >= ${DateFns.addMonths(new Date, -6)}
		AND topic."endsAt" <= ${new Date}
		AND topic.visibility = 'public'
		AND topic."deletedAt" IS NULL
		AND topic."sourcePartnerId" IN ${sql.in(PARTNER_IDS)}
		AND topic.id NOT IN (${uuids.length ? sql.csv(uuids) : NO_UUIDS})
		AND "user".email IS NOT NULL
		AND "user"."emailIsVerified"
	`)

	yield discussions.map(function*(discussion) {
		logger.info(
			"Notifying %s of initiative %s discussion's end…",
			discussion.user_email,
			discussion.id
		)

		yield sendEmail({
			to: discussion.user_email,
			subject: t("DISCUSSION_END_EMAIL_SUBJECT"),
			text: renderEmail("DISCUSSION_END_EMAIL_BODY", {
				initiativeTitle: discussion.title,
				initiativeUrl: `${Config.url}/initiatives/${discussion.id}`,
				initiativeEditUrl: `${Config.url}/initiatives/${discussion.id}`
			})
		})

		yield replaceInitiative(discussion.id, {
			discussion_end_email_sent_at: new Date
		})
	})
}

function* emailEndedInitiatives() {
	var uuids = (yield sqlite(sql`
		SELECT uuid FROM initiatives WHERE signing_end_email_sent_at IS NOT NULL
	`)).map((initiative) => initiative.uuid)

	var topics = yield cosDb.query(sql`
		SELECT topic.id, topic.title, "user".email AS user_email
		FROM "Topics" AS topic
		JOIN "Users" AS "user" ON "user".id = topic."creatorId"
		JOIN "TopicVotes" AS tv ON tv."topicId" = topic.id
		JOIN "Votes" AS vote ON vote.id = tv."voteId"
		WHERE topic.status = 'voting'
		AND vote."endsAt" >= ${DateFns.addMonths(new Date, -6)}
		AND vote."endsAt" <= ${new Date}
		AND topic.visibility = 'public'
		AND topic."deletedAt" IS NULL
		AND topic."sourcePartnerId" IN ${sql.in(PARTNER_IDS)}
		AND topic.id NOT IN (${uuids.length ? sql.csv(uuids) : NO_UUIDS})
		AND "user".email IS NOT NULL
		AND "user"."emailIsVerified"
	`)

	var signatureCounts = yield countSignaturesByIds(topics.map((i) => i.id))

	yield topics.map(function*(topic) {
		logger.info(
			"Notifying %s of initiative %s signing end…",
			topic.user_email,
			topic.id
		)

		yield sendEmail({
			to: topic.user_email,
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

		yield replaceInitiative(topic.id, {signing_end_email_sent_at: new Date})
	})
}

function* replaceInitiative(uuid, attrs) {
	// Ensure an initiative exists.
	var initiative = yield initiativesDb.read(uuid, {create: true})
	yield initiativesDb.update(initiative, attrs)
}
