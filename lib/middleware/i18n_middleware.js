var I18n = require("root/lib/i18n")

module.exports = function(req, res, next) {
	req.lang = "et"
	req.t = res.locals.t = I18n.t.bind(null, "et")
	next()
}
