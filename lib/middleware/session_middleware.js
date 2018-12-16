var FetchError = require("fetch-error")
var cosApi = require("root/lib/citizenos_api")
var next = require("co-next")

module.exports = next(function*(req, _res, next) {
	req.user = null
	req.token = null

	if (req.cookies.citizenos_token) {
		try {
			var user = yield cosApi("/api/auth/status", {
				headers: {Authorization: "Bearer " + req.cookies.citizenos_token}
			})

			req.user = user.body.data
			req.token = req.cookies.citizenos_token
		}
		catch (ex) {
			if (ex instanceof FetchError && ex.code === 401);
			else throw ex
		}
	}

	next()
})
