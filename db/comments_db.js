var _ = require("root/lib/underscore")
var Db = require("root/lib/db")
var {sqlite} = require("root")
exports = module.exports = new Db(Object, sqlite, "comments")

exports.parse = function(attrs) {
	return _.defaults({
		created_at: attrs.created_at && new Date(attrs.created_at),
		updated_at: attrs.updated_at && new Date(attrs.updated_at),
		as_admin: Boolean(attrs.as_admin),
		anonymized_at: attrs.anonymized_at && new Date(attrs.anonymized_at)
	}, attrs)
}
