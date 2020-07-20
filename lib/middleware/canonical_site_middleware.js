var Config = require("root/config")

module.exports = function(req, res, next) {
	if (req.government == null) next()
	else res.redirect(301, Config.url + req.originalUrl)
}
