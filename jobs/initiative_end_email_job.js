var _ = require("root/lib/underscore")
var Config = require("root/config")
var sql = require("sqlate")
var sendEmail = require("root").sendEmail
var concat = Array.prototype.concat.bind(Array.prototype)
var logger = require("root").logger
var t = require("root/lib/i18n").t.bind(null, Config.language)
var sqlite = require("root").sqlite
var cosDb = require("root").cosDb
var initiativesDb = require("root/db/initiatives_db")
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
		SELECT initiative.id, initiative.title, "user".email AS user_email
		FROM "Topics" AS initiative
		JOIN "Users" AS "user" ON "user".id = initiative."creatorId"
		WHERE initiative.status = 'inProgress'
		AND initiative."endsAt" <= ${new Date}
		AND initiative.visibility = 'public'
		AND initiative."sourcePartnerId" IN ${sql.tuple(PARTNER_IDS)}
		AND initiative.id NOT IN (${uuids.length ? sql.csv(uuids) : NO_UUIDS})
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
			text: t("DISCUSSION_END_EMAIL_BODY", {
				initiativeTitle: discussion.title,
				initiativeUrl: `${Config.url}/initiatives/${discussion.id}`,
				initiativeEditUrl: `${Config.url}/initiatives/${discussion.id}/edit`,
				siteUrl: Config.url
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

	var initiatives = yield cosDb.query(sql`
		SELECT initiative.id, initiative.title, "user".email AS user_email
		FROM "Topics" AS initiative
		JOIN "Users" AS "user" ON "user".id = initiative."creatorId"
		JOIN "TopicVotes" AS tv ON tv."topicId" = initiative.id
		JOIN "Votes" AS vote ON vote.id = tv."voteId"
		WHERE initiative.status = 'voting'
		AND vote."endsAt" <= ${new Date}
		AND initiative.visibility = 'public'
		AND initiative."sourcePartnerId" IN ${sql.tuple(PARTNER_IDS)}
		AND initiative.id NOT IN (${uuids.length ? sql.csv(uuids) : NO_UUIDS})
		AND "user".email IS NOT NULL
		AND "user"."emailIsVerified"
	`)

	yield initiatives.map(function*(initiative) {
		logger.info(
			"Notifying %s of initiative %s signing end…",
			initiative.user_email,
			initiative.id
		)

		yield sendEmail({
			to: initiative.user_email,
			subject: t("SIGNING_END_EMAIL_SUBJECT"),
			text: t("SIGNING_END_EMAIL_BODY", {
				initiativeTitle: initiative.title,
				initiativeUrl: `${Config.url}/initiatives/${initiative.id}`,
				initiativeEditUrl: `${Config.url}/initiatives/${initiative.id}/edit`,
				siteUrl: Config.url
			})
		})

		yield replaceInitiative(initiative.id, {
			signing_end_email_sent_at: new Date
		})
	})
}

function* replaceInitiative(uuid, attrs) {
	// Ensure an initiative exists.
	var initiative = yield initiativesDb.read(uuid, {create: true})
	yield initiativesDb.update(initiative, attrs)
}
