var I18n = require("root/lib/i18n")
var Config = require("root").config
var Neodoc = require("neodoc")
var DateFns = require("date-fns")
var co = require("co")
var {Sql} = require("sqlate")
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
	var today = DateFns.startOfDay(new Date)

	var expirables = initiativesDb.search(sql`
		SELECT
			initiative.*,
			user.email AS user_email,

			${initiativesDb.countSignatures(sql`initiative_uuid = initiative.uuid`)}
			AS signature_count,

			date(
				date(initiative.signing_started_at, 'localtime'),
				'+${new Sql(String(Number(Config.expireSignaturesInMonths)))} months'
			) AS expires_on

		FROM initiatives AS initiative
		LEFT JOIN users AS user ON initiative.user_id = user.id

		WHERE initiative.phase = 'sign'
		AND initiative.signing_expired_at IS NULL
		AND NOT initiative.external
		AND date(${today}, 'localtime') >= expires_on
		AND expires_on >= date(initiative.signing_ends_at, 'localtime')

		ORDER BY expires_on ASC
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

			signatureCount > Initiative.getRequiredSignatureCount(initiative)
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

		logger.info(
			"Expired On: %s",
			I18n.formatDate("iso", initiative.expires_on)
		)

		if (actuallyExpire) initiativesDb.update(initiative, {
			signing_expired_at: new Date
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
