var _ = require("root/lib/underscore")
var Db = require("root/lib/db")
var {sqlite} = require("root")
exports = module.exports = new Db(Object, sqlite, "initiative_coauthors")

exports.parse = function(attrs) {
	return _.defaults({
		created_at: attrs.created_at && new Date(attrs.created_at),
		status_updated_at: attrs.status_updated_at &&
			new Date(attrs.status_updated_at)
	}, attrs)
}
