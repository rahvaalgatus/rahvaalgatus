var sendEmail = require("root").sendEmail

module.exports = function() {
	beforeEach(clear)
}

function clear() { this.emails = sendEmail.sent = [] }
