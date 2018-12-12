var StreamTransport = require("nodemailer/lib/stream-transport")
var streamTransport = new StreamTransport({buffer: true})
var createEmailer = require("./emailer")

module.exports = function(opts) {
	var send = createEmailer(opts, streamTransport)

	function sendEmail(email) {
		// NOTE: Lazy bind send.sent to permit overwriting when clearing in tests.
		return send(email).then((res) => (sendEmail.sent.push(res), res))
	}

	sendEmail.sent = []
	return sendEmail
}
