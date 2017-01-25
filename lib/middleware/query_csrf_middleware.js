var Crypto = require("crypto")
var HttpError = require("standard-http-error")
module.exports = QueryCsrfMiddleware

function QueryCsrfMiddleware(cookie, query) {
	this.cookie = cookie
	this.query = query
}

QueryCsrfMiddleware.prototype.validate = function(req) {
  var a = req.cookies[this.cookie]
  var b = req.query[this.query]
  return a && b && a === b ? null : new HttpError(412, "Bad CSRF Token")
}

QueryCsrfMiddleware.prototype.reset = function(req, res) {
  var token = rand(16)

  res.cookie(this.cookie, token, {
    secure: req.secure, httpOnly: true, path: req.baseUrl
  })

  req.cookies[this.cookie] = token
}

QueryCsrfMiddleware.prototype.delete = function(req, res) {
  res.clearCookie(this.cookie, {path: req.baseUrl})
}

function rand(length) { return Crypto.randomBytes(length).toString("hex") }
