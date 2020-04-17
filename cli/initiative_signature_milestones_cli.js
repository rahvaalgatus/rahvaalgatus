var _ = require("root/lib/underscore")
var Config = require("root/config")
var Subscription = require("root/lib/subscription")
var DateFns = require("date-fns")
var initiativesDb = require("root/db/initiatives_db")
var {countSignaturesByIds} = require("root/lib/initiative")
var cosDb = require("root").cosDb
var subscriptionsDb = require("root/db/initiative_subscriptions_db")
var messagesDb = require("root/db/initiative_messages_db")
var signaturesDb = require("root/db/initiative_signatures_db")
var sql = require("sqlate")
var t = require("root/lib/i18n").t.bind(null, Config.language)
var renderEmail = require("root/lib/i18n").email.bind(null, Config.language)
var concat = Array.prototype.concat.bind(Array.prototype)
var logger = require("root/lib/null_logger")
var PARTNER_IDS = concat(Config.apiPartnerId, _.keys(Config.partners))
var MILESTONES = _.sort(_.subtract, Config.signatureMilestones)

module.exports = function*() {
	var topics = yield cosDb.query(sql`
		SELECT topic.id, topic.title, topic.status
		FROM "Topics" AS topic
		JOIN "TopicVotes" AS tv ON tv."topicId" = topic.id
		JOIN "Votes" AS vote ON vote.id = tv."voteId"
		WHERE topic.visibility = 'public'
		AND topic."deletedAt" IS NULL
		AND topic."sourcePartnerId" IN ${sql.in(PARTNER_IDS)}
	`)

	var uuids = topics.map((i) => i.id)
	var initiatives = _.indexBy(yield initiativesDb.search(uuids), "uuid")

	var signatureCounts = yield countSignaturesByIds(uuids)

	var milestonees = topics.filter(function(topic) {
		var signatureCount = signatureCounts[topic.id]
		var passed = initiatives[topic.id].signature_milestones
		return MILESTONES.some((n) => n <= signatureCount && !(n in passed))
	})

	yield milestonees.map(function(topic) {
		var signatureCount = signatureCounts[topic.id]
		return updateMilestones(topic, initiatives[topic.id], signatureCount)
	})
}

function* updateMilestones(topic, initiative, signatureCount) {
	var largest = _.findLast(MILESTONES, (n) => signatureCount >= n)

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

	if (
		initiative.signature_milestones[largest] == null &&
		milestones[largest] &&
		topic.status == "voting" &&
		+milestones[largest] >= +DateFns.addHours(new Date, -24)
	) {
		logger.info(
			"Initiative %s reached %d signature milestone.",
			topic.id,
			largest
		)

		var message = yield messagesDb.create({
			initiative_uuid: topic.id,
			origin: "signature_milestone",
			created_at: new Date,
			updated_at: new Date,

			title: t("EMAIL_SIGNATURE_MILESTONE_N_SUBJECT", {
				initiativeTitle: topic.title,
				milestone: largest
			}),

			text: renderEmail("EMAIL_SIGNATURE_MILESTONE_N_BODY", {
				initiativeTitle: topic.title,
				initiativeUrl: `${Config.url}/initiatives/${topic.id}`,
				milestone: largest
			})
		})

		yield Subscription.send(
			message,
			yield subscriptionsDb.searchConfirmedByInitiativeIdForOfficial(topic.id)
		)
	}
}
