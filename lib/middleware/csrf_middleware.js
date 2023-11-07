var Config = require("root").config
var Crypto = require("crypto")
var HttpError = require("standard-http-error")
var SAFE = ["GET", "HEAD", "OPTIONS"]
exports = module.exports = CsrfMiddleware
exports.reset = reset

function CsrfMiddleware(req, res, next) {
	req.csrfToken = getFromClient(req, res) || reset(req, res)
	if (SAFE.includes(req.method)) return void next()

	var a = req.csrfToken
	var b = getFromRequest(req)
	next(a && b && a === b ? null : new HttpError(412, "Bad CSRF Token"))
}

function getFromClient(req) {
	return req.cookies && req.cookies[Config.csrfCookieName]
}

function getFromRequest(req) {
	return (
		req.headers["x-csrf-token"] ||
		req.query["csrf-token"] ||
		req.body && req.body._csrf_token
	)
}

function reset(req, res, token) {
	if (token == null) token = Crypto.randomBytes(16).toString("hex")

	// Seeing a fair number of mismatching CSRF tokens when the site's opened
	// inside the Facebook or Instagram iOS apps. Caching headers don't seem to
	// matter. Could be related to disappearing session cookies. Testing
	// long-lived CSRF tokens as a work-around.
	res.cookie(Config.csrfCookieName, token, {
		secure: req.secure,
		sameSite: "lax",
		httpOnly: true,
		domain: Config.csrfCookieDomain,
		maxAge: 180 * 86400 * 1000
	})

	req.csrfToken = token
	return token
}
