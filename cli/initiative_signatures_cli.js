var I18n = require("root/lib/i18n")
var Config = require("root/config")
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
	var deadline = DateFns.addDays(new Date, -28)

	var anonymizables = initiativesDb.search(sql`
		SELECT
			initiative.*,
			${initiativesDb.countSignatures(sql`initiative_uuid = initiative.uuid`)}
			AS signature_count

		FROM initiatives AS initiative

		WHERE phase IN ('parliament', 'government', 'done')
		AND signatures_anonymized_at IS NULL
		AND NOT external

		AND ((
			destination = 'parliament' AND
			received_by_parliament_at <= ${deadline}
		) OR (
			destination != 'parliament' AND
			received_by_government_at <= ${deadline}
		))
	`)

	for (var i = 0; i < anonymizables.length; ++i) {
		if (i > 0) logger.info()

		var initiative = anonymizables[i]
		logger.info(initiative.title)
		logger.info("Link: %s", Config.url + "/initiatives/" + initiative.uuid)
		logger.info("Signature Count: %d", initiative.signature_count)

		if (initiative.destination == "parliament") logger.info(
			"Received by Parliament: %s",
			I18n.formatDate("iso", initiative.received_by_parliament_at)
		)
		else logger.info(
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
