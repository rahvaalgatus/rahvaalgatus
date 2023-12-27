var Config = require("root").config
var DateFns = require("date-fns")
var I18n = require("root/lib/i18n")
var Initiative = require("root/lib/initiative")
var Neodoc = require("neodoc")
var {Sql} = require("sqlate")
var sql = require("sqlate")
var {sendEmail} = require("root")
var initiativesDb = require("root/db/initiatives_db")
var {logger} = require("root")
var t = require("root/lib/i18n").t.bind(null, Config.language)
var renderEmail = require("root/lib/i18n").email.bind(null, "et")
var {getSignatureThreshold} = require("root/lib/initiative")
var co = require("co")

var USAGE_TEXT = `
Usage: cli initiative-end-email (-h | --help)
       cli initiative-end-email [options]

Options:
    -h, --help   Display this help and exit.
    --dry-run    Don't actually email anyone.
`

module.exports = co.wrap(function*(argv) {
	var args = Neodoc.run(USAGE_TEXT, {argv: argv || ["initiative-end-email"]})
	if (args["--help"]) return void process.stdout.write(USAGE_TEXT.trimLeft())

	var opts = {actuallyEmail: !args["--dry-run"]}
	yield emailEndedDiscussions(opts)
	yield emailEndedInitiatives(opts)
	yield emailExpiringInitiatives(opts)
})

function* emailEndedDiscussions({actuallyEmail}) {
	var discussions = initiativesDb.search(sql`
		SELECT initiative.*, user.email AS user_email

		FROM initiatives AS initiative
		JOIN users AS user ON initiative.user_id = user.id

		WHERE initiative.phase = 'edit'
		AND initiative.published_at IS NOT NULL
		AND initiative.discussion_ends_at >= ${DateFns.addMonths(new Date, -6)}
		AND initiative.discussion_ends_at <= ${new Date}
		AND initiative.discussion_end_email_sent_at IS NULL
		AND user.email IS NOT NULL
	`)

	for (var i = 0; i < discussions.length; ++i) {
		var discussion = discussions[i]

		logger.info(
			"Notifying %s of initiative %s discussion's end…",
			discussion.user_email,
			discussion.uuid
		)

		if (actuallyEmail) {
			yield sendEmail({
				to: discussion.user_email,
				subject: t("DISCUSSION_END_EMAIL_SUBJECT"),
				text: renderEmail("DISCUSSION_END_EMAIL_BODY", {
					initiativeTitle: discussion.title,
					initiativeUrl: Initiative.slugUrl(discussion),
					initiativeEditUrl: Initiative.slugUrl(discussion)
				})
			})

			initiativesDb.update(discussion.id, {
				discussion_end_email_sent_at: new Date
			})
		}
	}
}

function* emailEndedInitiatives({actuallyEmail}) {
	var initiatives = initiativesDb.search(sql`
		SELECT
			initiative.*,
			user.email AS user_email,
			${initiativesDb.countSignatures(sql`initiative_uuid = initiative.uuid`)}
			AS signature_count

		FROM initiatives AS initiative
		JOIN users AS user ON initiative.user_id = user.id

		WHERE initiative.phase = 'sign'
		AND initiative.signing_ends_at >= ${DateFns.addMonths(new Date, -6)}
		AND initiative.signing_ends_at <= ${new Date}
		AND initiative.signing_end_email_sent_at IS NULL
		AND user.email IS NOT NULL
	`)

	for (var i = 0; i < initiatives.length; ++i) {
		var initiative = initiatives[i]

		logger.info(
			"Notifying %s of initiative %s signing end…",
			initiative.user_email,
			initiative.uuid
		)

		if (actuallyEmail) {
			var threshold = getSignatureThreshold(initiative)

			yield sendEmail({
				to: initiative.user_email,

				subject: initiative.signature_count >= threshold
					? t("SIGNING_END_COMPLETE_EMAIL_SUBJECT")
					: t("SIGNING_END_INCOMPLETE_EMAIL_SUBJECT"),

				text: renderEmail(initiative.signature_count >= threshold
					? "SIGNING_END_COMPLETE_EMAIL_BODY"
					: "SIGNING_END_INCOMPLETE_EMAIL_BODY", {
					initiativeTitle: initiative.title,
					initiativeUrl: Initiative.slugUrl(initiative),
					initiativeEditUrl: Initiative.slugUrl(initiative)
				})
			})

			initiativesDb.update(initiative.id, {signing_end_email_sent_at: new Date})
		}
	}
}

function* emailExpiringInitiatives({actuallyEmail}) {
	var today = DateFns.startOfDay(new Date)

	// We could permit successful initiatives still waiting in the sign phase to
	// go past their expiration date if necessary.
	var initiatives = initiativesDb.search(sql`
		SELECT
			initiative.*,
			user.email AS user_email,

			date(
				date(initiative.signing_started_at, 'localtime'),
				'+${new Sql(String(Number(Config.expireSignaturesInMonths)))} months'
			) AS expires_on

		FROM initiatives AS initiative
		JOIN users AS user ON initiative.user_id = user.id
		WHERE initiative.phase = 'sign'
		AND user.email IS NOT NULL
		AND initiative.signing_expired_at IS NULL
		AND date(${today}, 'localtime') < expires_on

		AND (
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

	for (var i = 0; i < initiatives.length; ++i) {
		var initiative = initiatives[i]

		var expirationDate = I18n.formatDate(
			"numeric",
			DateFns.addDays(Initiative.getExpirationDate(initiative), -1)
		)

		logger.info(
			"Notifying %s of initiative %s expiring…",
			initiative.user_email,
			initiative.id
		)

		if (actuallyEmail) {
			yield sendEmail({
				to: initiative.user_email,
				subject: t("SIGNING_EXPIRING_EMAIL_SUBJECT", {
					expirationDate: expirationDate
				}),

				text: renderEmail("SIGNING_EXPIRING_EMAIL_BODY", {
					initiativeTitle: initiative.title,
					initiativeUrl: Initiative.slugUrl(initiative),
					expirationDate: expirationDate
				})
			})

			initiativesDb.update(initiative, {
				signing_expiration_email_sent_at: new Date
			})
		}
	}
}
