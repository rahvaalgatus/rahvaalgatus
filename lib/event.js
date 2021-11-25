var Config = require("root/config")
var DateFns = require("date-fns")
var t = require("root/lib/i18n").t.bind(null, "et")
var EVENT_NOTIFICATIONS_SINCE = new Date(Config.eventNotificationsSince)

exports.renderTitle = function(initiative, event) {
	switch (event.type) {
		case "parliament-received":
			return t("PARLIAMENT_RECEIVED")

		case "parliament-accepted":
			return t("PARLIAMENT_ACCEPTED")

		case "parliament-board-meeting":
			return t("PARLIAMENT_BOARD_MEETING")

		case "parliament-plenary-meeting":
			return t("PARLIAMENT_PLENARY_MEETING")

		case "parliament-committee-meeting":
			var meeting = event.content

			return meeting.committee
				? t("PARLIAMENT_COMMITTEE_MEETING_BY", {committee: meeting.committee})
				: t("PARLIAMENT_COMMITTEE_MEETING")

		case "parliament-decision":
			return t("PARLIAMENT_DECISION")

		case "parliament-letter":
			var letter = event.content

			return letter.direction == "incoming"
				? t("PARLIAMENT_LETTER_INCOMING")
				: t("PARLIAMENT_LETTER_OUTGOING")

		case "parliament-interpellation":
			return t("PARLIAMENT_INTERPELLATION")

		case "parliament-national-matter":
			return t("PARLIAMENT_NATIONAL_MATTER")

		case "parliament-finished":
			return t("PARLIAMENT_FINISHED")

		case "media-coverage": return event.title
		case "text": return event.title

		// Virtual events generated from initiative's columns.
		case "signature-milestone":
			return t("SIGNATURE_MILESTONE_EVENT_TITLE", {milestone: event.content})

		case "sent-to-parliament":
			return t("INITIATIVE_SENT_TO_PARLIAMENT_TITLE")

		case "sent-to-government":
			return initiative.destination != "parliament"
				? t("EVENT_SENT_TO_LOCAL_GOVERNMENT_TITLE")
				: initiative.government_agency
				? t("EVENT_SENT_TO_GOVERNMENT_TITLE_WITH_AGENCY", {
					agency: initiative.government_agency
				})
				: t("EVENT_SENT_TO_GOVERNMENT_TITLE")

		case "finished-in-government":
			return !initiative.government_agency
				? t("EVENT_FINISHED_IN_GOVERNMENT_TITLE")
				: t("EVENT_FINISHED_IN_GOVERNMENT_TITLE_WITH_AGENCY", {
					agency: initiative.government_agency
				})

		default: throw new RangeError("Unsupported event type: " + event.type)
	}
}

exports.isNotifiable = function(now, ev) {
	// Ignoring older events protects against situations where old initiatives in
	// the parliament API get documents recreated. That happened in March
	// 2020 when a few dozen old initiatives got new UUIDs, which in turn fired
	// out hundreds of notification emails for new events.
	return (
		ev.notified_at == null &&
		ev.occurred_at >= DateFns.addMonths(DateFns.startOfDay(now), -3) &&
		ev.created_at >= EVENT_NOTIFICATIONS_SINCE
	)
}
