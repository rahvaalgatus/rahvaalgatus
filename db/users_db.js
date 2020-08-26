var _ = require("root/lib/underscore")
var Db = require("root/lib/db")
var sqlite = require("root").sqlite
exports = module.exports = new Db(Object, sqlite, "users")

exports.parse = function(attrs) {
	return _.defaults({
		created_at: attrs.created_at && new Date(attrs.created_at),
		updated_at: attrs.updated_at && new Date(attrs.updated_at),

		email_confirmed_at: attrs.email_confirmed_at &&
			new Date(attrs.email_confirmed_at),
		email_confirmation_sent_at: attrs.email_confirmation_sent_at &&
			new Date(attrs.email_confirmation_sent_at)
	}, attrs)
}
