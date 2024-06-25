var _ = require("root/lib/underscore")
var Db = require("root/lib/db")
var {sqlite} = require("root")

exports = module.exports = new Db(
	Object,
	sqlite,
	"initiative_signature_trustees"
)

exports.parse = function(attrs) {
	return _.defaults({
		created_at: attrs.created_at && new Date(attrs.created_at),
		deleted_at: attrs.deleted_at && new Date(attrs.deleted_at)
	}, attrs)
}
