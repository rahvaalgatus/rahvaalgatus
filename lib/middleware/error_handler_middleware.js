var HttpError = require("standard-http-error")
var ENV = process.env.ENV

module.exports = function(render, err, req, res, _next) {
	// Stop handling here if there was an error, but it's been responded to
	// already. That happens when you want to still report the error to Sentry,
	// but have displayed something to the user.
	if (res.headersSent) return

	if (err instanceof HttpError) {
		res.statusCode = err.code
		res.statusMessage = err.message
		return void render(err, req, res)
	}

	res.statusCode = 500

	switch (ENV) {
		case "development":
		case "test":
			res.setHeader("Content-Type", "text/plain")
			return void res.end(err.stack)

		default: render(err, req, res)
	}
}
