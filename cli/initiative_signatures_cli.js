var I18n = require("root/lib/i18n")
var Config = require("root").config
var Neodoc = require("neodoc")
var DateFns = require("date-fns")
var initiativesDb = require("root/db/initiatives_db")
var sql = require("sqlate")
var {sqlite} = require("root")
var {logger} = require("root")

var USAGE_TEXT = `
Usage: cli initiative-signatures (-h | --help)
       cli initiative-signatures [options]
       cli initiative-signatures anonymize [options]

Options:
    -h, --help   Display this help and exit.
    --yes        Actually anonymize signatures. Otherwise just a dry-run.
`

module.exports = function(argv) {
	var args = Neodoc.run(USAGE_TEXT, {argv: argv || ["initiative-signatures"]})
	if (args["--help"]) return void process.stdout.write(USAGE_TEXT.trimLeft())

	if (args.anonymize) anonymize(args["--yes"])
	else process.stdout.write(USAGE_TEXT.trimLeft())
}

function anonymize(actuallyAnonymize) {
	var expiredBefore =
		DateFns.addDays(new Date, -Config.anonymizeSignaturesExpiredAfterDays)
	var receivedBefore =
		DateFns.addDays(new Date, -Config.anonymizeSignaturesReceivedAfterDays)

	var anonymizables = initiativesDb.search(sql`
		SELECT
			initiative.*,
			${initiativesDb.countSignatures(sql`initiative_uuid = initiative.uuid`)}
			AS signature_count

		FROM initiatives AS initiative

		WHERE signatures_anonymized_at IS NULL
		AND NOT external

		AND (
			phase = 'sign' AND signing_expired_at <= ${expiredBefore}

			OR phase IN ('parliament', 'government', 'done') AND (
				destination = 'parliament' AND
				received_by_parliament_at <= ${receivedBefore}

				OR

				destination != 'parliament' AND
				received_by_government_at <= ${receivedBefore}
			)
		)
	`)

	for (var i = 0; i < anonymizables.length; ++i) {
		if (i > 0) logger.info()

		var initiative = anonymizables[i]
		logger.info(initiative.title)
		logger.info("Link: %s", Config.url + "/initiatives/" + initiative.uuid)
		logger.info("Signature Count: %d", initiative.signature_count)

		if (initiative.signing_expired_at) logger.info(
			"Signing Expired On: %s",
			I18n.formatDate("iso", initiative.signing_expired_at)
		)

		if (initiative.received_by_parliament_at) logger.info(
			"Received by Parliament: %s",
			I18n.formatDate("iso", initiative.received_by_parliament_at)
		)

		if (initiative.received_by_government_at) logger.info(
			"Received by Government: %s",
			I18n.formatDate("iso", initiative.received_by_government_at)
		)

		if (actuallyAnonymize) {
			sqlite(sql`BEGIN`)

			try {
				sqlite(sql`
					UPDATE initiative_signatures SET
						personal_id = substr(personal_id, 1, 3),
						token = NULL,
						xades = NULL,
						anonymized = true

					WHERE initiative_uuid = ${initiative.uuid}
				`)

				sqlite(sql`
					UPDATE initiative_citizenos_signatures SET
						personal_id = substr(personal_id, 1, 3),
						asic = NULL,
						anonymized = true

					WHERE initiative_uuid = ${initiative.uuid}
				`)

				initiativesDb.update(initiative, {
					signatures_anonymized_at: new Date
				})
			}
			catch (err) { sqlite(sql`ROLLBACK`); throw err }

			sqlite(sql`COMMIT`)
		}
	}
}
