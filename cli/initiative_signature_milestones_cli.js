var _ = require("root/lib/underscore")
var Config = require("root/config")
var Subscription = require("root/lib/subscription")
var DateFns = require("date-fns")
var {getRequiredSignatureCount} = require("root/lib/initiative")
var initiativesDb = require("root/db/initiatives_db")
var subscriptionsDb = require("root/db/initiative_subscriptions_db")
var messagesDb = require("root/db/initiative_messages_db")
var signaturesDb = require("root/db/initiative_signatures_db")
var sql = require("sqlate")
var t = require("root/lib/i18n").t.bind(null, Config.language)
var renderEmail = require("root/lib/i18n").email.bind(null, Config.language)
var logger = require("root/lib/null_logger")

module.exports = function*() {
	var initiatives = initiativesDb.search(sql`
		SELECT
			initiative.*,
			${initiativesDb.countSignatures(sql`initiative_uuid = initiative.uuid`)}
			AS signature_count

		FROM initiatives AS initiative
		WHERE initiative.phase != 'edit'
	`)

	yield initiatives.map(function(initiative) {
		var signatureCount = initiative.signature_count
		var passed = initiative.signature_milestones

		var milestones = _.uniq(_.sort(_.subtract,
			Config.signatureMilestones.concat(getRequiredSignatureCount(initiative)
		)))

		return milestones.some((n) => n <= signatureCount && !(n in passed))
			? [initiative, milestones]
			: null
	}).filter(Boolean).map(updateMilestones)
}

function* updateMilestones([initiative, milestones]) {
	var largest = _.findLast(milestones, (n) => initiative.signature_count >= n)

	var signatures = signaturesDb.search(sql`
		SELECT created_at
		FROM initiative_citizenos_signatures
		WHERE initiative_uuid = ${initiative.uuid}

		UNION

		SELECT created_at
		FROM initiative_signatures
		WHERE initiative_uuid = ${initiative.uuid}

		ORDER BY created_at ASC
		LIMIT ${largest}
	`)

	var reachedMilestones = milestones.reduce(function(times, milestone) {
		if (signatures.length >= milestone && !(milestone in times))
			times[milestone] = signatures[milestone - 1].created_at

		return times
	}, _.clone(initiative.signature_milestones))

	initiativesDb.update(initiative, {
		signature_milestones: reachedMilestones
	})

	// Only notify if relevant, and that's when the milestone was reached in the
	// last 24h during the sign phase.
	if (
		initiative.phase == "sign" &&
		initiative.signature_milestones[largest] == null &&
		reachedMilestones[largest] &&
		+reachedMilestones[largest] >= +DateFns.addHours(new Date, -24)
	) {
		logger.info(
			"Initiative %s reached %d signature milestone.",
			initiative.uuid,
			largest
		)

		var threshold = getRequiredSignatureCount(initiative)

		var message = messagesDb.create({
			initiative_uuid: initiative.uuid,
			origin: "signature_milestone",
			created_at: new Date,
			updated_at: new Date,

			title: t(largest == threshold
				? "EMAIL_SIGNATURES_COLLECTED_SUBJECT"
				: "EMAIL_SIGNATURE_MILESTONE_N_SUBJECT", {
				initiativeTitle: initiative.title,
				milestone: largest
			}),

			text: renderEmail(largest == threshold
				? "EMAIL_SIGNATURES_COLLECTED_BODY"
				: "EMAIL_SIGNATURE_MILESTONE_N_BODY", {
				initiativeTitle: initiative.title,
				initiativeUrl: `${Config.url}/initiatives/${initiative.uuid}`,
				milestone: largest
			})
		})

		yield Subscription.send(
			message,
			subscriptionsDb.searchConfirmedByInitiativeIdForEvent(initiative.uuid)
		)
	}
}
