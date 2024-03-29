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
       cli initiative-signatures anonymize [options] [<uuid>]
       cli initiative-signatures delete-signables [options]

Options:
    -h, --help     Display this help and exit.
    --yes          Actually anonymize signatures. Otherwise just a dry-run.
    --received-now Anonymize received initiatives now, without waiting the
                   customary ${Config.anonymizeSignaturesReceivedAfterDays} days.
    --expired-now  Anonymize expired initiatives now, without waiting the
                   customary ${Config.anonymizeSignaturesExpiredAfterDays} days.
`

module.exports = function(argv) {
	var args = Neodoc.run(USAGE_TEXT, {argv: argv || ["initiative-signatures"]})
	if (args["--help"]) return void process.stdout.write(USAGE_TEXT.trimLeft())

	if (args.anonymize) anonymize({
		actuallyAnonymize: args["--yes"],
		anonymizeReceivedNow: args["--received-now"],
		anonymizeExpiredNow: args["--expired-now"]
	}, args["<uuid>"])

	else if (args["delete-signables"]) deleteSignables(args["--yes"])
	else process.stdout.write(USAGE_TEXT.trimLeft())
}

function anonymize({
	actuallyAnonymize,
	anonymizeReceivedNow,
	anonymizeExpiredNow
}, uuid) {
	var now = new Date

	var expiredBefore = anonymizeExpiredNow
		? now
		: DateFns.addDays(now, -Config.anonymizeSignaturesExpiredAfterDays)

	var receivedBefore = anonymizeReceivedNow
		? now
		: DateFns.addDays(now, -Config.anonymizeSignaturesReceivedAfterDays)

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

		${uuid ? sql`AND uuid = ${uuid}` : sql``}
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

		if (actuallyAnonymize) sqlite.transact(function() {
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

			initiativesDb.update(initiative, {signatures_anonymized_at: new Date})
		})
	}
}

function deleteSignables(actuallyDelete) {
	var filter = sql`created_at <= ${DateFns.addDays(new Date, -7)}`

	var count = sqlite(sql`
		SELECT COUNT(*) AS count FROM initiative_signables WHERE ${filter}
	`)[0].count

	logger.info("Deleting %d signables…", count)

	if (actuallyDelete) {
		var deleted = sqlite(sql`DELETE FROM initiative_signables WHERE ${filter}`)
		logger.info("Deleted %d signables.", deleted.changes)
	}
}
