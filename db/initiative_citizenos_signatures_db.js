var _ = require("root/lib/underscore")
var Db = require("root/lib/db")
var sqlite = require("root").sqlite

exports = module.exports = new Db(
	Object,
	sqlite,
	"initiative_citizenos_signatures"
)

exports.parse = function(attrs) {
	return _.defaults({
		created_at: attrs.created_at && new Date(attrs.created_at)
	}, attrs)
}
