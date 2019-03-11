var O = require("oolong")
var Db = require("root/lib/sqlite_heaven")
var sqlite = require("root").sqlite
exports = module.exports = new Db(Object, sqlite, "initiative_subscriptions")

exports.idAttribute = "confirmation_token"
exports.idColumn = "confirmation_token"

exports.parse = function(attrs) {
	return O.defaults({
		created_at: attrs.created_at && new Date(attrs.created_at),
		updated_at: attrs.updated_at && new Date(attrs.updated_at),
		confirmed_at: attrs.confirmed_at && new Date(attrs.confirmed_at),

		confirmation_sent_at: attrs.confirmation_sent_at &&
			new Date(attrs.confirmation_sent_at),
	}, attrs)
}
