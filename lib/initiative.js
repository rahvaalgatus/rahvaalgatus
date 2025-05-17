var _ = require("./underscore")
var Jsx = require("j6pack")
var Trix = require("./trix")
var Mime = require("mime")
var Config = require("root").config
var DateFns = require("date-fns")
var LOCAL_GOVERNMENTS = require("./local_governments")
var outdent = require("root/lib/outdent")
exports.isPhaseGt = isPhaseGt
exports.isPhaseGte = isPhaseGte
var MAX_SLUG_LENGTH = 150

var PHASES = exports.PHASES = [
	"edit",
	"sign",
	"parliament",
	"government",
	"done"
]

exports.PARLIAMENT_DECISIONS = [
	"return", // Derived from TAGASTATUD status.
	"reject",
	"forward",
	"forward-to-government",
	"solve-differently",
	"draft-act-or-national-matter"
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

exports.url = function(initiative) {
	return Config.url + exports.path(initiative)
}

exports.path = function({id}) {
	return "/initiatives/" + id
}

exports.slugUrl = function(initiative) {
	return Config.url + exports.slugPath(initiative)
}

exports.slugPath = function({id, slug}) {
	return "/initiatives/" + id + (slug ? "-" + encodeURIComponent(slug) : "")
}

exports.slug = function(title) {
	return title
		.trim()
		.toLowerCase()
		.replace(/\s+/g, "-")
		.replace(/[/|<>]/g, "-")
		.replace(/-\+-*/g, "+")
		.replace(/-+/g, "-")
		.replace(/[:!?,.%#;'"„“”^()[\]{}]/g, "")
		.replace(/^-+/, "")
		.slice(0, MAX_SLUG_LENGTH)
		.replace(/-+$/, "") || null
}

exports.isAuthor = function(user, initiative) {
	return (
		initiative.user_id == user.id ||

		initiative.coauthors.some((coauthor) => (
			coauthor.user_id == user.id && coauthor.status == "accepted"
		))
	)
}

exports.getMinEditingDeadline = function(now) {
	var today = DateFns.startOfDay(now)
	return DateFns.addDays(today, Config.minEditingDeadlineDays)
}

exports.getMaxEditingDeadline = function(now) {
	var today = DateFns.startOfDay(now)
	return DateFns.addMonths(today, Config.maxEditingDeadlineMonths)
}

exports.getMinSigningDeadline = function(now) {
	var today = DateFns.startOfDay(now)
	return DateFns.addDays(today, Config.minSigningDeadlineDays)
}

exports.getMaxSigningDeadline = function(now) {
	var today = DateFns.startOfDay(now)
	return DateFns.addMonths(today, Config.maxSigningDeadlineMonths)
}

exports.imagePath = function(initiative, image) {
	return exports.path(initiative) + "." + Mime.extension(String(image.type))
}

exports.imageUrl = function(initiative, image) {
	return Config.url + exports.imagePath(initiative, image)
}

exports.authorNames = function(initiative) {
	// While coauthors could also just be translators and uninvolved with the
	// contents of the initiative, we'll presume they'll be removed from the
	// initiative once it goes to signing (when it gets most of its attention) or
	// they'll do their work outside of the site entirely.
	return _.uniq(_.concat(
		initiative.author_name,
		initiative.user_name,
		initiative.coauthors && _.map(initiative.coauthors, "user_name")
	).filter(Boolean))
}

exports.getSignatureThreshold = function(initiative) {
	if ((
		isPhaseGt(initiative.phase, "sign") ||
		initiative.phase == "sign" && initiative.signing_expired_at
	) && initiative.signature_threshold != null)
		return initiative.signature_threshold

	else if (initiative.destination == "parliament") return Config.votesRequired
	else return LOCAL_GOVERNMENTS[initiative.destination].signatureThreshold
}

exports.canPublish = function(user) {
	return user.email && user.email_confirmed_at
}

exports.isSignable = function(now, initiative) {
	return (
		initiative.phase == "sign" &&
		now < initiative.signing_ends_at &&
		initiative.signing_expired_at == null
	)
}

exports.canSendToParliament = function(initiative, user, signatureCount) {
	return (
		user && initiative.user_id == user.id &&
		initiative.destination == "parliament" &&
		initiative.phase == "sign" &&
		initiative.signing_expired_at == null &&

		(
			signatureCount >= exports.getSignatureThreshold(initiative) ||
			signatureCount >= 1 && initiative.has_paper_signatures
		)
	)
}

exports.canSendToLocalGovernment = function(initiative, user, signatureCount) {
	return (
		user && initiative.user_id == user.id &&
		initiative.destination != "parliament" &&
		initiative.phase == "sign" &&
		initiative.signing_expired_at == null &&
		LOCAL_GOVERNMENTS[initiative.destination].initiativesEmails.length > 0 &&

		(
			signatureCount >= exports.getSignatureThreshold(initiative) ||
			signatureCount >= 1 && initiative.has_paper_signatures
		)
	)
}

// Propose for voting.
exports.canPropose = function(now, initiative, user) {
	var publishedAt = initiative.published_at
	if (publishedAt == null) return false
	if (initiative.destination == null) return false

	var min = DateFns.addDays(
		DateFns.startOfDay(publishedAt),
		Config.minEditingDeadlineDays
	)

	return (
		user && exports.isAuthor(user, initiative) &&
		initiative.phase == "edit" &&
		(now >= min || initiative.tags.includes("fast-track"))
	)
}

exports.canUpdateSignDeadline = function(initiative, user) {
	return (
		user && exports.isAuthor(user, initiative) &&
		initiative.phase == "sign" &&
		initiative.signing_expired_at == null
	)
}

exports.getExpirationDate = function(initiative) {
	var startedOn = DateFns.startOfDay(initiative.signing_started_at)
	return DateFns.addMonths(startedOn, Config.expireSignaturesInMonths)
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
	var CSS = outdent`
		body {
			white-space: pre-wrap;
		}
	`

	switch (String(text.content_type)) {
		case "application/vnd.basecamp.trix+json": return (
			Jsx("html", {lang: text.language}, [
				Jsx("head", null, [
					Jsx("meta", {charset: "utf-8"}),
					Jsx("title", null, [text.title]),
					Jsx("style", null, [CSS])
				]),

				Jsx("body", null, [
					Jsx("h1", null, [text.title]),
					Trix.render(text.content, {heading: "h2"})
				])
			])
		).toString("doctype")

		case "application/vnd.rahvaalgatus.trix-sections+json": return (
			Jsx("html", {lang: text.language}, [
				Jsx("head", null, [
					Jsx("meta", {charset: "utf-8"}),
					Jsx("title", null, [text.title]),
					Jsx("style", null, [CSS])
				]),

				Jsx("body", null, [
					Jsx("h1", null, [text.title]),

					_.map(text.content, function(content, section) {
						if (content.every(Trix.isBlankString)) return null

						switch (section) {
							case "summary": return Jsx("big", null, [
								Trix.render(content, {heading: "h2"})
							])

							default: return Trix.render(content, {heading: "h2"})
						}
					})
				])
			])
		).toString("doctype")

		case "application/vnd.citizenos.etherpad+html": return text.content

		default:
			throw new RangeError("Unsupported content type: " + text.content_type)
	}
}

function isPhaseGt(a, b) { return PHASES.indexOf(a) > PHASES.indexOf(b) }
function isPhaseGte(a, b) { return PHASES.indexOf(a) >= PHASES.indexOf(b) }
