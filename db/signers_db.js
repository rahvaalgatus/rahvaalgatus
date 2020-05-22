var _ = require("root/lib/underscore")
var Db = require("root/lib/db")
var sqlite = require("root").sqlite
exports = module.exports = new Db(Object, sqlite, "signers")

exports.parse = function(attrs) {
	return _.defaults({
		first_signed_at: attrs.first_signed_at && new Date(attrs.first_signed_at),
		last_signed_at: attrs.last_signed_at && new Date(attrs.last_signed_at)
	}, attrs)
}
