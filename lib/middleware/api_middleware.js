var api = require("root/lib/api")
var fetchDefaults = require("fetch-defaults")

module.exports = function(req, _res, next) {
	req.api = req.user ?
		fetchDefaults(api, {headers: {Authorization: "Bearer " + req.token}}) :
		api

	next()
}
