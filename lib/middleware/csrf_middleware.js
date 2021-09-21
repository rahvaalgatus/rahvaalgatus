var Crypto = require("crypto")
var HttpError = require("standard-http-error")
var SAFE = ["GET", "HEAD", "OPTIONS"]
var COOKIE = "csrf_token"
var QUERY = "csrf-token"
var HEADER = "x-csrf-token"
var BODY = "_csrf_token"
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
	return req.cookies && req.cookies[COOKIE]
}

function getFromRequest(req) {
	return req.headers[HEADER] || req.query[QUERY] || req.body && req.body[BODY]
}

function reset(req, res, token) {
	if (token == null) token = Crypto.randomBytes(16).toString("hex")

	// Seeing a fair number of mismatching CSRF tokens when the site's opened
	// inside the Facebook or Instagram iOS apps. Caching headers don't seem to
	// matter. Could be related to disappearing session cookies. Testing
	// long-lived CSRF tokens as a work-around.
	res.cookie(COOKIE, token, {
		secure: req.secure,
		httpOnly: true,
		maxAge: 180 * 86400 * 1000
	})

	req.csrfToken = token
	return token
}
