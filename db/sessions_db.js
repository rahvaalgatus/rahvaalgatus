var _ = require("root/lib/underscore")
var Db = require("root/lib/db")
var sqlite = require("root").sqlite
exports = module.exports = new Db(Object, sqlite, "sessions")

exports.idAttribute = "token_sha256"
exports.idColumn = "token_sha256"

exports.parse = function(attrs) {
	return _.defaults({
		created_at: attrs.created_at && new Date(attrs.created_at),
		updated_at: attrs.updated_at && new Date(attrs.updated_at),
		deleted_at: attrs.deleted_at && new Date(attrs.deleted_at)
	}, attrs)
}
