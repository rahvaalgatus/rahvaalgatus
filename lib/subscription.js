var _ = require("root/lib/underscore")
var I18n = require("root/lib/i18n")
var Config = require("root/config")
var messagesDb = require("root/db/initiative_messages_db")
var sendEmail = require("root").sendEmail

exports.send = function*(msg, subscriptions) {
	for (
		var i = 0, batches = _.chunk(subscriptions, 1000), sent = [];
		i < batches.length;
		++i
	) {
		yield sendBatch(msg, batches[i])
		sent = sent.concat(batches[i].map((sub) => sub.email))
		yield messagesDb.update(msg, {updated_at: new Date, sent_to: sent})
	}

	yield messagesDb.update(msg, {updated_at: new Date, sent_at: new Date})
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
