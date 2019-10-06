var t = require("root/lib/i18n").t.bind(null, "et")
exports.renderEventTitle = renderEventTitle

function renderEventTitle(event) {
	switch (event.type) {
		case "parliament-received":
			return t("PARLIAMENT_RECEIVED")

		case "parliament-accepted":
			return t("PARLIAMENT_ACCEPTED")

		case "parliament-board-meeting":
			return t("PARLIAMENT_BOARD_MEETING")

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

		default: throw new RangeError("Unsupported event type: " + event.type)
	}
}
