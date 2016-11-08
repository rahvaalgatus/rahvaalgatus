var FetchError = require("fetch-error")
var api = require("root/lib/citizen_os")
var next = require("co-next")

module.exports = next(function*(req, res, next) {
	if (req.cookies.citizenos_token) {
		try {
			var user = yield api("/api/auth/status", {
				headers: {Authorization: "Bearer " + req.cookies.citizenos_token}
			})

			req.user = user.body.data
		}
		catch (ex) {
			if (ex instanceof FetchError && ex.code === 401);
			else throw ex
		}
	}

	next()
})
