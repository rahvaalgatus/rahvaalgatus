var Config = require("root").config
var DateFns = require("date-fns")
var usersDb = require("root/db/users_db")
var sessionsDb = require("root/db/sessions_db")
var sql = require("sqlate")
var sha256 = require("root/lib/crypto").hash.bind(null, "sha256")

module.exports = function(req, res, next) {
	req.session = null
	req.user = null

	if ("citizenos_token" in req.cookies) res.clearCookie("citizenos_token", {
		httpOnly: true,
		secure: req.secure,
		domain: Config.sessionCookieDomain
	})

	var sessionToken = req.cookies[Config.sessionCookieName]
	if (sessionToken == null) return void next()

	// It'd be best perhaps to extend the length of the session by a month every
	// time activity occurs, but until that's implemented, 4 months seems
	// a good default to not annoy people. That's especially given 80% of
	// Rahvaalgatus' users are on mobile that are single-user devices and where
	// far more personal services never automatically sign out.
	var session = req.session = sessionsDb.read(sql`
		SELECT * FROM sessions
		WHERE token_sha256 = ${sha256(Buffer.from(sessionToken, "hex"))}
		AND created_at > ${DateFns.addDays(new Date, -120)}
		AND deleted_at IS NULL
	`)

	if (session == null) return void next()

	req.user = usersDb.read(session.user_id)
	next()
}
