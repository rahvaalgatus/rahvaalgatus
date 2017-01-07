var Crypto = require("crypto")
var HttpError = require("standard-http-error")
var SAFE = ["GET", "HEAD", "OPTIONS"]
var COOKIE = "csrf_token"
var HEADER = "x-csrf-token"
var BODY = "_csrf_token"

exports = module.exports = function(req, res, next) {
	req.csrfToken = exports.getFromClient(req, res) || exports.reset(req, res)
	if (~SAFE.indexOf(req.method)) return void next()

	var a = exports.getFromClient(req, res)
	var b = exports.getFromRequest(req, res)
	next(a && b && a === b ? null : new HttpError(412, "Bad CSRF Token"))
}

exports.getFromClient = function(req, res) {
	return req.cookies && req.cookies[COOKIE]
}

exports.getFromRequest = function(req) {
	return req.headers[HEADER] || req.body && req.body[BODY]
}

exports.reset = function(req, res, token) {
	if (token == null) token = rand(16)
	res.cookie(COOKIE, token, {secure: req.secure, httpOnly: true})
	req.csrfToken = token
	return token
}

function rand(length) { return Crypto.randomBytes(length).toString("hex") }
