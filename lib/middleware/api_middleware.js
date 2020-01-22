var _ = require("root/lib/underscore")
var Jwt = require("root/lib/jwt")
var Config = require("root/config")
var cosApi = require("root/lib/citizenos_api")
var fetchDefaults = require("fetch-defaults")
var JWT_CONFIG = Config.citizenSession

module.exports = function(req, _res, next) {
	req.cosApi = req.user ? authenticateCitizenApi(cosApi, req.user) : cosApi
	next()
}

function authenticateCitizenApi(api, user) {
	var jwt = Jwt.sign(JWT_CONFIG.jwtAlgorithm, JWT_CONFIG.jwtSecret, 3600, {
		id: _.serializeUuid(user.uuid),
		scope: "all"
	})

	return fetchDefaults(api, {headers: {Authorization: "Bearer " + jwt}})
}
