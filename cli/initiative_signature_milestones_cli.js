var _ = require("root/lib/underscore")
var Config = require("root/config")
var Subscription = require("root/lib/subscription")
var DateFns = require("date-fns")
var initiativesDb = require("root/db/initiatives_db")
var subscriptionsDb = require("root/db/initiative_subscriptions_db")
var messagesDb = require("root/db/initiative_messages_db")
var signaturesDb = require("root/db/initiative_signatures_db")
var sql = require("sqlate")
var t = require("root/lib/i18n").t.bind(null, Config.language)
var renderEmail = require("root/lib/i18n").email.bind(null, Config.language)
var logger = require("root/lib/null_logger")
var MILESTONES = _.sort(_.subtract, Config.signatureMilestones)

module.exports = function*() {
	var initiatives = yield initiativesDb.search(sql`
		WITH signatures AS (
			SELECT initiative_uuid FROM initiative_signatures
			UNION ALL
			SELECT initiative_uuid FROM initiative_citizenos_signatures
		)

		SELECT initiative.*, COUNT(signature.initiative_uuid) AS signature_count
		FROM initiatives AS initiative
		LEFT JOIN signatures AS signature
		ON signature.initiative_uuid = initiative.uuid

		WHERE initiative.phase != 'edit'
		GROUP BY initiative.uuid
	`)

	yield initiatives.filter(function(initiative) {
		var signatureCount = initiative.signature_count
		var passed = initiative.signature_milestones
		return MILESTONES.some((n) => n <= signatureCount && !(n in passed))
	}).map(updateMilestones)
}

function* updateMilestones(initiative) {
	var largest = _.findLast(MILESTONES, (n) => initiative.signature_count >= n)

	var signatures = yield signaturesDb.search(sql`
		SELECT created_at
		FROM initiative_citizenos_signatures
		WHERE initiative_uuid = ${initiative.uuid}

		UNION SELECT created_at
		FROM initiative_signatures
		WHERE initiative_uuid = ${initiative.uuid}

		ORDER BY created_at ASC
		LIMIT ${largest}
	`)

	var milestones = MILESTONES.reduce(function(times, milestone) {
		if (signatures.length >= milestone && !(milestone in times))
			times[milestone] = signatures[milestone - 1].created_at

		return times
	}, _.clone(initiative.signature_milestones))

	yield initiativesDb.update(initiative, {signature_milestones: milestones})

	// Only notify if relevant, and that's when the milestone was reached in the
	// last 24h during the sign phase.
	if (
		initiative.phase == "sign" &&
		initiative.signature_milestones[largest] == null &&
		milestones[largest] &&
		+milestones[largest] >= +DateFns.addHours(new Date, -24)
	) {
		logger.info(
			"Initiative %s reached %d signature milestone.",
			initiative.uuid,
			largest
		)

		var message = yield messagesDb.create({
			initiative_uuid: initiative.uuid,
			origin: "signature_milestone",
			created_at: new Date,
			updated_at: new Date,

			title: t("EMAIL_SIGNATURE_MILESTONE_N_SUBJECT", {
				initiativeTitle: initiative.title,
				milestone: largest
			}),

			text: renderEmail("EMAIL_SIGNATURE_MILESTONE_N_BODY", {
				initiativeTitle: initiative.title,
				initiativeUrl: `${Config.url}/initiatives/${initiative.uuid}`,
				milestone: largest
			})
		})

		yield Subscription.send(
			message,
			yield subscriptionsDb.searchConfirmedByInitiativeIdForOfficial(initiative.uuid)
		)
	}
}
