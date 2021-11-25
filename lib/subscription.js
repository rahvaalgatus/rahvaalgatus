var _ = require("root/lib/underscore")
var I18n = require("root/lib/i18n")
var Config = require("root/config")
var Initiative = require("root/lib/initiative")
var messagesDb = require("root/db/initiative_messages_db")
var renderEmail = require("root/lib/i18n").email.bind(null, "et")
var sendEmail = require("root").sendEmail
var renderEventTitle = require("root/lib/event").renderTitle
var formatDate = require("root/lib/i18n").formatDate.bind(null, "numeric")

// TODO: Rename "title" to "subject" to match sendEmail.
exports.renderEventsEmail = function(t, initiative, events) {
	events = _.sortBy(events, "occurred_at")
	if (events.length == 0) throw new RangeError("No events to render")

	var initiativeUrl = Initiative.initiativeUrl(initiative)

	if (events.length == 1) {
		var event = events[0]

		switch (event.type) {
			case "text": return {
				title: t("EMAIL_INITIATIVE_TEXT_EVENT_MESSAGE_TITLE", {
					title: event.title,
					initiativeTitle: initiative.title,
				}),

				text: renderEmail("EMAIL_INITIATIVE_TEXT_EVENT_MESSAGE_BODY", {
					title: event.title,
					text: _.quoteEmail(event.content),
					initiativeTitle: initiative.title,
					initiativeUrl
				})
			}

			case "media-coverage": return {
				title: t("EMAIL_INITIATIVE_MEDIA_COVERAGE_EVENT_MESSAGE_TITLE", {
					title: event.title,
					initiativeTitle: initiative.title,
				}),

				text: renderEmail("EMAIL_INITIATIVE_MEDIA_COVERAGE_EVENT_MESSAGE_BODY", {
					title: event.title,
					url: event.content.url,
					publisher: event.content.publisher,
					initiativeTitle: initiative.title,
					initiativeUrl
				})
			}

			default: throw new RangeError("Unsupported event type: " + event.type)
		}
	}
	else return {
		title: t("INITIATIVE_PARLIAMENT_EVENT_MESSAGE_TITLE", {
			initiativeTitle: initiative.title,
			eventDate: formatDate(_.last(events).occurred_at)
		}),

		text: renderEmail("INITIATIVE_PARLIAMENT_EVENT_MESSAGE_BODY", {
			initiativeTitle: initiative.title,
			initiativeUrl,
			eventsUrl: `${initiativeUrl}#events`,

			eventTitles: events.map((ev) => (
				`${formatDate(ev.occurred_at)} — ${renderEventTitle(initiative, ev)}`
			)).join("\n")
		})
	}
}

exports.send = function*(msg, subscriptions) {
	for (
		var i = 0, batches = _.chunk(subscriptions, 1000), sent = [];
		i < batches.length;
		++i
	) {
		yield sendBatch(msg, batches[i])
		sent = sent.concat(batches[i].map((sub) => sub.email))

		if (msg.id) yield messagesDb.update(msg, {
			updated_at: new Date, sent_to: sent
		})
	}

	if (msg.id) yield messagesDb.update(msg, {
		updated_at: new Date, sent_at: new Date
	})
}

function sendBatch(msg, subscriptions) {
	if (subscriptions.length > 1000)
		// https://documentation.mailgun.com/en/latest/user_manual.html
		throw new RangeError("Batch sending max limit is 1000 recipients")

	var recipients = _.fromEntries(subscriptions.map((sub) => [sub.email, {
		unsubscribeUrl: sub.initiative_uuid
			? `/initiatives/${sub.initiative_uuid}/subscriptions/${sub.update_token}`
			: `/subscriptions/${sub.update_token}`
	}]))

	return sendEmail({
		to: {name: "", address: "%recipient%"},
		subject: msg.title,
		headers: {"X-Mailgun-Recipient-Variables": JSON.stringify(recipients)},
		envelope: {to: Object.keys(recipients)},

		text: I18n.interpolate(msg.text, {
			unsubscribeUrl: Config.url + "%recipient.unsubscribeUrl%"
		})
	})
}
