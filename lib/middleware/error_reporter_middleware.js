var _ = require("root/lib/underscore")
var Url = require("url")
var HttpError = require("standard-http-error")
var reportError = require("root").errorReporter
var FILTERED_HEADERS = ["authorization", "cookie"]

module.exports = function(err, req, _res, next) {
	if (!isReportable(err)) return void next(err)

	reportError(err, {
		request: {
			method: req.method,
			url: `${req.protocol}://${req.headers.host}${req.originalUrl || req.url}`,
			headers: _.omit(req.headers, FILTERED_HEADERS),
			query_string: Url.parse(req.originalUrl || req.url).query,

			data: (
				req.body == null ? undefined :
				typeof req.body == "string" ? req.body :
				JSON.stringify(req.body)
			)
		},

		user: {
			id: req.user && req.user.id,
			name: req.user && req.user.name,
			email: req.user && req.user.email,
			language: req.user && req.user.language,
			ip_address: req.ip
		}
	})

	next(err)
}

function isReportable(err) {
  var code = err instanceof HttpError ? err.code : null
  return code == null || !(code >= 200 && code < 500) || code === 412
}
