var O = require("oolong")
var Db = require("root/lib/db")
var sqlite = require("root").sqlite
exports = module.exports = new Db(Object, sqlite, "comments")

exports.parse = function(attrs) {
	return O.defaults({
		created_at: attrs.created_at && new Date(attrs.created_at),
		updated_at: attrs.updated_at && new Date(attrs.updated_at),
		anonymized_at: attrs.anonymized_at && new Date(attrs.anonymized_at)
	}, attrs)
}
