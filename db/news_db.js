var O = require("oolong")
var Db = require("root/lib/db")
var sqlite = require("root").sqlite
exports = module.exports = new Db(Object, sqlite, "news")

exports.parse = function(attrs) {
	return O.defaults({
		published_at: attrs.published_at && new Date(attrs.published_at)
	}, attrs)
}
