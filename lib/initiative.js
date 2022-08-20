var _ = require("./underscore")
var Jsx = require("j6pack")
var Trix = require("./trix")
var Mime = require("mime")
var Config = require("root").config
var DateFns = require("date-fns")
var LOCAL_GOVERNMENTS = require("./local_governments")
var sql = require("sqlate")
var sqlite = require("root").sqlite
var outdent = require("root/lib/outdent")
var Time = require("root/lib/time")
var MIN_DEADLINE_DAYS = Config.minDeadlineDays
var MAX_DEADLINE_DAYS = Config.maxDeadlineDays
var EXPIRATION_MONTHS = Config.expireSignaturesInMonths
exports.isLocalInitiative = isLocalInitiative
exports.initiativeUrl =	initiativeUrl
exports.PHASES = ["edit", "sign", "parliament", "government", "done"]

exports.PARLIAMENT_DECISIONS = [
	"return", // Derived from TAGASTATUD status.
	"reject",
	"forward",
	"solve-differently"
]

exports.COMMITTEE_MEETING_DECISIONS = [
	"continue", // JATKATA_ARUTELU
	"hold-public-hearing", // AVALIK_ISTUNG
	"reject", // ETTEPANEK_TAGASI_LYKATA
	"forward", // ETTEPANEK_INSTITUTSIOONILE
	"forward-to-government", // ETTEPANEK_VALITSUSELE
	"solve-differently", // LAHENDADA_MUUL_VIISIL
	"draft-act-or-national-matter" // ALGATADA_EELNOU_VOI_OTRK
]

exports.isAuthor = function(user, initiative) {
	return (
		initiative.user_id == user.id ||

		initiative.coauthors.some((coauthor) => (
			coauthor.user_id == user.id && coauthor.status == "accepted"
		))
	)
}

exports.getMinDeadline = function(now) {
	var today = DateFns.startOfDay(now)
	return DateFns.addDays(today, MIN_DEADLINE_DAYS)
}

exports.getMaxDeadline = function(now) {
	var today = DateFns.startOfDay(now)
	return DateFns.addDays(today, MAX_DEADLINE_DAYS)
}

exports.isDeadlineOk = function(from, now, deadline) {
	var min = exports.getMinDeadline(from)
	var max = exports.getMaxDeadline(now)
	return min <= deadline && deadline <= max
}

exports.imageUrl = function(initiative, image) {
	return initiativeUrl(initiative) + "." + Mime.extension(String(image.type))
}

exports.getRequiredSignatureCount = function(initiative) {
	if (initiative.destination == "parliament") return Config.votesRequired
	// https://www.riigiteataja.ee/akt/13312632?leiaKehtiv#para32
	var population = LOCAL_GOVERNMENTS[initiative.destination].population
	return Math.max(Math.round(population * 0.01), 5)
}

exports.canPublish = function(user) {
	return user.email && user.email_confirmed_at
}

exports.isSignable = function(now, initiative) {
	return initiative.phase == "sign" && now < initiative.signing_ends_at
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

exports.canSendToLocalGovernment = function(initiative, user, signatureCount) {
	return (
		user && initiative.user_id == user.id &&
		initiative.destination != "parliament" &&
		initiative.phase == "sign" &&
		LOCAL_GOVERNMENTS[initiative.destination].initiativesEmails.length > 0 &&

		(
			signatureCount >= exports.getRequiredSignatureCount(initiative) ||
			signatureCount >= 1 && initiative.has_paper_signatures
		)
	)
}

// Propose for voting.
exports.canPropose = function(now, initiative, user) {
	var publishedAt = initiative.published_at
	if (publishedAt == null) return false
	if (initiative.destination == null) return false

	var min = DateFns.addDays(DateFns.startOfDay(publishedAt), MIN_DEADLINE_DAYS)

	return (
		user && exports.isAuthor(user, initiative) &&
		initiative.phase == "edit" &&
		(now >= min || initiative.tags.includes("fast-track"))
	)
}

exports.canUpdateSignDeadline = function(initiative, user) {
	return (
		user && exports.isAuthor(user, initiative) &&
		initiative.phase == "sign"
	)
}

exports.countUndersignedSignaturesById = function(uuid) {
	var counts = exports.countUndersignedSignaturesByIds([uuid])
	return uuid in counts ? counts[uuid] : null
}

exports.countUndersignedSignaturesByIds = function(uuids) {
	var rows = sqlite(sql`
		SELECT initiative_uuid AS uuid, COUNT(*) AS count
		FROM initiative_signatures
		WHERE initiative_uuid IN ${sql.in(uuids)}
		GROUP BY initiative_uuid
	`)

	var counts = _.indexBy(rows, "uuid")
	return _.object(uuids, (uuid) => uuid in counts ? +counts[uuid].count : 0)
}

exports.countCitizenOsSignaturesById = function(id) {
	var counts = exports.countCitizenOsSignaturesByIds([id])
	return id in counts ? counts[id] : null
}

exports.countCitizenOsSignaturesByIds = function(ids) {
	if (ids.length == 0) return {}

	var rows = sqlite(sql`
		SELECT initiative_uuid, COUNT(*) AS count
		FROM initiative_citizenos_signatures
		WHERE initiative_uuid IN ${sql.in(ids)}
		GROUP BY initiative_uuid
	`)

	var counts = _.indexBy(rows, "initiative_uuid")
	return _.object(ids, (id) => id in counts ? counts[id].count : 0)
}

exports.getExpirationDate = function(initiative) {
	var startedOn = _.max([
		DateFns.startOfDay(initiative.signing_started_at),
		Time.parseIsoDate(Config.expireSignaturesFrom)
	])

	return DateFns.addMonths(startedOn, EXPIRATION_MONTHS)
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

exports.renderForParliament = function(text) {
	switch (String(text.content_type)) {
		case "application/vnd.basecamp.trix+json": return (
			Jsx("html", {lang: text.language}, [
				Jsx("head", null, [
					Jsx("meta", {charset: "utf-8"}),
					Jsx("title", null, [text.title]),

					Jsx("style", null, [outdent`
						body {
							white-space: pre-wrap;
						}
					`])
				]),

				Jsx("body", null, [
					Jsx("h1", null, [text.title]),
					Trix.render(text.content, {heading: "h2"})
				])
			])
		).toString("doctype")

		case "application/vnd.citizenos.etherpad+html": return text.content

		default:
			throw new RangeError("Unsupported content type: " + text.content_type)
	}
}

function initiativeUrl(initiative) {
	var host = isLocalInitiative(initiative) ? Config.localSiteUrl : Config.url
	return host + "/initiatives/" + initiative.uuid
}

function isLocalInitiative(initiative) {
	return initiative.destination && initiative.destination != "parliament"
}
