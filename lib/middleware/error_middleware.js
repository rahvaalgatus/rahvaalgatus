var HttpError = require("standard-http-error")

module.exports = function(err, req, res, next) {
  // Stop handling here if there was an error, but it's been responded to
  // already. That happens when you want to still report the error to Sentry,
  // but have displayed something to the user.
  if (res.headersSent) return void 0
  if (!(err instanceof HttpError)) return void next(err)

  res.statusCode = err.code
  res.statusMessage = err.message
  res.render("500", {error: err})
}
