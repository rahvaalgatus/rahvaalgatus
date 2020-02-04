var _ = require("./underscore")
var Mime = require("mime")
var Config = require("root/config")
var LOCAL_GOVERNMENTS = require("./local_governments")
var EMPTY_PROMISE = Promise.resolve({})
var countCitizenSignaturesByIds =
	require("root/lib/citizenos_db").countSignaturesByIds
var sql = require("sqlate")
var sqlite = require("root").sqlite

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
