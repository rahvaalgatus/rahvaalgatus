var Nodemailer = require("nodemailer/lib/mailer")
var SmtpTransport = require("nodemailer/lib/smtp-transport")
var {logger} = require("root")
var wrap = Array.prototype.concat.bind(Array.prototype)

module.exports = function(opts, transport) {
  var defaults = {from: opts.from}

  var nodemailer = new Nodemailer(transport || new SmtpTransport({
    host: opts.host,
    port: opts.port,
    auth: opts.user != null ? {user: opts.user, pass: opts.password} : null
  }), null, defaults)

	return sendEmail.bind(null, nodemailer)
}

function sendEmail(nodemailer, message) {
	var emails = wrap(message.to).map((to) => to.address || to).join(", ")
	logger.info("Emailing %s: %j.", emails, message.subject)
  return nodemailer.sendMail(message)
}
