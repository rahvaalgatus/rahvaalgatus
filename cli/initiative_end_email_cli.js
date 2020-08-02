var _ = require("root/lib/underscore")
var Config = require("root/config")
var DateFns = require("date-fns")
var I18n = require("root/lib/i18n")
var Initiative = require("root/lib/initiative")
var {Sql} = require("sqlate")
var sql = require("sqlate")
var sendEmail = require("root").sendEmail
var initiativesDb = require("root/db/initiatives_db")
var logger = require("root").logger
var t = require("root/lib/i18n").t.bind(null, Config.language)
var usersDb = require("root/db/users_db")
var db = require("root/db/initiatives_db")
var renderEmail = require("root/lib/i18n").email.bind(null, "et")
var {getRequiredSignatureCount} = require("root/lib/initiative")
var EXPIRATION_MONTHS = Config.expireSignaturesInMonths

module.exports = function*() {
	yield emailEndedDiscussions()
	yield emailEndedInitiatives()
	if (EXPIRATION_MONTHS > 0) yield emailExpiringInitiatives()
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
		WITH signatures AS (
			SELECT initiative_uuid FROM initiative_signatures
			UNION ALL
			SELECT initiative_uuid FROM initiative_citizenos_signatures
		)

		SELECT
			initiative.*,
			user.email AS user_email,
			user.email_confirmed_at AS user_email_confirmed_at,
			COUNT(signature.initiative_uuid) AS signature_count

		FROM initiatives AS initiative
		JOIN users AS user ON initiative.user_id = user.id
		LEFT JOIN signatures AS signature
		ON signature.initiative_uuid = initiative.uuid

		WHERE initiative.phase = 'sign'
		AND initiative.signing_ends_at >= ${DateFns.addMonths(new Date, -6)}
		AND initiative.signing_ends_at <= ${new Date}
		AND initiative.signing_end_email_sent_at IS NULL

		GROUP BY initiative.uuid
	`)

	yield initiatives.map(function*(initiative) {
		if (!(initiative.user_email && initiative.user_email_confirmed_at)) return

		logger.info(
			"Notifying %s of initiative %s signing end…",
			initiative.user_email,
			initiative.uuid
		)

		var threshold = getRequiredSignatureCount(initiative)

		yield sendEmail({
			to: initiative.user_email,

			subject: initiative.signature_count >= threshold
				? t("SIGNING_END_COMPLETE_EMAIL_SUBJECT")
				: t("SIGNING_END_INCOMPLETE_EMAIL_SUBJECT"),

			text: renderEmail(initiative.signature_count >= threshold
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

function* emailExpiringInitiatives() {
	var today = DateFns.startOfDay(new Date)

	// We could permit successful initiatives still waiting in the sign phase to
	// go past their expiration date if necessary.
	var initiatives = yield initiativesDb.search(sql`
		SELECT
			initiative.*,
			user.email AS user_email,

			date(
				max(
					date(initiative.signing_started_at, 'localtime'),
					${Config.expireSignaturesFrom}
				),

				'+${new Sql(String(Number(EXPIRATION_MONTHS)))} months'
			) AS expires_on

		FROM initiatives AS initiative
		JOIN users AS user ON initiative.user_id = user.id
		WHERE initiative.phase = 'sign'
		AND user.email_confirmed_at IS NOT NULL
		AND initiative.signing_expired_at IS NULL

		AND (
			date(${today}, 'localtime') >= expires_on AND COALESCE(
				date(signing_expiration_email_sent_at, 'localtime') < expires_on,
				true
			) OR

			date(${today}, 'localtime') >= date(expires_on, '-3 months') AND COALESCE(
				date(signing_expiration_email_sent_at, 'localtime') <
				date(expires_on, '-3 months'),
				true
			) OR

			date(${today}, 'localtime') >= date(expires_on, '-14 days') AND COALESCE(
				date(signing_expiration_email_sent_at, 'localtime') <
				date(expires_on, '-14 days'),
				true
			)
		)
	`)

	yield initiatives.map(function*(initiative) {
		var expiresOn = Initiative.getExpirationDate(initiative)

		var expirationDate = I18n.formatDate(
			"numeric",
			DateFns.addDays(expiresOn, -1)
		)

		logger.info(
			"Notifying %s of initiative %s expiring…",
			initiative.user_email,
			initiative.uuid
		)

		if (new Date >= expiresOn) yield sendEmail({
			to: initiative.user_email,
			subject: t("SIGNING_EXPIRED_EMAIL_SUBJECT"),
			text: renderEmail("SIGNING_EXPIRED_EMAIL_BODY", {
				initiativeTitle: initiative.title,
				initiativeUrl: `${Config.url}/initiatives/${initiative.uuid}`,
				newInitiativeUrl: `${Config.url}/initiatives/new`
			})
		})
		else yield sendEmail({
			to: initiative.user_email,
			subject: t("SIGNING_EXPIRING_EMAIL_SUBJECT", {
				expirationDate: expirationDate
			}),

			text: renderEmail("SIGNING_EXPIRING_EMAIL_BODY", {
				initiativeTitle: initiative.title,
				initiativeUrl: `${Config.url}/initiatives/${initiative.uuid}`,
				expirationDate: expirationDate
			})
		})

		yield db.update(initiative.uuid, {
			signing_expiration_email_sent_at: new Date
		})
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
