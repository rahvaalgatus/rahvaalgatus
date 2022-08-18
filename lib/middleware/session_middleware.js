var Config = require("root/config")
var usersDb = require("root/db/users_db")
var sessionsDb = require("root/db/sessions_db")
var sql = require("sqlate")
var sha256 = require("root/lib/crypto").hash.bind(null, "sha256")
var SESSION_COOKIE_NAME = Config.sessionCookieName

module.exports = function(req, res, next) {
	req.session = null
	req.user = null

	if ("citizenos_token" in req.cookies) res.clearCookie("citizenos_token", {
		httpOnly: true,
		secure: req.secure,
		domain: Config.cookieDomain
	})

	var sessionToken = req.cookies[SESSION_COOKIE_NAME]
	if (sessionToken == null) return void next()

	var session = req.session = sessionsDb.read(sql`
		SELECT * FROM sessions
		WHERE token_sha256 = ${sha256(Buffer.from(sessionToken, "hex"))}
		AND deleted_at IS NULL
	`)

	if (session == null) return void next()

	req.user = usersDb.read(session.user_id)
	next()
}
