var _ = require("root/lib/underscore")
var FetchError = require("fetch-error")
var Config = require("root/config")
var cosApi = require("root/lib/citizenos_api")
var cosDb = require("root").cosDb
var next = require("co-next")
var sql = require("sqlate")
var TOKEN_COOKIE_NAME = Config.cookieName

module.exports = next(function*(req, _res, next) {
	req.user = null
	req.token = null

	if (req.cookies[TOKEN_COOKIE_NAME]) {
		try {
			var user = yield cosApi("/api/auth/status", {
				headers: {Authorization: "Bearer " + req.cookies[TOKEN_COOKIE_NAME]}
			})

			req.user = yield cosDb.query(sql`
				SELECT * FROM "Users" WHERE id = ${user.body.data.id}
			`).then(_.first)

			req.token = req.cookies[TOKEN_COOKIE_NAME]
		}
		catch (ex) {
			if (ex instanceof FetchError && ex.code === 401);
			else throw ex
		}
	}

	next()
})
