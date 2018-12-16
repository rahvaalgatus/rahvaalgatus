var Url = require("url")
var Router = require("express").Router
var Config = require("root/config")
var QueryCsrfMiddleware = require("root/lib/middleware/query_csrf_middleware")
var randomHex = require("root/lib/crypto").randomHex
var AUTHORIZE_URL = Config.apiAuthorizeUrl
var DEFAULT_LANG = Config.language
var LANGS = require("root/lib/i18n").STRINGS
var TOKEN_COOKIE_NAME = "citizenos_token"
var ENV = process.env.ENV
var next = require("co-next")
var csrf = require("root/lib/middleware/csrf_middleware")
var oAuthCsrf = new QueryCsrfMiddleware("csrf_token_for_citizenos", "state")

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
		httpOnly: true,
		secure: req.secure,
		maxAge: 365 * 86400 * 1000
	})

	if (req.user) yield req.cosApi("/api/users/self", {
		method: "PUT", json: {language: lang}
	})

	res.redirect(303, req.headers.referer || "/")
}))

exports.router.delete("/", function(req, res) {
	res.clearCookie(TOKEN_COOKIE_NAME, {
		httpOnly: true,
		secure: req.secure,
		domain: Config.cookieDomain
	})

	csrf.reset(req, res)
	res.redirect(302, req.headers.referer || "/")
})

function redirect(req, res) {
	oAuthCsrf.reset(req, res)

	var referrer = req.headers.referer
	if (referrer && Url.parse(referrer).hostname === req.hostname) {
		res.cookie("session_referrer", referrer, {
			secure: req.secure,
			httpOnly: true
		})
	}

	var host = `${req.protocol}://${req.headers.host}`
	var cb = `${host}${req.baseUrl}${req.path}?unhash`

	// Delete stale TLD cookies. Previously domains were set on
	// "rahvaalgatus.ee", but are now set on ".rahvaalgatus.ee". Without removing
	// the former, they would get sent before the latter.
	res.clearCookie(TOKEN_COOKIE_NAME, {httpOnly: true, secure: req.secure})

	res.redirect(302, Url.format({
		__proto__: Url.parse(AUTHORIZE_URL),

		query: {
			response_type: "id_token token",
			response_mode: "query",
			client_id: Config.apiPartnerId,
			redirect_uri: cb,
			scope: "openid",
			nonce: randomHex(16),
			state: req.cookies.csrf_token_for_citizenos,
			ui_locales: req.lang
		}
	}))
}

function unhash(req, res) {
	res.render("session/unhash", {path: req.baseUrl + req.path})
}

function create(req, res, next) {
	var err = oAuthCsrf.validate(req)
	if (err) return void next(err)
	oAuthCsrf.delete(req, res)
	csrf.reset(req, res)

	// In production the CitizenOS instance sets the token cookie for a larger
	// scope than it redirects here with. Use that as it works across partnerIds.
	if (
		(ENV !== "production" && ENV !== "test") ||
		req.cookies[TOKEN_COOKIE_NAME] == null
	) res.cookie(TOKEN_COOKIE_NAME, req.query.access_token, {
		httpOnly: true,
		secure: req.secure,
		domain: Config.cookieDomain,
		maxAge: 30 * 86400 * 1000
	})

	var referrer = req.cookies.session_referrer || "/"
	res.clearCookie("session_referrer")
	res.redirect(302, referrer)
}

function error(req, res, next) {
	var err = oAuthCsrf.validate(req)
	if (err) return void next(err)
	oAuthCsrf.delete(req, res)

	var referrer = req.cookies.session_referrer || "/"
	res.clearCookie("session_referrer")

	switch (req.query.error) {
		case "access_denied":
			res.redirect(302, referrer)
			break

		default: res.render("500", {
			error: {name: req.query.error, message: req.query.error_description},
		})
	}
}
