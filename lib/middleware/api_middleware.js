var cosApi = require("root/lib/citizenos_api")
var fetchDefaults = require("fetch-defaults")

module.exports = function(req, _res, next) {
	req.cosApi = req.user ?
		fetchDefaults(cosApi, {headers: {Authorization: "Bearer " + req.token}}) :
		cosApi

	next()
}
