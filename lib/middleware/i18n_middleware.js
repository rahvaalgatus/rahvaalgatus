var I18n = require("root/lib/i18n")
var Config = require("root/config")
var LANGS = require("root/lib/i18n").STRINGS
var DEFAULT_LANG = Config.language

module.exports = function(req, res, next) {
	var lang = req.cookies.language in LANGS ? req.cookies.language : DEFAULT_LANG
	req.lang = lang
	req.t = res.locals.t = I18n.t.bind(null, lang)
	next()
}
