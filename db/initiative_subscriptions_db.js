var O = require("oolong")
var Db = require("heaven-sqlite")
var sqlite = require("root").sqlite
var sql = require("sqlate")
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

exports.searchConfirmedByInitiativeId = function(id) {
	return this.search(sql`
		SELECT * FROM (
			SELECT * FROM initiative_subscriptions
			WHERE (initiative_uuid = ${id} OR initiative_uuid IS NULL)
			AND confirmed_at IS NOT NULL
			ORDER BY initiative_uuid IS NOT NULL, created_at DESC
		)
		GROUP BY email
	`)
}
