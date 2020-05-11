var _ = require("./underscore")
var Jsx = require("j6pack")
var Trix = require("./trix")
var Mime = require("mime")
var Config = require("root/config")
var DateFns = require("date-fns")
var LOCAL_GOVERNMENTS = require("./local_governments")
var EMPTY_PROMISE = Promise.resolve({})
var sql = require("sqlate")
var sqlite = require("root").sqlite
var MIN_DEADLINE_DAYS = Config.minDeadlineDays
var MAX_DEADLINE_DAYS = Config.maxDeadlineDays

exports.PHASES = ["edit", "sign", "parliament", "government", "done"]
exports.PARLIAMENT_DECISIONS = ["reject", "forward", "solve-differently"]

exports.COMMITTEE_MEETING_DECISIONS = [
	"continue",
	"reject",
	"forward",
	"solve-differently",
	"draft-act-or-national-matter"
]

exports.getMinDeadline = function(now) {
	var today = DateFns.startOfDay(now)
	return DateFns.addDays(today, MIN_DEADLINE_DAYS)
}

exports.getMaxDeadline = function(now) {
	var today = DateFns.startOfDay(now)
	return DateFns.addDays(today, MAX_DEADLINE_DAYS - 1)
}

exports.isDeadlineOk = function(now, deadline) {
	var today = DateFns.startOfDay(now)
	var min = DateFns.addDays(today, MIN_DEADLINE_DAYS)
	var max = DateFns.addDays(today, MAX_DEADLINE_DAYS)
	return min <= deadline && deadline < max
}

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
exports.canPropose = function(now, initiative, user) {
	// NOTE: This currently allows people to create an initiative and hold it
	// hidden until the required number of days pass. Waiting for a solution.
	//
	// TODO: Use published_at once imported CitizenOS initiatives don't default
	// to 1970-01-01.
	var createdAt = initiative.created_at
	var min = DateFns.addDays(DateFns.startOfDay(createdAt), MIN_DEADLINE_DAYS)

	return (
		user && initiative.user_id == user.id &&
		initiative.phase == "edit" &&
		initiative.published_at &&
		(now >= min || initiative.tags.includes("fast-track"))
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
		exports.countCitizenOsSignaturesByIds(uuids),
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

exports.countCitizenOsSignaturesById = function(id) {
	return exports.countCitizenOsSignaturesByIds([id]).then(function(counts) {
		return id in counts ? counts[id] : null
	})
}

exports.countCitizenOsSignaturesByIds = function(ids) {
	if (ids.length == 0) return EMPTY_PROMISE

	return sqlite(sql`
		SELECT initiative_uuid, COUNT(*) AS count
		FROM initiative_citizenos_signatures
		WHERE initiative_uuid IN ${sql.in(ids)}
		GROUP BY initiative_uuid
	`).then(function(rows) {
		var counts = _.indexBy(rows, "initiative_uuid")
		return _.object(ids, (id) => id in counts ? counts[id].count : 0)
	})
}

exports.normalizeCitizenOsHtml = function(html) {
	// Strip the title that was once used for setting initiative.title.
	html = html.replace(/<h([1-6])>\s*([^<\s][^]*?)<\/h\1>/, "")

	// An initiative with id a2089bf7-9768-42a8-9fd8-e8139b14da47 has one empty
	// <h1></h1> preceding and one following the actual title.
	html = html.replace(/<h([1-6])>\s*<\/h\1>/g, "")

	// Remove linebreaks around headers.
	html = html.replace(/(?:<br>\s*)+(<h[1-6]>)/g, "$1")
	html = html.replace(/(<\/h[1-6]>)(?:\s*<br>)+/g, "$1")

	// Remove multiple consecutive linebreaks and whitespace around them.
	html = html.replace(/(<body>)\s*(?:<br>\s*)*/, "$1")
	html = html.replace(/(?:\s*<br>)*\s*(<\/body>)/, "$1")

	return html
}

exports.renderForParliament = function(initiative, text) {
	switch (String(text.content_type)) {
		case "application/vnd.basecamp.trix+json": return (
			Jsx("html", null, [
				Jsx("head", null, [
					Jsx("title", null, [initiative.title])
				]),

				Jsx("body", null, [
					Jsx("h1", null, [initiative.title]),
					Trix.render(text.content, {heading: "h2"})
				])
			])
		).toString("doctype")

		case "application/vnd.citizenos.etherpad+html": return text.content

		default:
			throw new RangeError("Unsupported content type: " + text.content_type)
	}
}
