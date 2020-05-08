var _ = require("root/lib/underscore")
var Config = require("root/config")
var DateFns = require("date-fns")
var sql = require("sqlate")
var sendEmail = require("root").sendEmail
var initiativesDb = require("root/db/initiatives_db")
var logger = require("root").logger
var t = require("root/lib/i18n").t.bind(null, Config.language)
var usersDb = require("root/db/users_db")
var db = require("root/db/initiatives_db")
var renderEmail = require("root/lib/i18n").email.bind(null, "et")
var {countSignaturesByIds} = require("root/lib/initiative")
var SIGS_REQUIRED = Config.votesRequired

module.exports = function*() {
	yield emailEndedDiscussions()
	yield emailEndedInitiatives()
}

function* emailEndedDiscussions() {
	var discussions = yield initiativesDb.search(sql`
		SELECT uuid, title
		FROM initiatives
		WHERE phase = 'edit'
		AND published_at IS NOT NULL
		AND discussion_ends_at >= ${DateFns.addMonths(new Date, -6)}
		AND discussion_ends_at <= ${new Date}
		AND discussion_end_email_sent_at IS NULL
	`)

	// TODO: This could be merged into the initiatives query.
	var users = yield searchUsersByUuids(_.map(discussions, "uuid"))

	yield discussions.map(function*(discussion) {
		var user = users[discussion.uuid]
		if (!(user.email && user.email_confirmed_at)) return

		logger.info(
			"Notifying %s of initiative %s discussion's end…",
			user.email,
			discussion.uuid
		)

		yield sendEmail({
			to: user.email,
			subject: t("DISCUSSION_END_EMAIL_SUBJECT"),
			text: renderEmail("DISCUSSION_END_EMAIL_BODY", {
				initiativeTitle: discussion.title,
				initiativeUrl: `${Config.url}/initiatives/${discussion.uuid}`,
				initiativeEditUrl: `${Config.url}/initiatives/${discussion.uuid}`
			})
		})

		yield db.update(discussion.uuid, {discussion_end_email_sent_at: new Date})
	})
}

function* emailEndedInitiatives() {
	var initiatives = yield initiativesDb.search(sql`
		SELECT uuid, title
		FROM initiatives
		WHERE phase = 'sign'
		AND signing_ends_at >= ${DateFns.addMonths(new Date, -6)}
		AND signing_ends_at <= ${new Date}
		AND signing_end_email_sent_at IS NULL
	`)

	// TODO: This could be merged into the initiatives query.
	var users = yield searchUsersByUuids(_.map(initiatives, "uuid"))
	var signatureCounts = yield countSignaturesByIds(_.map(initiatives, "uuid"))

	yield initiatives.map(function*(initiative) {
		var user = users[initiative.uuid]
		if (!(user.email && user.email_confirmed_at)) return

		logger.info(
			"Notifying %s of initiative %s signing end…",
			user.email,
			initiative.uuid
		)

		yield sendEmail({
			to: user.email,
			subject: signatureCounts[initiative.uuid] >= SIGS_REQUIRED
				? t("SIGNING_END_COMPLETE_EMAIL_SUBJECT")
				: t("SIGNING_END_INCOMPLETE_EMAIL_SUBJECT"),

			text: renderEmail(signatureCounts[initiative.uuid] >= SIGS_REQUIRED
				? "SIGNING_END_COMPLETE_EMAIL_BODY"
				: "SIGNING_END_INCOMPLETE_EMAIL_BODY", {
				initiativeTitle: initiative.title,
				initiativeUrl: `${Config.url}/initiatives/${initiative.uuid}`,
				initiativeEditUrl: `${Config.url}/initiatives/${initiative.uuid}`
			})
		})

		yield db.update(initiative.uuid, {signing_end_email_sent_at: new Date})
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
