var I18n = require("root/lib/i18n")
var Config = require("root").config
var Neodoc = require("neodoc")
var DateFns = require("date-fns")
var co = require("co")
var sql = require("sqlate")
var {logger} = require("root")
var Initiative = require("root/lib/initiative")
var t = require("root/lib/i18n").t.bind(null, Config.language)
var initiativesDb = require("root/db/initiatives_db")
var {sendEmail} = require("root")
var renderEmail = require("root/lib/i18n").email.bind(null, "et")

var USAGE_TEXT = `
Usage: cli initiatives (-h | --help)
       cli initiatives [options]
       cli initiatives expire-signing [options]

Options:
    -h, --help   Display this help and exit.
    --yes        Actually expire initiatives. Otherwise just a dry-run.
    --no-email   Disable email notifications of expired initiatives.
`

module.exports = co.wrap(function*(argv) {
	var args = Neodoc.run(USAGE_TEXT, {argv: argv || ["initiatives"]})
	if (args["--help"]) return void process.stdout.write(USAGE_TEXT.trimLeft())

	if (args["expire-signing"]) yield expireSigning({
		actuallyExpire: args["--yes"],
		actuallyEmail: !args["--no-email"]
	})

	else process.stdout.write(USAGE_TEXT.trimLeft())
})

function* expireSigning({actuallyExpire, actuallyEmail}) {
	var now = new Date
	var cutoff = DateFns.addMonths(now, -Config.expireSignaturesInMonths)

	var expirables = initiativesDb.search(sql`
		SELECT
			initiative.*,
			user.email AS user_email,

			${initiativesDb.countSignatures(sql`initiative_uuid = initiative.uuid`)}
			AS signature_count

		FROM initiatives AS initiative
		LEFT JOIN users AS user ON initiative.user_id = user.id

		WHERE initiative.phase = 'sign'
		AND initiative.signing_expired_at IS NULL
		AND NOT initiative.external
		AND initiative.signing_started_at <= ${cutoff}
		AND ${now} >= initiative.signing_ends_at

		ORDER BY initiative.signing_started_at ASC
	`)

	for (var i = 0; i < expirables.length; ++i) {
		if (i > 0) logger.info()

		var initiative = expirables[i]
		var signatureCount = initiative.signature_count

		logger.info(initiative.title)
		logger.info("Link: %s", Config.url + "/initiatives/" + initiative.uuid)
		logger.info(
			"Signature Count: %d (%s)",
			signatureCount,

			signatureCount > Initiative.getSignatureThreshold(initiative)
				? "Succeeded"
				: "Failed"
		)

		logger.info(
			"Signing Started On: %s",
			I18n.formatDate("iso", initiative.signing_started_at)
		)

		logger.info("Signing Ends On: %s", I18n.formatDate(
			"iso",
			DateFns.addMilliseconds(initiative.signing_ends_at, -1)
		))

		logger.info("Expired On: %s", I18n.formatDate("iso", DateFns.addMonths(
			initiative.signing_started_at,
			Config.expireSignaturesInMonths
		)))

		if (actuallyExpire) initiativesDb.update(initiative, {
			signing_expired_at: new Date,
			signature_threshold: Initiative.getSignatureThreshold(initiative),
			signature_threshold_at: new Date
		})

		if (actuallyExpire && actuallyEmail) {
			if (initiative.user_email == null) {
				logger.info(
					"Skipping notifying %s of expiring…",
					initiative.user_email
				)

				continue
			}

			logger.info("Notifying %s of expiring…", initiative.user_email)

			yield sendEmail({
				to: initiative.user_email,
				subject: t("SIGNING_EXPIRED_EMAIL_SUBJECT"),
				text: renderEmail("SIGNING_EXPIRED_EMAIL_BODY", {
					initiativeTitle: initiative.title,
					initiativeUrl: `${Config.url}/initiatives/${initiative.uuid}`,
					newInitiativeUrl: `${Config.url}/initiatives/new`
				})
			})

			initiativesDb.update(initiative.uuid, {
				signing_expiration_email_sent_at: new Date
			})
		}
	}
}
