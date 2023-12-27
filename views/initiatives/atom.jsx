/** @jsx Jsx */
var _ = require("root/lib/underscore")
var Jsx = require("j6pack/xml")
var Config = require("root").config
var Initiative = require("root/lib/initiative")
var t = require("root/lib/i18n").t.bind(null, "et")
var concat = Array.prototype.concat.bind(Array.prototype)
var renderEventTitle = require("root/lib/event").renderTitle
var EMPTY_ARR = Array.prototype
exports = module.exports = AtomView
exports.EventEntryView = EventEntryView

var CATEGORIES = {
	admin: "official",
	author: "initiator"
}

function AtomView({initiative, events}) {
	var updatedAt = events.length
		? _.last(events).updated_at
		: initiative.created_at

	return <feed xmlns="http://www.w3.org/2005/Atom">
		<id>{Config.url + "/initiatives/" + initiative.uuid}</id>
		<title>{t("ATOM_INITIATIVE_FEED_TITLE", {title: initiative.title})}</title>

		<link
			rel="self"
			type="application/atom+xml"
			href={Initiative.url(initiative) + ".atom"}
		/>

		<link
			rel="alternate"
			type="text/html"
			href={Initiative.slugUrl(initiative)}
		/>

		<updated>{updatedAt.toJSON()}</updated>

		<author>
			<name>{Config.title}</name>
			<uri>{Config.url}</uri>
		</author>

		{events.map((event) => <EventEntryView
			initiative={initiative}
			event={event}
		/>)}
	</feed>
}

function EventEntryView({initiative, event, sourced}) {
	var initiativeSlugUrl = Initiative.slugUrl(initiative)
	var initiativeUuidUrl = Config.url + "/initiatives/" + initiative.uuid
	var title
	var content
	var contentUrl
	var category = CATEGORIES[event.origin]
	var authorName
	var decision
	var meeting
	var links

	switch (event.type) {
		case "signature-milestone":
			title = renderEventTitle(initiative, event)
			break

		case "sent-to-parliament":
			title = renderEventTitle(initiative, event)
			content = t("INITIATIVE_SENT_TO_PARLIAMENT_BODY")
			break

		case "parliament-received":
			title = renderEventTitle(initiative, event)
			break

		case "parliament-accepted":
			title = renderEventTitle(initiative, event)
			var {committee} = event.content
			if (committee) content = t("PARLIAMENT_ACCEPTED_SENT_TO_COMMITTEE", {
				committee: committee
			})
			break

		case "parliament-board-meeting":
			title = renderEventTitle(initiative, event)
			break

		case "parliament-plenary-meeting":
			title = renderEventTitle(initiative, event)
			meeting = event.content
			links = meeting.links || EMPTY_ARR

			content = concat(
				meeting.summary || EMPTY_ARR,

				links.length
					? links.map((link) => `${link.title}: ${link.url}`).join("\n")
					: EMPTY_ARR
			).join("\n\n")
			break

		case "parliament-committee-meeting":
			title = renderEventTitle(initiative, event)
			meeting = event.content
			decision = meeting.decision
			links = meeting.links || EMPTY_ARR

			content = concat(
				meeting.summary || EMPTY_ARR,

				decision == "continue"
				? t("PARLIAMENT_MEETING_DECISION_CONTINUE")
				: decision == "hold-public-hearing"
				? t("PARLIAMENT_MEETING_DECISION_HOLD_PUBLIC_HEARING")
				: decision == "reject"
				? t("PARLIAMENT_MEETING_DECISION_REJECT")
				: decision == "forward"
				? t("PARLIAMENT_MEETING_DECISION_FORWARD")
				: decision == "forward-to-government"
				? t("PARLIAMENT_MEETING_DECISION_FORWARD_TO_GOVERNMENT")
				: decision == "solve-differently"
				? t("PARLIAMENT_MEETING_DECISION_SOLVE_DIFFERENTLY")
				: decision == "draft-act-or-national-matter"
				? t("PARLIAMENT_MEETING_DECISION_DRAFT_ACT_OR_NATIONAL_MATTER")
				: EMPTY_ARR,

				links.length
					? links.map((link) => `${link.title}: ${link.url}`).join("\n")
					: EMPTY_ARR
			).join("\n\n")
			break

		case "parliament-decision":
			title = renderEventTitle(initiative, event)
			if (event.content.summary) content = event.content.summary
			break

		case "parliament-letter":
			title = renderEventTitle(initiative, event)
			var letter = event.content

			var header = [
				t("PARLIAMENT_LETTER_TITLE") + ": " + letter.title,

				letter.direction == "incoming"
				? t("PARLIAMENT_LETTER_FROM") + ": " + letter.from
				: t("PARLIAMENT_LETTER_TO") + ": " + letter.to
			].join("\n")

			content = concat(
				header,
				letter.summary || EMPTY_ARR
			).join("\n\n")
			break

		case "parliament-interpellation":
			title = renderEventTitle(initiative, event)
			var interpellation = event.content

			content = [
				t("PARLIAMENT_INTERPELLATION_TO") + ": " +
					interpellation.to,
				t("PARLIAMENT_INTERPELLATION_DEADLINE") + ": " +
					interpellation.deadline
			].join("\n")
			break

		case "parliament-national-matter":
			title = renderEventTitle(initiative, event)
			break

		case "parliament-finished":
			title = renderEventTitle(initiative, event)
			decision = initiative.parliament_decision

			if (decision) content =
				decision == "return"
				? t("PARLIAMENT_DECISION_RETURN")
				: decision == "reject"
				? t("PARLIAMENT_DECISION_REJECT")
				: decision == "forward"
				? t("PARLIAMENT_DECISION_FORWARD")
				: decision == "forward-to-government"
				? t("PARLIAMENT_DECISION_FORWARD_TO_GOVERNMENT")
				: decision == "solve-differently"
				? t("PARLIAMENT_DECISION_SOLVE_DIFFERENTLY")
				: decision == "draft-act-or-national-matter"
				? t("PARLIAMENT_DECISION_DRAFT_ACT_OR_NATIONAL_MATTER")
				: null
			break

		case "sent-to-government":
			title = renderEventTitle(initiative, event)
			break

		case "finished-in-government":
			title = renderEventTitle(initiative, event)

			if (initiative.government_decision) content =
				t("EVENT_FINISHED_IN_GOVERNMENT_CONTENT", {
					decision: initiative.government_decision
				})
			break

		case "media-coverage":
			title = renderEventTitle(initiative, event)
			contentUrl = event.content.url
			authorName = event.content.publisher
			break

		case "text":
			title = renderEventTitle(initiative, event)
			content = event.content
			authorName = event.origin == "author" ? event.user_name : null
			break

		default: throw new RangeError("Unsupported event type: " + event.type)
	}

	return <entry>
		<id>{initiativeUuidUrl + "/events/" + event.id}</id>

		<link
			rel="alternate"
			type="text/html"
			href={initiativeSlugUrl + "#event-" + event.id}
		/>

		<title>{(sourced ? `${initiative.title}: ` : "") + title}</title>
		<published>{event.occurred_at.toJSON()}</published>
		<updated>{event.updated_at.toJSON()}</updated>
		{category ? <category term={category} /> : null}

		{
			content ? <content type="text">{content}</content> :
			contentUrl ? <content type="text/html" src={contentUrl} /> :
			null
		}

		{authorName ? <author><name>{authorName}</name></author> : null}

		{sourced ? <source>
			<id>{initiativeUuidUrl}</id>

			<title>
				{t("ATOM_INITIATIVE_FEED_TITLE", {title: initiative.title})}
			</title>

			<link
				rel="self"
				type="application/atom+xml"
				href={Initiative.url(initiative) + ".atom"}
			/>

			<link rel="alternate" type="text/html" href={initiativeSlugUrl} />
		</source> : null}
	</entry>
}
