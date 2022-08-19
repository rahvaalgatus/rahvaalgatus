var _ = require("root/lib/underscore")
var StreamTransport = require("nodemailer/lib/stream-transport")
var streamTransport = new StreamTransport({buffer: true})
var createEmailer = require("./emailer")
var parseEmailMime = require("emailjs-mime-parser").default

module.exports = function(opts) {
	var send = createEmailer(opts, streamTransport)

	function sendEmail(email) {
		// NOTE: Lazy bind send.sent to permit overwriting when clearing in tests.
		return send(email).then(function(res) {
			sendEmail.sent.push(_.assign(res, parseEmail(res.message)))
			return res
		})
	}

	sendEmail.sent = []
	return sendEmail
}

function parseEmail(msg) {
	var email = parseEmailMime(msg.toString())

	return {
		headers: _.mapValues(email.headers, parseHeader),
		body: Buffer.from(email.content).toString().replace(/\n$/, "")
	}

	function parseHeader(values) {
		return values.length > 1 ? values.map((v) => v.value) : values[0].value
	}
}
