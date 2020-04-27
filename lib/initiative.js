var _ = require("./underscore")
var Mime = require("mime")
var Config = require("root/config")
var DateFns = require("date-fns")
var LOCAL_GOVERNMENTS = require("./local_governments")
var EMPTY_PROMISE = Promise.resolve({})
var countCitizenSignaturesByIds =
	require("root/lib/citizenos_db").countSignaturesByIds
var sql = require("sqlate")
var sqlite = require("root").sqlite
var MIN_DEADLINE_DAYS = Config.minDeadlineDays

exports.PHASES = ["edit", "sign", "parliament", "government", "done"]
exports.PARLIAMENT_DECISIONS = ["reject", "forward", "solve-differently"]

exports.COMMITTEE_MEETING_DECISIONS = [
	"continue",
	"reject",
	"forward",
	"solve-differently",
	"draft-act-or-national-matter"
]

exports.imageUrl = function(image) {
	var ext = Mime.extension(String(image.type))
	return Config.url + "/initiatives/" + image.initiative_uuid + "." + ext
}

exports.getRequiredSignatureCount = function(initiative) {
	if (initiative.destination == "parliament") return Config.votesRequired
	// https://www.riigiteataja.ee/akt/13312632?leiaKehtiv#para32
	var population = LOCAL_GOVERNMENTS[initiative.destination].population
	return Math.max(Math.round(population * 0.01), 5)
}

exports.canSendToParliament = function(initiative, user, signatureCount) {
	return (
		user && initiative.user_id == user.id &&
		initiative.destination == "parliament" &&
		initiative.phase == "sign" &&

		(
			signatureCount >= Config.votesRequired ||
			signatureCount >= 1 && initiative.has_paper_signatures
		)
	)
}

// Propose for voting.
exports.canPropose = function(now, initiative, topic, user) {
	// NOTE: This currently allows people to create an initiative and hold it
	// hidden until the required number of days pass. Waiting for a solution.
	//
	// TODO: Use published_at once imported CitizenOS initiatives don't default
	// to 1970-01-01.
	var createdAt = initiative.created_at
	var min = DateFns.addDays(DateFns.startOfDay(createdAt), MIN_DEADLINE_DAYS)

	return (
		topic &&
		user && initiative.user_id == user.id &&
		initiative.phase == "edit" &&
		initiative.published_at &&
		(now >= min || hasTag(topic, "fast-track"))
	)
}

exports.canUpdateSignDeadline = function(initiative, user) {
	return (
		user && initiative.user_id == user.id &&
		initiative.phase == "sign"
	)
}

exports.countSignaturesById = function(uuid) {
	return exports.countSignaturesByIds([uuid]).then((counts) => (
		uuid in counts ? counts[uuid] : null
	))
}

exports.countSignaturesByIds = function(uuids) {
	if (uuids.length == 0) return EMPTY_PROMISE

	return Promise.all([
		countCitizenSignaturesByIds(uuids),
		exports.countUndersignedSignaturesByIds(uuids)
	]).then(([a, b]) => _.mergeWith(a, b, _.add))
}

exports.countUndersignedSignaturesById = function(uuid) {
	return exports.countUndersignedSignaturesByIds([uuid]).then((counts) => (
		uuid in counts ? counts[uuid] : null
	))
}

exports.countUndersignedSignaturesByIds = function(uuids) {
	return sqlite(sql`
		SELECT initiative_uuid AS uuid, COUNT(*) AS count
		FROM initiative_signatures
		WHERE initiative_uuid IN ${sql.in(uuids)}
		GROUP BY initiative_uuid
	`).then(function(rows) {
		var counts = _.indexBy(rows, "uuid")
		return _.object(uuids, (uuid) => uuid in counts ? +counts[uuid].count : 0)
	})
}

function hasTag(topic, tag) {
	return topic.categories && topic.categories.includes(tag)
}
