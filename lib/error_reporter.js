var Raven = require("raven")
var IncomingMessage = require("http").IncomingMessage
var parseRequest = require("raven").parsers.parseRequest

module.exports = ErrorReporter

function ErrorReporter(dsn) {
	this.raven = new Raven.Client(dsn)
	this.raven.on("error", this.onError.bind(this))
	return this.report.bind(this)
}

ErrorReporter.prototype.logger = console

ErrorReporter.prototype.report = function(err, data) {
	if (data instanceof IncomingMessage) data = parseRequest(data)
	this.raven.captureException(err, data)
}

ErrorReporter.prototype.onError = function(err) {
	this.logger.error(err)
}
