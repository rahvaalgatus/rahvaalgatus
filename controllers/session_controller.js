var Url = require("url")
var Router = require("express").Router
var Config = require("root/config")
var Crypto = require("crypto")
var AUTHORIZE_URL = Config.apiAuthorizeUrl
var QueryCsrfMiddleware = require("root/lib/middleware/query_csrf_middleware")
var csrf = new QueryCsrfMiddleware("authenticity_token_for_citizenos", "state")

exports.router = Router({mergeParams: true})

exports.router.get("/new", function(req, res, next) {
	if ("unhash" in req.query) unhash(req, res)
	else if (req.query.access_token) create(req, res, next)
	else if (req.query.error) error(req, res, next)
	else redirect(req, res, next)
})

function redirect(req, res) {
  csrf.reset(req, res)

	var host = `${req.protocol}://${req.headers.host}`
  var cb = `${host}${req.baseUrl}${req.path}?unhash`

	res.redirect(302, Url.format({
		__proto__: Url.parse(AUTHORIZE_URL),

		query: {
			response_type: "id_token token",
			response_mode: "query",
			client_id: Config.apiPartnerId,
			redirect_uri: cb,
			scope: "openid",
			nonce: rand(16),
			state: req.cookies.authenticity_token_for_citizenos,
			ui_locales: req.lang
		}
	}))
}

function unhash(req, res) {
	res.render("session/unhash", {path: req.baseUrl + req.path})
}

function create(req, res, next) {
  var err = csrf.validate(req, res)
  if (err) return void next(err)
  csrf.delete(req, res)

  res.cookie("citizenos_token", req.query.access_token, {
    maxAge: 30 * 86400 * 1000,
    secure: req.secure,
    httpOnly: false
  })

	res.redirect(302, "/")
}

function error(req, res, next) {
  var err = csrf.validate(req, res)
  if (err) return void next(err)
  csrf.delete(req, res)

	res.render("500", {
		error: new Error(req.query.error),
		description: req.query.error_description
	})
}

function rand(length) { return Crypto.randomBytes(length).toString("hex") }
