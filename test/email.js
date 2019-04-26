var sendEmail = require("root").sendEmail

module.exports = function() {
	beforeEach(function() { this.emails = sendEmail.sent = [] })
}
