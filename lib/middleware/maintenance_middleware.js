var Config = require("root/config")
var HttpError = require("standard-http-error")

module.exports = function(_req, _res, next) {
	if (Config.maintenance) next(new HttpError(503))
	else next()
}
