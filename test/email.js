var {sendEmail} = require("root")

module.exports = function() {
	beforeEach(function() { this.emails = sendEmail.sent = [] })
}
