var Url = require("url")
var Router = require("express").Router
var Config = require("root/config")
var Crypto = require("crypto")
var QueryCsrfMiddleware = require("root/lib/middleware/query_csrf_middleware")
var AUTHORIZE_URL = Config.apiAuthorizeUrl
var LANGS = require("root/lib/i18n").LANGUAGES
var DEFAULT_LANG = require("root/lib/i18n").DEFAULT_LANGUAGE
var next = require("co-next")
var csrf = new QueryCsrfMiddleware("authenticity_token_for_citizenos", "state")

exports.router = Router({mergeParams: true})

exports.router.get("/new", function(req, res, next) {
	if ("unhash" in req.query) unhash(req, res)
	else if (req.query.access_token) create(req, res, next)
	else if (req.query.error) error(req, res, next)
	else redirect(req, res, next)
})

exports.router.put("/", next(function*(req, res) {
	var lang = req.body.language in LANGS ? req.body.language : DEFAULT_LANG

  res.cookie("language", lang, {
    maxAge: 365 * 86400 * 1000,
    secure: req.secure,
    httpOnly: true
  })

	if (req.user) yield req.api("/api/users/self", {
		method: "PUT", json: {language: lang}
	})

	res.redirect(303, req.headers.referer || "/")
}))

exports.router.delete("/", function(req, res) {
	res.clearCookie("citizenos_token")
	res.redirect(302, req.headers.referer || "/")
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
		error: {name: req.query.error, message: req.query.error_description},
	})
}

function rand(length) { return Crypto.randomBytes(length).toString("hex") }
