var HttpError = require("standard-http-error")
var reportError = require("root").errorReporter

module.exports = function(err, req, _res, next) {
	if (!(err instanceof HttpError)) reportError(err, req)
	if (err instanceof HttpError && err.code === 412) reportError(err, req)
	next(err)
}
