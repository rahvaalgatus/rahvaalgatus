var _ = require("root/lib/underscore")
var Db = require("root/lib/db")
var MediaType = require("medium-type")
var {sqlite} = require("root")
exports = module.exports = new Db(Object, sqlite, "initiative_files")

exports.parse = function(attrs) {
	return _.defaults({
		created_at: attrs.created_at && new Date(attrs.created_at),
		updated_at: attrs.updated_at && new Date(attrs.updated_at),
		content_type: MediaType.parse(attrs.content_type)
	}, attrs)
}
